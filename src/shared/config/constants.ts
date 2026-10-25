/** 网关连接与同步协议常量 ( 依据 synp 网关接入文档 ) */
export const GATEWAY_PROTOCOL = {
  /** 连接建立后须在 15s 内完成 AUTH */
  AUTH_TIMEOUT_MS: 15_000,
  /** 心跳间隔, 服务端 90s 无上行即断开 */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** 连续无心跳回显次数达到该值即主动重连 */
  HEARTBEAT_MISS_LIMIT: 3,
  /** 请求帧等待 ACK 超时 */
  ACK_TIMEOUT_MS: 5_000,
  /** UPSTREAM 无 ACK 时的最大重试次数 */
  UPSTREAM_MAX_RETRIES: 3,
  /** SYNC 单页条数, 0 表示用服务端默认 ( 100 ) */
  SYNC_PAGE_LIMIT: 100,
  /** 重连退避上限 */
  RECONNECT_MAX_DELAY_MS: 30_000,
  /** 重连退避基数 */
  RECONNECT_BASE_DELAY_MS: 1_000
} as const

/** HTTP 请求超时 */
export const HTTP_TIMEOUT_MS = 15_000
