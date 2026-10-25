import type { ConversationKey } from '@entities/conversation'
import { useConnectionState, useMessages, useSendMessage, useSession } from '@features/messaging'
import { currentSelfId } from '@features/messaging'
import { Avatar } from '@shared/ui/avatar'
import { useMemo } from 'react'
import { MessageInput } from './message-input'
import { MessageList } from './message-list'
import styles from './chat.module.css'

export interface ChatPanelProps {
  activeKey: ConversationKey | null
}

export function ChatPanel({ activeKey }: ChatPanelProps) {
  const session = useSession(activeKey)
  const messages = useMessages(activeKey)
  const sendMessage = useSendMessage()
  const connection = useConnectionState()
  const selfId = useMemo(() => currentSelfId(), [])

  const handleResend = (content: string) => {
    if (activeKey) sendMessage(activeKey, content)
  }

  if (!session || activeKey === null) {
    return (
      <div className={styles.chatEmpty}>
        <Avatar name="cadux" size={72} />
        <div className={styles.chatEmptyTitle}>欢迎使用 cadux</div>
        <div className={styles.chatEmptyHint}>从左侧选择一个会话开始聊天</div>
      </div>
    )
  }

  const connectionBroken = connection === 'disconnected'
  const connectionPending = connection === 'connecting' || connection === 'reconnecting'

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>{session.name}</span>
        {session.isMuted ? <span className={styles.chatMuted}>已静音</span> : null}
      </div>
      {connectionPending ? <div className={styles.connectionBanner}>连接中，消息可能延迟…</div> : null}
      {connectionBroken ? <div className={styles.connectionBannerError}>连接已断开，等待重连…</div> : null}
      <MessageList key={activeKey} messages={messages} session={session} selfId={selfId} onResend={handleResend} />
      <MessageInput onSend={(content) => sendMessage(activeKey, content)} />
    </div>
  )
}
