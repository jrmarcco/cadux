import { create } from 'zustand'
import type { ChatMessage, ConversationKey, SessionSummary } from '@entities/conversation'
import { parseConversationKey } from '@entities/conversation'
import { useAuthStore } from '@features/user-auth'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export interface IncomingContext {
  selfId: number | null
  activeKey: ConversationKey | null
}

interface MessagingState {
  connection: ConnectionState
  inboxCursor: number
  conversationCursors: Record<string, number>
  sessions: Record<ConversationKey, SessionSummary>
  messages: Record<ConversationKey, ChatMessage[]>
  /** bizId → 会话 key, 用于 UPSTREAM 回执定位 pending 消息 */
  pendingMap: Record<string, ConversationKey>
  setConnection: (state: ConnectionState) => void
  setInboxCursor: (seq: number) => void
  setConversationCursor: (conversationId: string, seq: number) => void
  upsertSessions: (sessions: SessionSummary[]) => void
  addPendingMessage: (message: ChatMessage) => void
  applyIncomingMessage: (message: ChatMessage, context: IncomingContext) => void
  applyConversationMessage: (message: ChatMessage) => void
  markMessageSent: (bizId: string) => void
  markMessageFailed: (bizId: string) => void
  markSessionRead: (key: ConversationKey) => void
  removeMessage: (key: ConversationKey, id: string) => void
  /** cursorExpired: 重置收件箱数据, 重新全量同步 */
  resetInbox: () => void
  resetAll: () => void
}

function fallbackSession(message: ChatMessage): SessionSummary {
  const { channelType, numericIds } = parseConversationKey(message.conversationKey)
  const targetId = numericIds.length > 0 ? numericIds[numericIds.length - 1] : null
  const name = channelType === 'group' ? `群聊 ${targetId ?? ''}` : `用户 ${targetId ?? message.senderId}`
  return {
    key: message.conversationKey,
    channelType,
    targetId,
    name,
    avatar: null,
    isMuted: false,
    isPinned: false,
    lastMessage: {
      content: message.content,
      senderId: message.senderId,
      contentType: message.contentType,
      sentAtMs: message.sentAtMs
    },
    unreadCount: 0,
    mentionCount: 0
  }
}

export const useMessagingStore = create<MessagingState>()((set, get) => ({
  connection: 'idle',
  inboxCursor: 0,
  conversationCursors: {},
  sessions: {},
  messages: {},
  pendingMap: {},

  setConnection: (state) => set({ connection: state }),

  setInboxCursor: (seq) => set((state) => ({ inboxCursor: Math.max(state.inboxCursor, seq) })),

  setConversationCursor: (conversationId, seq) =>
    set((state) => ({
      conversationCursors: {
        ...state.conversationCursors,
        [conversationId]: Math.max(state.conversationCursors[conversationId] ?? 0, seq)
      }
    })),

  upsertSessions: (incoming) =>
    set((state) => {
      const sessions = { ...state.sessions }
      for (const session of incoming) {
        const existing = sessions[session.key]
        if (!existing) {
          sessions[session.key] = session
          continue
        }
        // 静态信息以服务端为准; WS 事件产生的更新 ( 未读 / 预览 ) 仅在本地没有更新内容时采用服务端
        const localNewer = (existing.lastMessage?.sentAtMs ?? 0) > (session.lastMessage?.sentAtMs ?? 0)
        sessions[session.key] = {
          ...session,
          unreadCount: localNewer ? existing.unreadCount : session.unreadCount,
          lastMessage: localNewer ? existing.lastMessage : session.lastMessage
        }
      }
      return { sessions }
    }),

  addPendingMessage: (message) =>
    set((state) => {
      const list = state.messages[message.conversationKey] ?? []
      const sessions = { ...state.sessions }
      const existing = sessions[message.conversationKey]
      const preview = {
        content: message.content,
        senderId: message.senderId,
        contentType: message.contentType,
        sentAtMs: message.sentAtMs
      }
      sessions[message.conversationKey] = existing ? { ...existing, lastMessage: preview } : fallbackSession(message)
      return {
        messages: { ...state.messages, [message.conversationKey]: [...list, message] },
        sessions,
        pendingMap: { ...state.pendingMap, [message.id]: message.conversationKey }
      }
    }),

  applyIncomingMessage: (message, context) =>
    set((state) => {
      const key = message.conversationKey
      const list = state.messages[key] ?? []
      const matchIndex = list.findIndex(
        (item) => item.id === message.id || (message.localId !== null && item.localId === message.localId)
      )
      const next =
        matchIndex >= 0 ? list.map((item, index) => (index === matchIndex ? message : item)) : [...list, message]

      const isSelf = context.selfId !== null && message.senderId === context.selfId
      const shouldCountUnread = !isSelf && context.activeKey !== key

      const sessions = { ...state.sessions }
      const existing = sessions[key]
      const preview = {
        content: message.content,
        senderId: message.senderId,
        contentType: message.contentType,
        sentAtMs: message.sentAtMs
      }
      sessions[key] = existing
        ? {
            ...existing,
            lastMessage: preview,
            unreadCount: existing.unreadCount + (shouldCountUnread ? 1 : 0)
          }
        : {
            ...fallbackSession(message),
            unreadCount: shouldCountUnread ? 1 : 0
          }

      const pendingMap = { ...state.pendingMap }
      if (message.localId !== null) delete pendingMap[message.localId]
      delete pendingMap[message.id]

      return { messages: { ...state.messages, [key]: next }, sessions, pendingMap }
    }),

  applyConversationMessage: (message) =>
    set((state) => {
      const key = message.conversationKey
      const list = state.messages[key] ?? []
      if (list.some((item) => item.id === message.id)) return state
      return { messages: { ...state.messages, [key]: [...list, message] } }
    }),

  markMessageSent: (bizId) => {
    const state = get()
    const key = state.pendingMap[bizId]
    if (!key) return
    set((current) => {
      const list = current.messages[key] ?? []
      return {
        messages: {
          ...current.messages,
          [key]: list.map((item) => (item.id === bizId ? { ...item, status: 'sent' } : item))
        },
        pendingMap: (() => {
          const next = { ...current.pendingMap }
          delete next[bizId]
          return next
        })()
      }
    })
  },

  markMessageFailed: (bizId) => {
    const state = get()
    const key = state.pendingMap[bizId]
    if (!key) return
    set((current) => {
      const list = current.messages[key] ?? []
      return {
        messages: {
          ...current.messages,
          [key]: list.map((item) => (item.id === bizId ? { ...item, status: 'failed' } : item))
        },
        pendingMap: (() => {
          const next = { ...current.pendingMap }
          delete next[bizId]
          return next
        })()
      }
    })
  },

  markSessionRead: (key) =>
    set((state) => {
      const existing = state.sessions[key]
      if (!existing || existing.unreadCount === 0) return state
      return {
        sessions: { ...state.sessions, [key]: { ...existing, unreadCount: 0, mentionCount: 0 } }
      }
    }),

  removeMessage: (key, id) =>
    set((state) => {
      const list = state.messages[key] ?? []
      if (!list.some((item) => item.id === id)) return state
      return { messages: { ...state.messages, [key]: list.filter((item) => item.id !== id) } }
    }),

  resetInbox: () => set({ inboxCursor: 0, conversationCursors: {}, messages: {}, pendingMap: {} }),

  resetAll: () =>
    set({
      connection: 'idle',
      inboxCursor: 0,
      conversationCursors: {},
      sessions: {},
      messages: {},
      pendingMap: {}
    })
}))

/** 标记会话已读 ( 清零未读 ) */
export function markSessionRead(key: ConversationKey): void {
  useMessagingStore.getState().markSessionRead(key)
}

/** 登出 / 登录态被清空时重置本地消息数据 ( 订阅 auth, 避免反向依赖方向混乱 ) */
useAuthStore.subscribe((state, previous) => {
  if (previous.accessToken !== null && state.accessToken === null) {
    useMessagingStore.getState().resetAll()
  }
})
