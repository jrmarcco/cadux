import { useEffect, useRef, useState } from 'react'
import { Icon } from '@shared/ui/icon'
import styles from './chat.module.css'

export interface MessageInputProps {
  disabled?: boolean
  onSend: (content: string) => void
}

const MAX_INPUT_HEIGHT = 120

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const content = value.trim()
    if (content.length === 0 || disabled) return
    onSend(content)
    setValue('')
  }

  return (
    <div className={styles.inputArea}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolButton} title="表情 ( 开发中 )" disabled>
          <Icon name="smile" size={18} />
        </button>
        <button type="button" className={styles.toolButton} title="图片 ( 开发中 )" disabled>
          <Icon name="image" size={18} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        rows={1}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <div className={styles.sendRow}>
        <span className={styles.counter}>{value.length > 0 ? `${value.length} 字` : ''}</span>
        <button
          type="button"
          className={styles.sendButton}
          disabled={disabled || value.trim().length === 0}
          onClick={submit}
        >
          发送 <Icon name="send" size={13} />
        </button>
      </div>
    </div>
  )
}
