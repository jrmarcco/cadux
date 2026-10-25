import { Icon } from './icon'
import styles from './search-input.module.css'

export interface SearchInputProps {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}

export function SearchInput({ value, placeholder, onChange }: SearchInputProps) {
  return (
    <label className={styles.searchInput}>
      <Icon name="search" size={14} className={styles.icon} />
      <input
        className={styles.input}
        type="text"
        value={value}
        placeholder={placeholder ?? '搜索'}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
    </label>
  )
}
