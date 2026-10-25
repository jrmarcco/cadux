import { useMemo, useState } from 'react'
import type { ConversationKey } from '@entities/conversation'
import { markSessionRead, useActiveConversation, useConversations } from '@features/messaging'
import { SearchInput } from '@shared/ui/search-input'
import { useSessionList } from '../hooks/use-sessions'
import { SessionItem } from './session-item'
import styles from './session-list.module.css'

export function SessionList() {
  useSessionList()
  const conversations = useConversations()
  const { activeKey, setActive } = useActiveConversation()
  const [keyword, setKeyword] = useState('')

  const filtered = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    if (query.length === 0) return conversations
    return conversations.filter((session) => session.name.toLowerCase().includes(query))
  }, [conversations, keyword])

  const handleSelect = (key: ConversationKey) => {
    setActive(key)
    markSessionRead(key)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.searchBar}>
        <SearchInput value={keyword} onChange={setKeyword} placeholder="搜索" />
      </div>
      <div className={styles.list}>
        {filtered.map((session) => (
          <SessionItem key={session.key} session={session} active={session.key === activeKey} onClick={handleSelect} />
        ))}
        {filtered.length === 0 ? <div className={styles.empty}>暂无会话</div> : null}
      </div>
    </div>
  )
}
