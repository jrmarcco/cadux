function pick(value: string | undefined, fallback: string): string {
  return value && value.trim().length > 0 ? value.trim() : fallback
}

/** 后端 ( hermet ) HTTP 服务地址 */
export const API_BASE_URL = pick(import.meta.env.VITE_API_BASE_URL, 'http://127.0.0.1:10081')

/** 网关 ( synp ) WebSocket 服务地址 ( 不含 query 参数 ) */
export const GATEWAY_WS_URL = pick(import.meta.env.VITE_GATEWAY_WS_URL, 'ws://127.0.0.1:10071')

/** WS 连接设备类型; 同账号同 device 的新连接会顶掉旧连接 */
export const GATEWAY_DEVICE = 'pc'
