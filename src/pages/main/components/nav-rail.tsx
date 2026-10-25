import { useState } from 'react'
import type { IconName } from '@shared/ui/icon'
import { Icon } from '@shared/ui/icon'
import { Avatar } from '@shared/ui/avatar'
import { signOutApi, useAuthStore } from '@features/user-auth'
import { useUnreadTotal } from '@features/messaging'
import styles from './nav-rail.module.css'

export type MainTab = 'messages' | 'contacts'

export interface NavRailProps {
  tab: MainTab
  onChange: (tab: MainTab) => void
}

const NAV_ITEMS: Array<{ key: MainTab; icon: IconName; label: string }> = [
  { key: 'messages', icon: 'message', label: '消息' },
  { key: 'contacts', icon: 'contact', label: '联系人' }
]

export function NavRail({ tab, onChange }: NavRailProps) {
  const account = useAuthStore((state) => state.account)
  const unreadTotal = useUnreadTotal()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleSignOut = () => {
    void signOutApi()
    setSettingsOpen(false)
    useAuthStore.getState().clear()
  }

  return (
    <nav className={styles.rail}>
      <div className={styles.top}>
        <div className={styles.avatarWrap} title={account ?? '未登录'}>
          <Avatar name={account ?? 'c'} size={38} />
          <span className={styles.onlineDot} />
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={[styles.navButton, tab === item.key ? styles.navButtonActive : ''].filter(Boolean).join(' ')}
            title={item.label}
            onClick={() => onChange(item.key)}
          >
            <Icon name={item.icon} size={21} />
            {item.key === 'messages' && unreadTotal > 0 ? (
              <span className={styles.badge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
            ) : null}
          </button>
        ))}
      </div>
      <div className={styles.bottom}>
        <div className={styles.settingsWrap}>
          <button
            type="button"
            className={[styles.navButton, settingsOpen ? styles.navButtonActive : ''].filter(Boolean).join(' ')}
            title="设置"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <Icon name="settings" size={20} />
          </button>
          {settingsOpen ? (
            <div className={styles.settingsMenu}>
              <button type="button" className={styles.menuItem} onClick={handleSignOut}>
                <Icon name="logout" size={14} />
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
