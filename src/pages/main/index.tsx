import { useState } from 'react'
import type { ContactItem } from '@shared/types/api'
import { buildSingleKey } from '@entities/conversation'
import { currentSelfId, markSessionRead, useActiveConversation, useMessagingStore } from '@features/messaging'
import { ChatPanel } from '@features/chat'
import { ContactDetail, ContactsPanel } from '@features/contacts'
import { SessionList } from '@features/session-list'
import { TitleBar } from '@shared/ui/title-bar'
import { NavRail, type MainTab } from './components/nav-rail'
import styles from './main.module.css'

export function MainPage() {
  const [tab, setTab] = useState<MainTab>('messages')
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null)
  const { activeKey, setActive } = useActiveConversation()

  const handleSelectContact = (contact: ContactItem) => {
    setSelectedContact(contact)
    // 已有会话则直接打开
    const selfId = currentSelfId()
    const key = buildSingleKey(selfId, contact.contactId)
    const sessions = useMessagingStore.getState().sessions
    if (sessions[key]) {
      setActive(key)
      markSessionRead(key)
      setTab('messages')
    }
  }

  /** 从联系人发消息: 服务端会话由 CDC 异步创建, 本地先占位, 之后由会话列表刷新合并 */
  const handleChatWithContact = (contact: ContactItem) => {
    const key = buildSingleKey(currentSelfId(), contact.contactId)
    useMessagingStore.getState().upsertSessions([
      {
        key,
        channelType: 'single',
        targetId: String(contact.contactId),
        name: contact.remarkName ?? contact.contactNickname,
        avatar: contact.contactAvatar ?? null,
        isMuted: false,
        isPinned: false,
        lastMessage: null,
        unreadCount: 0,
        mentionCount: 0
      }
    ])
    setActive(key)
    markSessionRead(key)
    setTab('messages')
  }

  return (
    <div className={styles.page}>
      <TitleBar variant="main" />
      <div className={styles.body}>
        <NavRail tab={tab} onChange={setTab} />
        {tab === 'messages' ? (
          <>
            <aside className={styles.listPanel}>
              <SessionList />
            </aside>
            <main className={styles.contentPanel}>
              <ChatPanel activeKey={activeKey} />
            </main>
          </>
        ) : (
          <>
            <aside className={styles.listPanel}>
              <ContactsPanel selectedId={selectedContact?.contactId ?? null} onSelect={handleSelectContact} />
            </aside>
            <main className={styles.contentPanel}>
              <ContactDetail contact={selectedContact} onSendMessage={handleChatWithContact} />
            </main>
          </>
        )}
      </div>
    </div>
  )
}
