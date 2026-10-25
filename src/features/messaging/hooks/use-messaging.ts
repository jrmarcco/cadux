import { useCallback, useEffect, useMemo } from 'react'
import type { ChatMessage, ConversationKey, SessionSummary } from '@entities/conversation'
import { useAuthStore } from '@features/user-auth'
import { useActiveConversationStore } from '../model/active-conversation'
import { messagingEvents } from '../model/events'
import { sendTextMessage, startMessaging, stopMessaging } from '../model/gateway-controller'
import { markSessionRead, useMessagingStore, type ConnectionState } from '../model/messaging-store'

export type { ConnectionState }
export { markSessionRead, messagingEvents }

function compareSessions(a: SessionSummary, b: SessionSummary): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  const timeA = a.lastMessage?.sentAtMs ?? 0
  const timeB = b.lastMessage?.sentAtMs ?? 0
  return timeB - timeA
}

export function useConnectionState(): ConnectionState {
  return useMessagingStore((state) => state.connection)
}

export function useConversations(): SessionSummary[] {
  const sessions = useMessagingStore((state) => state.sessions)
  return useMemo(() => Object.values(sessions).sort(compareSessions), [sessions])
}

export function useSession(key: ConversationKey | null): SessionSummary | null {
  return useMessagingStore((state) => (key !== null ? (state.sessions[key] ?? null) : null))
}

/** 稳定的空数组引用: selector 快照必须是同一引用, 否则触发 React 无限更新 */
const EMPTY_MESSAGES: ChatMessage[] = []

export function useMessages(key: ConversationKey | null): ChatMessage[] {
  return useMessagingStore((state) => (key !== null ? (state.messages[key] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES))
}

export function useUnreadTotal(): number {
  return useMessagingStore((state) =>
    Object.values(state.sessions).reduce((total, session) => {
      if (session.isMuted) return total
      return total + session.unreadCount
    }, 0)
  )
}

export function useActiveConversation(): {
  activeKey: ConversationKey | null
  setActive: (key: ConversationKey | null) => void
} {
  const activeKey = useActiveConversationStore((state) => state.activeKey)
  const setActive = useActiveConversationStore((state) => state.setActive)
  return { activeKey, setActive }
}

export function useSendMessage(): (key: ConversationKey, content: string) => void {
  return useCallback((key, content) => {
    sendTextMessage(key, content)
  }, [])
}

/** 通信引擎生命周期: 有 token 启动, 无 token 停止 ( app 装配层调用 ) */
export function useMessagingLifecycle(): void {
  const accessToken = useAuthStore((state) => state.accessToken)

  useEffect(() => {
    if (accessToken) startMessaging()
    else stopMessaging()
  }, [accessToken])
}
