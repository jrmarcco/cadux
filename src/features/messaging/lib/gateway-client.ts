import { GATEWAY_PROTOCOL } from '@shared/config/constants'
import { encodeBase64 } from '@shared/lib/base64'
import { ulid } from 'ulid'
import {
  CommandType,
  type ConversationSyncAckPayload,
  type Frame,
  type InboxMessage,
  type SyncAckPayload,
  normalizeFrame
} from './frame'

export type ClientConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface GatewayClientHandlers {
  onStateChange(state: ClientConnectionState): void
  /** 写扩散条目 ( 单聊 / 小群 ): 内联消息本体 */
  onInboxMessage(message: InboxMessage): void
  /** 读扩散指针 ( 大群 ): 该会话有更新 */
  onConversationUpdate(conversationId: string, latestSeq: number): void
  /** timeline 条目 ( 大群正文 ) */
  onConversationMessage(conversationId: string, conversationSeq: number, message: InboxMessage): void
  /** 收件箱游标推进 ( 用于持久化 ) */
  onInboxEntryApplied(seq: number): void
  /** 会话游标推进 */
  onConversationEntryApplied(conversationId: string, conversationSeq: number): void
  /** 游标早于服务端保留窗口, 调用方应重置本地数据后调用 resync() */
  onCursorExpired(): void
  onUpstreamDelivered(bizId: string): void
  onUpstreamFailed(bizId: string): void
  /** AUTH 失败 ( token 无效 / 过期 ), 不再自动重连 */
  onAuthFailed(): void
}

export interface GatewayClientOptions {
  url: string
  /** 返回可用 token; 实现方负责过期刷新 */
  getToken(): Promise<string>
  getInboxCursor(): number
  getConversationCursor(conversationId: string): number
  handlers: GatewayClientHandlers
}

interface PendingAck {
  resolve: (frame: Frame | null) => void
  timer: ReturnType<typeof setTimeout>
}

/** 帧体解码: base64(JSON) → JSON 原文 双重兼容 */
export function decodePayload<T>(body: string): T {
  if (body.length === 0) return {} as T
  try {
    return JSON.parse(body) as T
  } catch {
    try {
      const binary = atob(body)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return JSON.parse(new TextDecoder().decode(bytes)) as T
    } catch {
      return {} as T
    }
  }
}

function encodePayload(payload: unknown): string {
  return encodeBase64(JSON.stringify(payload ?? null))
}

/**
 * synp 网关客户端:
 * 连接 → 首帧 AUTH → 心跳看门狗 → NOTIFY 驱动 / 主动兜底的游标同步。
 * 协议机制内聚于此类; 游标状态由调用方提供 ( 单一事实源在状态存储 ),
 * 业务副作用全部通过 handlers 上抛。
 */
export class GatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<string, PendingAck>()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private missedHeartbeats = 0
  private reconnectAttempts = 0
  private syncing = false
  private resyncQueued = false
  private upstreamAttempts = new Map<string, number>()
  private state: ClientConnectionState = 'idle'
  private stopped = true

  constructor(private readonly options: GatewayClientOptions) {}

  start(): void {
    this.stopped = false
    this.setState('connecting')
    this.open()
  }

  stop(): void {
    this.stopped = true
    this.clearTimers()
    this.failAllPending()
    this.upstreamAttempts.clear()
    this.closeSocket()
    this.setState('disconnected')
  }

  /** 主动兜底同步 ( 重连后 / 切前台 / 游标重置后 ) */
  resync(): void {
    void this.runSyncLoop()
  }

  syncConversation(conversationId: string): void {
    void this.runConversationSync(conversationId)
  }

  sendUpstream(biz: Record<string, unknown>, bizId: string): void {
    if (!this.isOpen()) {
      this.options.handlers.onUpstreamFailed(bizId)
      return
    }
    this.upstreamAttempts.set(bizId, 1)
    void this.dispatchUpstream(ulid(), biz, bizId)
  }

  // —— 连接 ——

  private open(): void {
    let ws: WebSocket
    try {
      ws = new WebSocket(this.options.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    ws.onopen = () => {
      void this.authenticate()
    }
    ws.onmessage = (event) => {
      this.handleRawFrame(event.data)
    }
    ws.onclose = () => {
      this.failAllPending()
      if (!this.stopped) this.scheduleReconnect()
    }
    ws.onerror = () => {
      // onclose 会紧随触发, 统一在 onclose 处理
    }
  }

  private closeSocket(): void {
    const ws = this.ws
    this.ws = null
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try {
        ws.close(1000)
      } catch {
        // 已关闭时 close 可能抛错, 忽略
      }
    }
  }

  private isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  private async authenticate(): Promise<void> {
    let token: string
    try {
      token = await this.options.getToken()
    } catch {
      this.handleAuthFailure()
      return
    }
    const ack = await this.request(CommandType.AUTH, { token }, GATEWAY_PROTOCOL.AUTH_TIMEOUT_MS)
    const payload = ack ? decodePayload<{ success?: boolean }>(ack.body) : null
    if (this.stopped) return
    if (!payload?.success) {
      this.handleAuthFailure()
      return
    }
    this.reconnectAttempts = 0
    this.missedHeartbeats = 0
    this.setState('connected')
    this.startHeartbeat()
    void this.runSyncLoop()
  }

  private handleAuthFailure(): void {
    this.stopped = true
    this.clearTimers()
    this.failAllPending()
    this.upstreamAttempts.clear()
    this.closeSocket()
    this.setState('disconnected')
    this.options.handlers.onAuthFailed()
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      this.setState('disconnected')
      return
    }
    this.setState('reconnecting')
    this.stopHeartbeat()
    const base = Math.min(
      GATEWAY_PROTOCOL.RECONNECT_MAX_DELAY_MS,
      GATEWAY_PROTOCOL.RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts
    )
    const delay = base + Math.random() * 500
    this.reconnectAttempts += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.open()
    }, delay)
  }

  // —— 心跳 ——

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.missedHeartbeats += 1
      if (this.missedHeartbeats > GATEWAY_PROTOCOL.HEARTBEAT_MISS_LIMIT) {
        // 看门狗: 连续无回显, 主动断开走重连
        this.clearTimers()
        this.closeSocket()
        this.scheduleReconnect()
        return
      }
      this.writeFrame({ commandType: CommandType.HEARTBEAT, messageId: ulid(), body: '' })
    }, GATEWAY_PROTOCOL.HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private clearTimers(): void {
    this.stopHeartbeat()
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // —— 帧收发 ——

  private writeFrame(frame: Frame): void {
    if (this.isOpen()) this.ws?.send(JSON.stringify(frame))
  }

  private sendFrame(commandType: string, payload?: unknown): string {
    const messageId = ulid()
    this.writeFrame({
      commandType,
      messageId,
      body: payload === undefined ? '' : encodePayload(payload)
    })
    return messageId
  }

  private request(commandType: string, payload: unknown, timeoutMs: number): Promise<Frame | null> {
    const messageId = this.sendFrame(commandType, payload)
    return this.awaitAck(messageId, timeoutMs)
  }

  private awaitAck(messageId: string, timeoutMs: number): Promise<Frame | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId)
        resolve(null)
      }, timeoutMs)
      this.pending.set(messageId, { resolve, timer })
    })
  }

  private failAllPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve(null)
    }
    this.pending.clear()
  }

  private handleRawFrame(raw: unknown): void {
    if (typeof raw !== 'string') return
    let frame: Frame | null
    try {
      frame = normalizeFrame(JSON.parse(raw))
    } catch {
      return
    }
    if (!frame) return

    if (frame.commandType === CommandType.HEARTBEAT) {
      this.missedHeartbeats = 0
      return
    }
    if (frame.commandType.endsWith('_ACK')) {
      const pending = this.pending.get(frame.messageId)
      if (pending) {
        this.pending.delete(frame.messageId)
        clearTimeout(pending.timer)
        pending.resolve(frame)
      }
      return
    }

    switch (frame.commandType) {
      case CommandType.NOTIFY: {
        const { latestSeq } = decodePayload<{ latestSeq?: number }>(frame.body)
        if (typeof latestSeq === 'number' && latestSeq > this.options.getInboxCursor()) {
          void this.runSyncLoop()
        }
        break
      }
      default:
        // REDIRECT / RATE_LIMIT_EXCEEDED 当前版本不下发, 忽略
        break
    }
  }

  // —— 上行消息 ——

  private async dispatchUpstream(messageId: string, biz: Record<string, unknown>, bizId: string): Promise<void> {
    if (!this.isOpen()) {
      this.upstreamAttempts.delete(bizId)
      this.options.handlers.onUpstreamFailed(bizId)
      return
    }
    this.writeFrame({ commandType: CommandType.UPSTREAM, messageId, body: encodePayload(biz) })
    const ack = await this.awaitAck(messageId, GATEWAY_PROTOCOL.ACK_TIMEOUT_MS)
    const payload = ack ? decodePayload<{ isSuccess?: boolean }>(ack.body) : null
    if (payload?.isSuccess) {
      this.upstreamAttempts.delete(bizId)
      this.options.handlers.onUpstreamDelivered(bizId)
      return
    }
    // UPSTREAM_ACK 仅表示网关接收; isSuccess=false 常见于网关侧故障, 可原 messageId 重试
    const attempts = this.upstreamAttempts.get(bizId) ?? 0
    if (attempts < GATEWAY_PROTOCOL.UPSTREAM_MAX_RETRIES && !this.stopped) {
      this.upstreamAttempts.set(bizId, attempts + 1)
      void this.dispatchUpstream(messageId, biz, bizId)
      return
    }
    this.upstreamAttempts.delete(bizId)
    this.options.handlers.onUpstreamFailed(bizId)
  }

  // —— 收件箱同步 ——

  private async runSyncLoop(): Promise<void> {
    if (this.stopped) return
    if (this.syncing) {
      this.resyncQueued = true
      return
    }
    this.syncing = true
    try {
      let hasMore = true
      while (hasMore && !this.stopped) {
        hasMore = false
        const cursor = this.options.getInboxCursor()
        const ack = await this.request(
          CommandType.SYNC,
          { cursor, limit: GATEWAY_PROTOCOL.SYNC_PAGE_LIMIT },
          GATEWAY_PROTOCOL.ACK_TIMEOUT_MS
        )
        if (!ack || this.stopped) break
        const payload = decodePayload<SyncAckPayload>(ack.body)
        if (!payload.isSuccess || !payload.response) break

        if (payload.response.cursorExpired) {
          this.options.handlers.onCursorExpired()
          break
        }

        for (const entry of payload.response.entries ?? []) {
          if (entry.seq <= this.options.getInboxCursor()) continue
          if (entry.message) {
            this.options.handlers.onInboxMessage(entry.message)
          } else if (entry.conversationUpdate) {
            this.options.handlers.onConversationUpdate(
              entry.conversationUpdate.conversationId,
              entry.conversationUpdate.conversationLatestSeq
            )
          }
          this.options.handlers.onInboxEntryApplied(entry.seq)
        }
        hasMore = Boolean(payload.response.hasMore)
      }
    } finally {
      this.syncing = false
      if (this.resyncQueued && !this.stopped) {
        this.resyncQueued = false
        void this.runSyncLoop()
      }
    }
  }

  // —— 会话 timeline 同步 ( 大群 ) ——

  private async runConversationSync(conversationId: string): Promise<void> {
    while (!this.stopped) {
      const cursor = this.options.getConversationCursor(conversationId)
      const ack = await this.request(
        CommandType.CONVERSATION_SYNC,
        { conversationId, cursor, limit: GATEWAY_PROTOCOL.SYNC_PAGE_LIMIT },
        GATEWAY_PROTOCOL.ACK_TIMEOUT_MS
      )
      if (!ack || this.stopped) return
      const payload = decodePayload<ConversationSyncAckPayload>(ack.body)
      if (!payload.isSuccess || !payload.response?.messages) return

      for (const item of payload.response.messages) {
        if (item.conversationSeq <= cursor) continue
        this.options.handlers.onConversationMessage(conversationId, item.conversationSeq, item.message)
        this.options.handlers.onConversationEntryApplied(conversationId, item.conversationSeq)
      }
      if (!payload.response.hasMore) return
    }
  }

  private setState(state: ClientConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.options.handlers.onStateChange(state)
  }
}
