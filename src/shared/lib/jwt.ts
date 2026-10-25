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

const USER_ID_CLAIMS = ['userId', 'user_id', 'uid', 'id', 'sub'] as const

/**
 * 从 JWT 提取当前用户 ID ( 十进制字符串 )。
 * 不经 JSON.parse: user_id 为 int64 数字, 双精度往返会损坏
 * ( 134605228232032256 → 134605228232032260 ), 因此用正则从 payload 原文提取。
 */
export function extractUserId(token: string): string | null {
  const segments = token.split('.')
  if (segments.length !== 3) return null
  let payload: string
  try {
    payload = decodeBase64Url(segments[1])
  } catch {
    return null
  }
  for (const claim of USER_ID_CLAIMS) {
    const match = payload.match(new RegExp(`"${claim}"\\s*:\\s*"?(-?\\d+)"?`))
    if (match) return match[1]
  }
  return null
}
