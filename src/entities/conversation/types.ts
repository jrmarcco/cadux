export type ChannelType = 'single' | 'group'

/**
 * 规范会话 ID ( 与网关 conversationId 一致 ):
 * 单聊 s:<minUid>:<maxUid>, 群聊 g:<groupId>
 * ID 段为十进制字符串 ( int64, 见 entities/user/types )
 */
export type ConversationKey = string

/** 会话列表条目 ( 本地组织形态, 由服务端 channel + WS 事件合并而来 ) */
export interface SessionSummary {
  key: ConversationKey
  channelType: ChannelType
  targetId: string | null
  name: string
  avatar: string | null
  isMuted: boolean
  isPinned: boolean
  lastMessage: {
    content: string
    senderId: string | null
    contentType: string
    sentAtMs: number
  } | null
  unreadCount: number
  mentionCount: number
}

export type MessageContentType = 'text' | 'image' | 'system'
export type MessageStatus = 'pending' | 'sent' | 'failed'

/** 渲染层消息 ( 协议无关, 由收件箱 / timeline 条目归一化而来 ) */
export interface ChatMessage {
  /** 服务端 messageId; pending 阶段为本地生成的业务 ID */
  id: string
  /** 发送前本地占位 ID ( 业务 body.id ), 用于和自身收件回执合并 */
  localId: string | null
  conversationKey: ConversationKey
  senderId: string
  content: string
  contentType: MessageContentType
  sentAtMs: number
  status: MessageStatus
  /** send_failed 系统回执关联的 UPSTREAM 帧 ID ( 仅 contentType=system ) */
  systemUpstreamId?: string
}

/** UPSTREAM 帧业务 body ( 网关不解释结构, backend 按此读取目的地与内容 ) */
export interface UpstreamBizPayload {
  /** 前端本地消息 ID, 用于多端自同步时合并 */
  id: string
  /** 单聊=对方 userId; 群聊=groupId ( 十进制字符串, 序列化时以数字字面量注入 ) */
  destinationId: string
  destinationType: ChannelType
  content: string
  contentType: MessageContentType
}
