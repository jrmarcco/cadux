import { Icon } from '@shared/ui/icon'
import { useThemeStore, type ThemePreference } from './theme-store'
import styles from './theme.module.css'

const OPTIONS: Array<{ key: ThemePreference; label: string }> = [
  { key: 'auto', label: '跟随系统' },
  { key: 'light', label: '明亮' },
  { key: 'dark', label: '深色' }
]

/** 三档主题切换: 跟随系统 / 明亮 / 深色 */
export function ThemeSwitcher() {
  const preference = useThemeStore((state) => state.preference)
  const setPreference = useThemeStore((state) => state.setPreference)

  return (
    <div className={styles.switcher} role="radiogroup" aria-label="主题">
      {OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={preference === option.key}
          className={[styles.option, preference === option.key ? styles.optionActive : ''].filter(Boolean).join(' ')}
          onClick={() => setPreference(option.key)}
        >
          <Icon name={option.key === 'auto' ? 'monitor' : option.key === 'light' ? 'sun' : 'moon'} size={14} />
          {option.label}
        </button>
      ))}
    </div>
  )
}
