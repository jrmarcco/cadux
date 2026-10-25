/** 网关帧指令枚举名 ( synp 文档: 序列化为枚举名字符串 ) */
export const CommandType = {
  HEARTBEAT: 'COMMAND_TYPE_HEARTBEAT',
  AUTH: 'COMMAND_TYPE_AUTH',
  AUTH_ACK: 'COMMAND_TYPE_AUTH_ACK',
  UPSTREAM: 'COMMAND_TYPE_UPSTREAM',
  UPSTREAM_ACK: 'COMMAND_TYPE_UPSTREAM_ACK',
  SYNC: 'COMMAND_TYPE_SYNC',
  SYNC_ACK: 'COMMAND_TYPE_SYNC_ACK',
  CONVERSATION_SYNC: 'COMMAND_TYPE_CONVERSATION_SYNC',
  CONVERSATION_SYNC_ACK: 'COMMAND_TYPE_CONVERSATION_SYNC_ACK',
  NOTIFY: 'COMMAND_TYPE_NOTIFY',
  REDIRECT: 'COMMAND_TYPE_REDIRECT',
  RATE_LIMIT_EXCEEDED: 'COMMAND_TYPE_RATE_LIMIT_EXCEEDED'
} as const

export type CommandTypeValue = (typeof CommandType)[keyof typeof CommandType]

/**
 * 两份服务端文档对 commandType 序列化表述不一致 ( hermet 用数字 / synp 用枚举名 )。
 * 发送端统一用枚举名, 接收端兼容数字。
 */
const NUMERIC_COMMAND_TYPE: Record<number, CommandTypeValue> = {
  1: CommandType.HEARTBEAT,
  2: CommandType.AUTH,
  3: CommandType.AUTH_ACK,
  4: CommandType.UPSTREAM,
  5: CommandType.UPSTREAM_ACK,
  6: CommandType.SYNC,
  7: CommandType.SYNC_ACK,
  8: CommandType.CONVERSATION_SYNC,
  9: CommandType.CONVERSATION_SYNC_ACK,
  10: CommandType.NOTIFY,
  11: CommandType.REDIRECT,
  12: CommandType.RATE_LIMIT_EXCEEDED
}

export interface Frame {
  commandType: string
  messageId: string
  body: string
}

export function normalizeFrame(raw: unknown): Frame | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as { commandType?: unknown; messageId?: unknown; body?: unknown }
  if (typeof record.messageId !== 'string' || record.messageId.length === 0) return null

  let commandType: string | null = null
  if (typeof record.commandType === 'string' && record.commandType.length > 0) {
    commandType = record.commandType
  } else if (typeof record.commandType === 'number') {
    commandType = NUMERIC_COMMAND_TYPE[record.commandType] ?? null
  }
  if (commandType === null) return null

  return {
    commandType,
    messageId: record.messageId,
    body: typeof record.body === 'string' ? record.body : ''
  }
}

// —— 帧体 ( 解码后 ) 类型 ——

export interface AuthAckPayload {
  success?: boolean
  errorMessage?: string
}

export interface UpstreamAckPayload {
  isSuccess?: boolean
  timestampMs?: number
  errorMessage?: string
}

export interface InboxMessage {
  conversationId: string
  messageId: string
  /** protojson int64 → 序列化为字符串 */
  senderId: number | string
  body: string
  sentAt: string
}

export interface SyncEntry {
  seq: number
  message?: InboxMessage
  conversationUpdate?: { conversationId: string; conversationLatestSeq: number }
}

export interface SyncResponse {
  entries?: SyncEntry[]
  latestSeq?: number
  hasMore?: boolean
  cursorExpired?: boolean
}

export interface SyncAckPayload {
  isSuccess?: boolean
  errorMessage?: string
  response?: SyncResponse
}

export interface ConversationTimelineMessage {
  conversationSeq: number
  message: InboxMessage
}

export interface ConversationSyncResponse {
  messages?: ConversationTimelineMessage[]
  latestSeq?: number
  hasMore?: boolean
}

export interface ConversationSyncAckPayload {
  isSuccess?: boolean
  errorMessage?: string
  response?: ConversationSyncResponse
}

export interface NotifyPayload {
  latestSeq?: number
}
