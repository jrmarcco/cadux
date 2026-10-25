import { GATEWAY_PROTOCOL } from '@shared/config/constants'
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
  return encodeBase64Text(JSON.stringify(payload ?? null))
}

function encodeBase64Text(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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
  /** 事件环形日志 ( dev 调试观测用, 最近 60 条 ) */
  private trace: string[] = []

  private log(event: string): void {
    this.trace.push(`${Date.now() % 100000} ${event}`)
    if (this.trace.length > 60) this.trace.shift()
  }

  constructor(private readonly options: GatewayClientOptions) {}

  start(): void {
    this.stopped = false
    this.log('start')
    this.setState('connecting')
    this.open()
  }

  stop(): void {
    this.log('stop')
    this.stopped = true
    this.clearTimers()
    this.failAllPending()
    this.upstreamAttempts.clear()
    this.closeSocket('stop')
    this.setState('disconnected')
  }

  /** 主动兜底同步 ( 重连后 / 切前台 / 游标重置后 ) */
  resync(): void {
    void this.runSyncLoop()
  }

  syncConversation(conversationId: string): void {
    void this.runConversationSync(conversationId)
  }

  /**
   * 发送业务消息。bodyJson 须由 encodeUpstreamBody 生成
   * ( destinationId 为 int64, 需要精确数字字面量注入, 不能经 Number 序列化 )。
   * 返回帧 ID: 实测 hermet 落库的 message_id 即该帧 ID ( 非 body.id ),
   * 自身收件回显据此与 pending 消息合并; 连接不可用返回 null。
   */
  sendUpstream(bodyJson: string, bizId: string): string | null {
    if (!this.isOpen()) {
      this.options.handlers.onUpstreamFailed(bizId)
      return null
    }
    const frameId = ulid()
    this.upstreamAttempts.set(bizId, 1)
    void this.dispatchUpstream(frameId, bodyJson, bizId)
    return frameId
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
    this.log(`open wsState=${ws.readyState}`)
    this.ws = ws
    ws.onopen = () => {
      this.log('onopen → auth')
      void this.authenticate()
    }
    ws.onmessage = (event: MessageEvent<unknown>) => {
      // 实测 ( 2026-10-25 ): synp 下行帧为二进制帧 ( payload 是 JSON 文本 ),
      // 浏览器 WebSocket 以 Blob 投递 ( Node 为 Blob、字符串混投 ), 统一收敛为文本
      const data = event.data
      if (typeof data === 'string') {
        this.handleRawFrame(data)
        return
      }
      if (data instanceof Blob) {
        void data.text().then((text) => this.handleRawFrame(text))
        return
      }
      if (data instanceof ArrayBuffer) {
        this.handleRawFrame(new TextDecoder().decode(data))
      }
    }
    ws.onclose = (ev) => {
      this.log(`onclose code=${ev.code} wasClean=${ev.wasClean}`)
      this.failAllPending()
      if (!this.stopped) this.scheduleReconnect()
    }
    ws.onerror = () => {
      // onclose 会紧随触发, 统一在 onclose 处理
    }
  }

  private closeSocket(reason: string): void {
    this.log(`closeSocket ${reason}`)
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
    // 实测 ( 2026-10-25 ): 存在同设备旧连接时, 网关踢旧的瞬间新连接的 AUTH_ACK
    // 可能丢失 ( 网关日志 "failed to send message: connection closed" )。
    // 协议规定重复 AUTH 幂等 → 在同一连接上重发 AUTH 收敛, 而不是断线重连。
    let ack: Frame | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.stopped || !this.isOpen()) break
      ack = await this.request(CommandType.AUTH, { token }, GATEWAY_PROTOCOL.ACK_TIMEOUT_MS)
      if (ack || this.stopped) break
      this.log(`auth-retry attempt=${attempt + 1}`)
    }
    if (this.stopped) return
    if (!ack) {
      // 重试耗尽: 连接在鉴权期间断开 ( 顶号 / 网络抖动 / 宿主挂起 ) 时
      // 不能据此判定凭证失效, 交由重连流程重新 AUTH; 连接仍在则主动触发重连
      if (this.isOpen()) {
        this.closeSocket('ack-timeout')
        this.scheduleReconnect()
      }
      return
    }
    const payload = decodePayload<{ success?: boolean }>(ack.body)
    if (!payload?.success) {
      this.log(`auth-ack success=${String(payload?.success)}`)
      this.handleAuthFailure()
      return
    }
    this.log('auth-ok')
    this.reconnectAttempts = 0
    this.missedHeartbeats = 0
    this.setState('connected')
    this.startHeartbeat()
    void this.runSyncLoop()
  }

  private handleAuthFailure(): void {
    this.log('auth-failure')
    this.stopped = true
    this.clearTimers()
    this.failAllPending()
    this.upstreamAttempts.clear()
    this.closeSocket('auth-failure')
    this.setState('disconnected')
    this.options.handlers.onAuthFailed()
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
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
    this.log(`schedule-reconnect delay=${Math.round(delay)}`)
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
        this.log('watchdog-reconnect')
        this.clearTimers()
        this.closeSocket('watchdog')
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
      this.log(`recv ${frame.commandType} matched=${Boolean(pending)}`)
      if (pending) {
        this.pending.delete(frame.messageId)
        clearTimeout(pending.timer)
        pending.resolve(frame)
      }
      return
    }

    switch (frame.commandType) {
      case CommandType.NOTIFY: {
        // 实测: protojson 将 int64 latestSeq 序列化为字符串, 统一收敛为 number
        const { latestSeq } = decodePayload<{ latestSeq?: number | string }>(frame.body)
        const seq = Number(latestSeq)
        if (Number.isFinite(seq) && seq > this.options.getInboxCursor()) {
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

  private async dispatchUpstream(messageId: string, bodyJson: string, bizId: string): Promise<void> {
    if (!this.isOpen()) {
      this.upstreamAttempts.delete(bizId)
      this.options.handlers.onUpstreamFailed(bizId)
      return
    }
    this.writeFrame({ commandType: CommandType.UPSTREAM, messageId, body: encodeBase64Text(bodyJson) })
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
      void this.dispatchUpstream(messageId, bodyJson, bizId)
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
          // 实测: seq 为 protojson int64 → 字符串, 收敛为 number 再比较与推进游标
          const seq = Number(entry.seq)
          if (!Number.isFinite(seq) || seq <= this.options.getInboxCursor()) continue
          if (entry.message) {
            this.options.handlers.onInboxMessage(entry.message)
          } else if (entry.conversationUpdate) {
            this.options.handlers.onConversationUpdate(
              entry.conversationUpdate.conversationId,
              Number(entry.conversationUpdate.conversationLatestSeq)
            )
          }
          this.options.handlers.onInboxEntryApplied(seq)
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
        // 实测: conversationSeq 为 protojson int64 → 字符串, 收敛为 number
        const conversationSeq = Number(item.conversationSeq)
        if (!Number.isFinite(conversationSeq) || conversationSeq <= cursor) continue
        this.options.handlers.onConversationMessage(conversationId, conversationSeq, item.message)
        this.options.handlers.onConversationEntryApplied(conversationId, conversationSeq)
      }
      if (!payload.response.hasMore) return
    }
  }

  /** 调试观测: 当前连接状态快照 ( window.__caduxDebug 使用 ) */
  debugSnapshot(): {
    state: ClientConnectionState
    wsState: number
    reconnectAttempts: number
    trace: string[]
  } {
    return {
      state: this.state,
      wsState: this.ws?.readyState ?? -1,
      reconnectAttempts: this.reconnectAttempts,
      trace: [...this.trace]
    }
  }

  private setState(state: ClientConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.options.handlers.onStateChange(state)
  }
}
