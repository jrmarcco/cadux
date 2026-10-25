import { Avatar } from '@shared/ui/avatar'
import { Icon } from '@shared/ui/icon'
import { formatListTime } from '@shared/lib/date'
import type { SessionSummary } from '@entities/conversation'
import styles from './session-list.module.css'

export interface SessionItemProps {
  session: SessionSummary
  active: boolean
  onClick: (key: string) => void
}

export function SessionItem({ session, active, onClick }: SessionItemProps) {
  const preview = session.lastMessage
  const previewText = preview ? preview.content || '[ 新消息 ]' : '暂无消息'

  return (
    <div
      className={[styles.item, active ? styles.active : '', session.isPinned ? styles.pinned : '']
        .filter(Boolean)
        .join(' ')}
      onClick={() => onClick(session.key)}
    >
      <Avatar name={session.name} src={session.avatar} size={40} />
      <div className={styles.body}>
        <div className={styles.topRow}>
          <span className={styles.name}>{session.name}</span>
          <span className={styles.time}>{preview ? formatListTime(preview.sentAtMs) : ''}</span>
        </div>
        <div className={styles.bottomRow}>
          <span className={styles.preview}>{previewText}</span>
          {session.unreadCount > 0 && !session.isMuted ? (
            <span className={styles.badge}>{session.unreadCount > 99 ? '99+' : session.unreadCount}</span>
          ) : null}
          {session.isMuted ? <Icon name="mute" size={14} className={styles.muteIcon} /> : null}
        </div>
      </div>
    </div>
  )
}
