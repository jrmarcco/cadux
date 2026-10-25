import type { ChatMessage } from '@entities/conversation'
import { formatTime } from '@shared/lib/date'
import { Avatar } from '@shared/ui/avatar'
import styles from './chat.module.css'

export interface MessageItemProps {
  message: ChatMessage
  isSelf: boolean
  senderName: string
  showNickname: boolean
  avatarSize: number
  onResend: (content: string) => void
}

export function MessageItem({ message, isSelf, senderName, showNickname, avatarSize, onResend }: MessageItemProps) {
  // 系统回执 ( send_failed 等 ): 居中灰字提示, 不占气泡位
  if (message.contentType === 'system') {
    return (
      <div className={styles.systemNotice} title={formatTime(message.sentAtMs)}>
        {message.content}
      </div>
    )
  }

  return (
    <div className={[styles.messageRow, isSelf ? styles.messageRowSelf : ''].join(' ')}>
      <Avatar name={senderName} size={avatarSize} />
      <div className={styles.messageBody}>
        {showNickname ? <div className={styles.senderName}>{senderName}</div> : null}
        <div
          className={[
            styles.bubble,
            isSelf ? styles.bubbleSelf : styles.bubbleOther,
            message.status === 'failed' ? styles.bubbleFailed : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {message.contentType === 'image' ? '[ 图片 ]' : message.content}
        </div>
        {message.status === 'pending' ? (
          <div className={[styles.statusHint, isSelf ? styles.statusHintSelf : ''].join(' ')}>发送中…</div>
        ) : null}
        {message.status === 'failed' ? (
          <div
            className={[styles.statusHint, styles.statusFailed, isSelf ? styles.statusHintSelf : ''].join(' ')}
            title="点击重新发送"
            onClick={() => onResend(message.content)}
          >
            发送失败，点击重试
          </div>
        ) : null}
      </div>
      <span className={styles.messageTime}>{formatTime(message.sentAtMs)}</span>
    </div>
  )
}
