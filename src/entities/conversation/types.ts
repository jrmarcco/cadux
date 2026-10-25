export type ChannelType = 'single' | 'group'

/**
 * 规范会话 ID ( 与网关 conversationId 一致 ):
 * 单聊 s:<minUid>:<maxUid>, 群聊 g:<groupId>
 */
export type ConversationKey = string

/** 会话列表条目 ( 本地组织形态, 由服务端 channel + WS 事件合并而来 ) */
export interface SessionSummary {
  key: ConversationKey
  channelType: ChannelType
  targetId: number | null
  name: string
  avatar: string | null
  isMuted: boolean
  isPinned: boolean
  lastMessage: {
    content: string
    senderId: number | null
    contentType: string
    sentAtMs: number
  } | null
  unreadCount: number
  mentionCount: number
}

export type MessageContentType = 'text' | 'image'
export type MessageStatus = 'pending' | 'sent' | 'failed'

/** 渲染层消息 ( 协议无关, 由收件箱 / timeline 条目归一化而来 ) */
export interface ChatMessage {
  /** 服务端 messageId; pending 阶段为本地生成的业务 ID */
  id: string
  /** 发送前本地占位 ID ( 业务 body.id ), 用于和自身收件回执合并 */
  localId: string | null
  conversationKey: ConversationKey
  senderId: number
  content: string
  contentType: MessageContentType
  sentAtMs: number
  status: MessageStatus
}

/** UPSTREAM 帧业务 body ( 网关不解释结构, backend 按此读取目的地与内容 ) */
export interface UpstreamBizPayload {
  /** 前端本地消息 ID, 用于多端自同步时合并 */
  id?: string
  /** 仅展示用途, 服务端以盖章身份为准 */
  sid?: number
  destinationId: number
  destinationType: ChannelType
  content: string
  contentType: MessageContentType
}
