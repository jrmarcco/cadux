import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

function systemMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia('(prefers-color-scheme: dark)')
}

function systemTheme(): ResolvedTheme {
  return systemMedia()?.matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'auto' ? systemTheme() : preference
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
  // Electron 宿主: 同步窗口背景色, 避免暗色主题下 resize / 启动闪白 ( 浏览器 shim 为空实现 )
  void window.desktop?.setBackground(resolved === 'dark' ? '#1c1e22' : '#f2f3f5')
}

interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'auto',
      resolved: 'light',
      setPreference: (preference) => {
        const resolved = resolveTheme(preference)
        applyTheme(resolved)
        set({ preference, resolved })
      }
    }),
    { name: 'cadux/theme' }
  )
)

/** 应用启动时调用: 依据持久化偏好 ( 含跟随系统 ) 应用到 <html data-theme> */
export function initTheme(): void {
  const { preference } = useThemeStore.getState()
  const resolved = resolveTheme(preference)
  applyTheme(resolved)
  useThemeStore.setState({ resolved })
}

// 跟随系统时, 系统主题变化实时同步
systemMedia()?.addEventListener('change', () => {
  const { preference } = useThemeStore.getState()
  if (preference !== 'auto') return
  const resolved = systemTheme()
  applyTheme(resolved)
  useThemeStore.setState({ resolved })
})
