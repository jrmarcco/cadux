import { httpRequest } from '@shared/api/http-client'
import type { SignInRequest, TokenPair } from '@shared/types/api'

export function signInApi(payload: SignInRequest): Promise<TokenPair> {
  return httpRequest<TokenPair>('/api/v1/auth/sign-in', { method: 'POST', body: payload })
}

export async function signOutApi(): Promise<void> {
  try {
    await httpRequest<null>('/api/v1/auth/sign-out', { method: 'POST', body: {} })
  } catch {
    // 登出接口失败不阻断本地登出流程
  }
}
