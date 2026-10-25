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
  id: number
  destination: string
  channelType: 'single' | 'group'
  targetId: number
  channelName: string
  channelAvatar: string | null
  isMuted: boolean
  isPinned: boolean
  lastMessageId: number | null
  lastMessageType: string | null
  lastMessageContent: string | null
  lastMessageSenderId: number | null
  lastMessageTime: number | null
  unreadCount: number
  mentionCount: number
}

export interface ContactItem {
  id: number
  userId: number
  contactId: number
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
  senderId: number
  contentType: string
  sentAt: string
}
