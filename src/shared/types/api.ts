/**
 * int64: hermet 以 JSON number 下发 ID, 超出 2^53 的值经无损解析后为字符串
 * ( 见 shared/lib/lossless-json )。使用方须以 String(...) 归一后再比较/展示。
 */
export type Int64 = number | string

/** 后端统一响应信封: {"code": <http status>, "message": "", "data": <any>} */
export interface ApiEnvelope<T> {
  code: number
  message: string
  data: T
}

export interface SignInRequest {
  account: string
  accountType: 'email'
  credential: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface ChannelItem {
  id: Int64
  destination: string
  channelType: 'single' | 'group'
  targetId: Int64
  channelName: string
  channelAvatar: string | null
  isMuted: boolean
  isPinned: boolean
  lastMessageId: Int64 | null
  lastMessageType: string | null
  lastMessageContent: string | null
  lastMessageSenderId: Int64 | null
  lastMessageTime: number | null
  unreadCount: number
  mentionCount: number
}

export interface ContactItem {
  id: Int64
  userId: Int64
  contactId: Int64
  contactNickname: string
  contactAvatar: string | null
  contactGender: string | null
  contactMobile: string | null
  contactInfoVer: number | null
  remarkName: string | null
  source: string | null
  addedAt: number | null
}

export interface MessageSearchItem {
  messageId: string
  conversationId: string
  senderId: Int64
  contentType: string
  sentAt: string
}
