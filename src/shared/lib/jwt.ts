export interface JwtPayload {
  [claim: string]: unknown
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return atob(padded)
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const segments = token.split('.')
  if (segments.length !== 3) return null
  try {
    return JSON.parse(decodeBase64Url(segments[1])) as JwtPayload
  } catch {
    return null
  }
}

/** exp 为秒级 Unix 时间戳; skewMs 用于容忍本机时钟偏差 */
export function isTokenExpired(token: string, skewMs = 5 * 60_000): boolean {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== 'number') return true
  return payload.exp * 1000 - skewMs <= Date.now()
}

/** 从 JWT 提取当前用户 ID ( 兼容 userId / uid / sub 等常见 claim ) */
export function extractUserId(token: string): number | null {
  const payload = decodeJwtPayload(token)
  if (!payload) return null
  for (const claim of ['userId', 'user_id', 'uid', 'id', 'sub']) {
    const value = payload[claim]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  }
  return null
}
