import type { DesktopApi } from '@shared/types/desktop'

/**
 * 仅开发调试: 在普通浏览器中打开渲染层 ( vite dev server ) 时,
 * 提供空实现的 desktop API, 使 UI 走查与 E2E 可以脱离 Electron 宿主运行。
 * Electron 内 preload 会先注入真实实现, 此 shim 不生效。
 */
export function installDesktopShim(): void {
  if (window.desktop) return
  const noop = async () => {}
  const api: DesktopApi = {
    minimize: noop,
    toggleMaximize: noop,
    close: noop,
    isMaximized: async () => false,
    enterMain: noop,
    enterLogin: noop,
    setBackground: noop,
    onMaximizeChange: () => () => {}
  }
  window.desktop = api
}
