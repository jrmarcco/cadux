export interface DesktopApi {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  enterMain(): Promise<void>
  enterLogin(): Promise<void>
  onMaximizeChange(callback: (maximized: boolean) => void): () => void
}

declare global {
  interface Window {
    desktop: DesktopApi
  }
}
