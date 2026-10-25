import type { ContactItem } from '@shared/types/api'
import { Icon } from '@shared/ui/icon'
import { Avatar } from '@shared/ui/avatar'
import styles from './contacts.module.css'

export interface ContactDetailProps {
  contact: ContactItem | null
  onSendMessage?: (contact: ContactItem) => void
}

export function ContactDetail({ contact, onSendMessage }: ContactDetailProps) {
  if (!contact) {
    return (
      <div className={styles.detailEmpty}>
        <div className={styles.detailEmptyTitle}>选择一位联系人</div>
        <div className={styles.detailEmptyHint}>查看联系人资料</div>
      </div>
    )
  }

  const name = contact.remarkName ?? contact.contactNickname

  return (
    <div className={styles.detail}>
      <Avatar name={name} src={contact.contactAvatar} size={72} />
      <div className={styles.detailName}>{name}</div>
      <div className={styles.detailRows}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>用户 ID</span>
          <span className={styles.detailValue}>{String(contact.contactId)}</span>
        </div>
        {contact.remarkName ? (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>昵称</span>
            <span className={styles.detailValue}>{contact.contactNickname}</span>
          </div>
        ) : null}
        {contact.contactGender ? (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>性别</span>
            <span className={styles.detailValue}>{contact.contactGender}</span>
          </div>
        ) : null}
        {contact.source ? (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>来源</span>
            <span className={styles.detailValue}>{contact.source}</span>
          </div>
        ) : null}
      </div>
      <button type="button" className={styles.sendButton} onClick={() => onSendMessage?.(contact)}>
        <Icon name="message" size={15} />
        发消息
      </button>
      <div className={styles.detailHint}>会话由服务端建立后，可在「消息」中开始聊天</div>
    </div>
  )
}
