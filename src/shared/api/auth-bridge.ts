/**
 * 鉴权桥接: shared 层不直接依赖 features 层的 auth store,
 * 由 app 装配层在启动时注册实现 ( 依赖倒置, 保持分层方向 app → features → shared )。
 */
export interface AuthBridge {
  getAccessToken(): string | null
  getRefreshToken(): string | null
  updateTokens(tokens: { accessToken: string; refreshToken: string }): void
  /** 登录态彻底失效 ( 刷新失败 ) 时回调, 由装配层引导回登录页 */
  onAuthLost(): void
}

let bridge: AuthBridge | null = null

export function registerAuthBridge(impl: AuthBridge): void {
  bridge = impl
}

export function getAuthBridge(): AuthBridge | null {
  return bridge
}
