import { describe, expect, it } from 'vitest'
import { decodeBase64 } from '@shared/lib/base64'
import { decodeBizBody, encodeBase64 } from '@features/messaging/lib/biz-body'

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('decodeBizBody', () => {
  it('解析 base64(JSON) 格式 ( synp 文档约定 )', () => {
    const encoded = toBase64(JSON.stringify({ id: '01JD', destinationId: 10002, content: '你好', contentType: 'text' }))
    const biz = decodeBizBody(encoded)
    expect(biz.id).toBe('01JD')
    expect(biz.destinationId).toBe(10002)
    expect(biz.content).toBe('你好')
    expect(biz.contentType).toBe('text')
  })

  it('兼容 JSON 原文格式 ( hermet 文档示例 )', () => {
    const biz = decodeBizBody(JSON.stringify({ content: 'hello' }))
    expect(biz.content).toBe('hello')
  })

  it('非法 body 返回空对象', () => {
    expect(decodeBizBody('')).toEqual({})
    expect(decodeBizBody('!!!not-json!!!')).toEqual({})
  })
})

describe('encodeBase64', () => {
  it('UTF-8 安全: 中文与 emoji 可往返', () => {
    const text = '你好，cadux 🐍'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })
})
