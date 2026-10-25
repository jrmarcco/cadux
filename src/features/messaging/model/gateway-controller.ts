import { refreshAccessToken } from '@shared/api/http-client'
import { getAuthBridge } from '@shared/api/auth-bridge'
import { GATEWAY_DEVICE, GATEWAY_WS_URL } from '@shared/config/env'
import { isTokenExpired, extractUserId } from '@shared/lib/jwt'
import type { ConversationKey, UpstreamBizPayload } from '@entities/conversation'
import { normalizeConversationKey, parseConversationKey, singleChatPeerId } from '@entities/conversation'
import { ulid } from 'ulid'
import { useAuthStore } from '@features/user-auth'
import { GatewayClient, type ClientConnectionState } from '../lib/gateway-client'
import { encodeUpstreamBody, toChatMessage } from '../lib/biz-body'
import { useActiveConversationStore } from './active-conversation'
import { messagingEvents } from './events'
import { useMessagingStore } from './messaging-store'

let client: GatewayClient | null = null

/** dev 生命周期追踪: 记录 start/stop 调用栈 ( window.__caduxDebug 暴露 ) */
const lifecycleLog: string[] = []

function pushLifecycle(event: string): void {
  const stack = (new Error().stack ?? '').split('\n').slice(2, 5).join(' ← ')
  lifecycleLog.push(`${Date.now() % 100000} ${event}: ${stack}`)
  if (lifecycleLog.length > 30) lifecycleLog.shift()
}

/** 当前用户 ID ( 十进制字符串 ): 优先取 store, 否则从 JWT 无损解析并回填 */
export function currentSelfId(): string | null {
  const state = useAuthStore.getState()
  if (state.userId !== null) return state.userId
  if (state.accessToken) {
    const userId = extractUserId(state.accessToken)
    if (userId !== null) {
      state.setUserId(userId)
      return userId
    }
  }
  return null
}

/**
 * 启动通信引擎 ( 幂等 )。连接 → AUTH → 心跳 → 同步 全部由 GatewayClient 驱动,
 * 这里负责把协议事件落到状态存储, 并在 token 过期时先行刷新。
 */
export function startMessaging(): void {
  pushLifecycle(client ? 'start(skipped, already-running)' : 'start')
  if (client) return
  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) return

  const store = useMessagingStore.getState()
  store.setConnection('connecting')
  /** 引擎启动时刻: 早于该时刻 ( 容忍 5s 钟差 ) 的消息视为历史, 不计未读 */
  const liveSinceMs = Date.now() - 5_000
  // 尽早从 JWT 回填 userId ( auth store 不再持久化 userId, 页面刷新后为 null )
  currentSelfId()

  client = new GatewayClient({
    url: `${GATEWAY_WS_URL}?device=${GATEWAY_DEVICE}`,
    getToken: async () => {
      const token = useAuthStore.getState().accessToken
      if (!token) throw new Error('缺少 accessToken')
      if (isTokenExpired(token)) {
        await refreshAccessToken()
        const fresh = useAuthStore.getState().accessToken
        if (!fresh) throw new Error('刷新 token 失败')
        return fresh
      }
      return token
    },
    getInboxCursor: () => useMessagingStore.getState().inboxCursor,
    getConversationCursor: (conversationId) => useMessagingStore.getState().conversationCursors[conversationId] ?? 0,
    handlers: {
      onStateChange: (state: ClientConnectionState) => {
        useMessagingStore.getState().setConnection(state)
        if (state === 'connected') messagingEvents.emit({ type: 'connected' })
        if (state === 'reconnecting' || state === 'disconnected') {
          messagingEvents.emit({ type: 'disconnected' })
        }
      },
      onInboxMessage: (inbox) => {
        const store = useMessagingStore.getState()

        // 发送失败回执 ( send_failed ): 按 upstreamId 关联本地 pending, 标记可重试
        if (inbox.conversationId.length === 0) {
          // B-14 ( 见 docs/backend-issues-2610252229.md ): invalid_destination 场景
          // 系统条目 conversationId 为空串, 回落到失败 pending 所在会话
          const preview = toChatMessage(inbox, '')
          const bizId = preview.systemUpstreamId ? store.frameMap[preview.systemUpstreamId] : undefined
          const fallbackKey = bizId !== undefined ? store.pendingMap[bizId] : undefined
          if (bizId === undefined || fallbackKey === undefined) return
          preview.conversationKey = fallbackKey
          store.releaseFrame(preview.systemUpstreamId as string)
          store.markMessageFailed(bizId)
          store.applyIncomingMessage(preview, {
            selfId: currentSelfId(),
            activeKey: useActiveConversationStore.getState().activeKey,
            countUnread: false
          })
          return
        }

        const message = toChatMessage(inbox, normalizeConversationKey(inbox.conversationId))
        if (message.contentType === 'system' && message.systemUpstreamId !== undefined) {
          const bizId = store.frameMap[message.systemUpstreamId]
          if (bizId !== undefined) {
            store.releaseFrame(message.systemUpstreamId)
            store.markMessageFailed(bizId)
          }
        } else {
          // hermet 落库 message_id = UPSTREAM 帧 ID: 命中说明是自身回显, 借此与 pending 合并
          const bizId = store.frameMap[inbox.messageId]
          if (bizId !== undefined) {
            message.localId = bizId
            store.releaseFrame(inbox.messageId)
          }
        }
        store.applyIncomingMessage(message, {
          selfId: currentSelfId(),
          activeKey: useActiveConversationStore.getState().activeKey,
          countUnread: message.contentType === 'system' ? false : message.sentAtMs >= liveSinceMs
        })
      },
      onConversationUpdate: (conversationId, latestSeq) => {
        const normalized = normalizeConversationKey(conversationId)
        const current = useMessagingStore.getState().conversationCursors[normalized] ?? 0
        if (latestSeq > current) client?.syncConversation(normalized)
      },
      onConversationMessage: (conversationId, _conversationSeq, inbox) => {
        const message = toChatMessage(inbox, normalizeConversationKey(conversationId))
        useMessagingStore.getState().applyConversationMessage(message)
      },
      onInboxEntryApplied: (seq) => {
        useMessagingStore.getState().setInboxCursor(seq)
      },
      onConversationEntryApplied: (conversationId, conversationSeq) => {
        useMessagingStore.getState().setConversationCursor(conversationId, conversationSeq)
      },
      onCursorExpired: () => {
        useMessagingStore.getState().resetInbox()
        client?.resync()
      },
      onUpstreamDelivered: (bizId) => {
        useMessagingStore.getState().markMessageSent(bizId)
      },
      onUpstreamFailed: (bizId) => {
        useMessagingStore.getState().markMessageFailed(bizId)
      },
      onAuthFailed: () => {
        stopMessaging()
        getAuthBridge()?.onAuthLost()
      }
    }
  })

  client.start()

  // dev 调试观测点: 浏览器控制台 / E2E 可读当前引擎状态
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__caduxDebug = {
      snapshot: () => {
        const state = useMessagingStore.getState()
        return {
          client: client?.debugSnapshot() ?? null,
          connection: state.connection,
          inboxCursor: state.inboxCursor,
          selfId: currentSelfId(),
          activeKey: useActiveConversationStore.getState().activeKey,
          sessionCount: Object.keys(state.sessions).length,
          // 活跃会话最近 5 条 ( 诊断回显合并用 )
          activeMessages:
            useActiveConversationStore.getState().activeKey === null
              ? []
              : (state.messages[useActiveConversationStore.getState().activeKey as string] ?? []).slice(-5),
          lifecycle: [...lifecycleLog]
        }
      }
    }
  }
}

export function stopMessaging(): void {
  pushLifecycle(client ? 'stop' : 'stop(skipped, not-running)')
  client?.stop()
  client = null
}

export function isMessagingStarted(): boolean {
  return client !== null
}

/** 发送文本消息: 乐观插入 pending, 由 UPSTREAM 回执 / 自身收件回推收敛状态 */
export function sendTextMessage(key: ConversationKey, content: string): void {
  const trimmed = content.trim()
  if (trimmed.length === 0) return

  const store = useMessagingStore.getState()
  const session = store.sessions[key]
  const selfId = currentSelfId()
  const parsed = parseConversationKey(key)
  const channelType = session?.channelType ?? parsed.channelType

  const destinationId =
    channelType === 'group'
      ? (session?.targetId ?? parsed.numericIds[0] ?? null)
      : (session?.targetId ?? singleChatPeerId(key, selfId))
  if (destinationId === null) {
    return
  }

  const bizId = ulid()
  const message = {
    id: bizId,
    localId: bizId,
    conversationKey: key,
    senderId: selfId ?? '',
    content: trimmed,
    contentType: 'text' as const,
    sentAtMs: Date.now(),
    status: 'pending' as const
  }
  store.addPendingMessage(message)

  // destinationId 为 int64: 必须以精确数字字面量序列化 ( 见 encodeUpstreamBody )
  const biz: UpstreamBizPayload = {
    id: bizId,
    destinationId,
    destinationType: channelType,
    content: trimmed,
    contentType: 'text'
  }
  if (client) {
    try {
      const frameId = client.sendUpstream(encodeUpstreamBody(biz), bizId)
      if (frameId !== null) useMessagingStore.getState().registerFrame(frameId, bizId)
    } catch {
      useMessagingStore.getState().markMessageFailed(bizId)
    }
  } else {
    useMessagingStore.getState().markMessageFailed(bizId)
  }
}
