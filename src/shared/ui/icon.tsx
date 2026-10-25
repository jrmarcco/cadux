import type { CSSProperties, ReactElement } from 'react'

export type IconName =
  | 'message'
  | 'contact'
  | 'settings'
  | 'search'
  | 'mute'
  | 'close'
  | 'minimize'
  | 'maximize'
  | 'restore'
  | 'send'
  | 'smile'
  | 'image'
  | 'plus'
  | 'more'
  | 'group'
  | 'logout'

const GLYPHS: Record<IconName, ReactElement> = {
  message: (
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  ),
  contact: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1a6.5 6.5 0 0 1 6.5-6.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14.5 20v-.5a5 5 0 0 1 7-4.6" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10" />
      <circle cx="18" cy="7" r="2.4" />
      <path d="M20 12H10" />
      <circle cx="6" cy="12" r="2.4" />
      <path d="M4 17h10" />
      <circle cx="18" cy="17" r="2.4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </>
  ),
  mute: (
    <>
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.9 17.9 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="m2 2 20 20" />
    </>
  ),
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
  minimize: <path d="M5 12h14" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  restore: (
    <>
      <rect x="4" y="8" width="12" height="12" rx="1.5" />
      <path d="M8 4h11a1 1 0 0 1 1 1v11" />
    </>
  ),
  send: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  smile: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <path d="M9 9h.01" />
      <path d="M15 9h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  group: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  )
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 18, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {GLYPHS[name]}
    </svg>
  )
}
