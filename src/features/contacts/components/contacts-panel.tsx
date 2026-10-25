import { useMemo, useState } from 'react'
import type { ContactItem } from '@shared/types/api'
import { Avatar } from '@shared/ui/avatar'
import { SearchInput } from '@shared/ui/search-input'
import { useContacts } from '../hooks/use-contacts'
import styles from './contacts.module.css'

export interface ContactsPanelProps {
  selectedId: number | null
  onSelect: (contact: ContactItem) => void
}

export function ContactsPanel({ selectedId, onSelect }: ContactsPanelProps) {
  const { data } = useContacts()
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const contacts = data ?? []
    const query = keyword.trim().toLowerCase()
    if (query.length === 0) return contacts
    return contacts.filter((contact) => (contact.remarkName ?? contact.contactNickname).toLowerCase().includes(query))
  }, [data, keyword])

  return (
    <div className={styles.panel}>
      <div className={styles.searchBar}>
        <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索联系人" />
      </div>
      <div className={styles.list}>
        <div className={styles.groupLabel}>好友 ({filtered.length})</div>
        {filtered.map((contact) => {
          const name = contact.remarkName ?? contact.contactNickname
          return (
            <div
              key={contact.id}
              className={[styles.item, contact.contactId === selectedId ? styles.active : ''].filter(Boolean).join(' ')}
              onClick={() => onSelect(contact)}
            >
              <Avatar name={name} src={contact.contactAvatar} size={36} />
              <span className={styles.name}>{name}</span>
            </div>
          )
        })}
        {filtered.length === 0 ? <div className={styles.empty}>暂无联系人</div> : null}
      </div>
    </div>
  )
}
