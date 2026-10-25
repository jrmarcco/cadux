export interface DesktopApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  enterMain(): Promise<void>
  enterLogin(): Promise<void>
  /** 同步窗口背景色 ( 主题切换时避免暗色闪白 ) */
  setBackground(color: string): Promise<void>
  onMaximizeChange(callback: (maximized: boolean) => void): () => void
}

declare global {
  interface Window {
    desktop: DesktopApi
  }
}
