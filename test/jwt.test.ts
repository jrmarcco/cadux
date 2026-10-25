import { describe, expect, it } from 'vitest'
import { extractUserId, isTokenExpired } from '@shared/lib/jwt'

function makeToken(payload: object | string): string {
  // payload 允许传原始 JSON 文本, 避免测试自身先被 JS number 序列化损坏
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const encode = (text: string) => {
    const bytes = new TextEncoder().encode(text)
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return `${encode('{"alg":"RS256","typ":"JWT"}')}.${encode(body)}.signature`
}

describe('extractUserId ( int64 无损 )', () => {
  it('从 user_id 提取精确十进制字符串 ( 不经 JSON.parse )', () => {
    const token = makeToken('{"user_id":134605228232032256,"exp":4102444800}')
    expect(extractUserId(token)).toBe('134605228232032256')
  })

  it('兼容 userId / sub claim', () => {
    expect(extractUserId(makeToken({ userId: 10001 }))).toBe('10001')
    expect(extractUserId(makeToken({ sub: 10002 }))).toBe('10002')
  })

  it('非数字 sub 不匹配', () => {
    expect(extractUserId(makeToken({ sub: 'abc' }))).toBeNull()
  })

  it('非三段式 token 返回 null', () => {
    expect(extractUserId('not-a-jwt')).toBeNull()
  })
})

describe('isTokenExpired', () => {
  it('exp 未过期', () => {
    expect(isTokenExpired(makeToken({ exp: Math.floor(Date.now() / 1000) + 3600 }))).toBe(false)
  })

  it('exp 已过期', () => {
    expect(isTokenExpired(makeToken({ exp: Math.floor(Date.now() / 1000) - 3600 }))).toBe(true)
  })

  it('缺 exp 视为过期', () => {
    expect(isTokenExpired(makeToken({ user_id: 1 }))).toBe(true)
  })
})
