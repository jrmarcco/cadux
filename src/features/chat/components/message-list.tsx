import { useEffect, useRef } from 'react'
import type { ChatMessage, SessionSummary } from '@entities/conversation'
import { formatDateDivider } from '@shared/lib/date'
import { useAuthStore } from '@features/user-auth'
import { MessageItem } from './message-item'
import styles from './chat.module.css'

export interface MessageListProps {
  messages: ChatMessage[]
  session: SessionSummary
  selfId: number | null
  onResend: (content: string) => void
}

export function MessageList({ messages, session, selfId, onResend }: MessageListProps) {
  const account = useAuthStore((state) => state.account)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140
    if (nearBottom || prevCountRef.current === 0) {
      bottomRef.current?.scrollIntoView()
    }
    prevCountRef.current = messages.length
  }, [messages])

  return (
    <div className={styles.messageList} ref={scrollRef}>
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const showDivider =
          previous === undefined || formatDateDivider(previous.sentAtMs) !== formatDateDivider(message.sentAtMs)
        const isSelf = selfId !== null && message.senderId === selfId
        const senderName = isSelf
          ? (account ?? '我')
          : session.channelType === 'single'
            ? session.name
            : `用户${message.senderId}`

        return (
          <div key={message.id}>
            {showDivider ? (
              <div className={styles.dayDivider}>
                <span>{formatDateDivider(message.sentAtMs)}</span>
              </div>
            ) : null}
            <MessageItem
              message={message}
              isSelf={isSelf}
              senderName={senderName}
              showNickname={session.channelType === 'group' && !isSelf}
              avatarSize={34}
              onResend={onResend}
            />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
