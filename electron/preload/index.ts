import { contextBridge, ipcRenderer } from 'electron'

const desktop = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<void> => ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:get-maximized'),
  enterMain: (): Promise<void> => ipcRenderer.invoke('app:enter-main'),
  enterLogin: (): Promise<void> => ipcRenderer.invoke('app:enter-login'),
  onMaximizeChange: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean): void => callback(maximized)
    ipcRenderer.on('window:maximize-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:maximize-changed', listener)
    }
  }
}

export type DesktopApi = typeof desktop

contextBridge.exposeInMainWorld('desktop', desktop)
