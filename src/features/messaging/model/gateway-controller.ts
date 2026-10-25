import { refreshAccessToken } from '@shared/api/http-client'
import { getAuthBridge } from '@shared/api/auth-bridge'
import { GATEWAY_DEVICE, GATEWAY_WS_URL } from '@shared/config/env'
import { isTokenExpired, extractUserId } from '@shared/lib/jwt'
import type { ChannelType, ConversationKey, UpstreamBizPayload } from '@entities/conversation'
import { normalizeConversationKey, parseConversationKey, singleChatPeerId } from '@entities/conversation'
import { ulid } from 'ulid'
import { useAuthStore } from '@features/user-auth'
import { GatewayClient, type ClientConnectionState } from '../lib/gateway-client'
import { toChatMessage } from '../lib/biz-body'
import { useActiveConversationStore } from './active-conversation'
import { messagingEvents } from './events'
import { useMessagingStore } from './messaging-store'

let client: GatewayClient | null = null

/** 当前用户 ID: 优先取 store, 否则从 JWT 解析并回填 */
export function currentSelfId(): number | null {
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
  if (client) return
  const accessToken = useAuthStore.getState().accessToken
  if (!accessToken) return

  const store = useMessagingStore.getState()
  store.setConnection('connecting')

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
        const message = toChatMessage(inbox, normalizeConversationKey(inbox.conversationId))
        useMessagingStore.getState().applyIncomingMessage(message, {
          selfId: currentSelfId(),
          activeKey: useActiveConversationStore.getState().activeKey
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
}

export function stopMessaging(): void {
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
  const channelType: ChannelType = session?.channelType ?? parsed.channelType

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
    senderId: selfId ?? 0,
    content: trimmed,
    contentType: 'text' as const,
    sentAtMs: Date.now(),
    status: 'pending' as const
  }
  store.addPendingMessage(message)

  const biz: UpstreamBizPayload = {
    id: bizId,
    sid: selfId ?? undefined,
    destinationId,
    destinationType: channelType,
    content: trimmed,
    contentType: 'text'
  }
  if (client) {
    client.sendUpstream(biz as unknown as Record<string, unknown>, bizId)
  } else {
    useMessagingStore.getState().markMessageFailed(bizId)
  }
}
