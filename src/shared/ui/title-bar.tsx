import { useEffect, useState } from 'react'
import { Icon } from './icon'
import styles from './title-bar.module.css'

export interface TitleBarProps {
  variant: 'login' | 'main'
}

/** 无边框窗口的自定义标题栏: 拖拽区 + 窗口控制按钮 */
export function TitleBar({ variant }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let disposed = false
    void window.desktop.isMaximized().then((value) => {
      if (!disposed) setMaximized(value)
    })
    const unsubscribe = window.desktop.onMaximizeChange(setMaximized)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  return (
    <div className={styles.titleBar}>
      <div className={styles.dragArea}>{variant === 'main' ? <span className={styles.title}>cadux</span> : null}</div>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlButton}
          title="最小化"
          onClick={() => void window.desktop.minimize()}
        >
          <Icon name="minimize" size={14} />
        </button>
        {variant === 'main' ? (
          <button
            type="button"
            className={styles.controlButton}
            title={maximized ? '还原' : '最大化'}
            onClick={() => void window.desktop.toggleMaximize()}
          >
            <Icon name={maximized ? 'restore' : 'maximize'} size={13} />
          </button>
        ) : null}
        <button
          type="button"
          className={[styles.controlButton, styles.closeButton].join(' ')}
          title="关闭"
          onClick={() => void window.desktop.close()}
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  )
}
