import { useState } from 'react'
import type { CSSProperties } from 'react'
import { nameHue } from '@shared/lib/color'
import styles from './avatar.module.css'

export interface AvatarProps {
  /** 用于占位首字与占位色 */
  name: string
  /** 头像地址, 预留: 传入即渲染图片, 失败回退占位 */
  src?: string | null
  size?: number
  className?: string
}

/**
 * 头像组件 ( 占位实现 ):
 * 有 src 时渲染图片, 否则渲染「首字 + 稳定渐变色」占位;
 * 后期补充真实头像资源时仅需传入 src, 调用方无需改动。
 */
export function Avatar({ name, src, size = 40, className }: AvatarProps) {
  const [failed, setFailed] = useState(false)

  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42)
  }
  if (!src || failed) {
    const hue = nameHue(name || '#')
    style.background = `linear-gradient(135deg, hsl(${hue} 72% 62%), hsl(${(hue + 36) % 360} 72% 50%))`
  }

  return (
    <span className={[styles.avatar, className ?? ''].join(' ')} style={style}>
      {src && !failed ? (
        <img className={styles.image} src={src} alt={name} onError={() => setFailed(true)} draggable={false} />
      ) : (
        <span className={styles.initial}>{(name || '#').slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}
