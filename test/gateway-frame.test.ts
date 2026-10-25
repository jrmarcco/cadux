import { describe, expect, it } from 'vitest'
import { normalizeFrame } from '@features/messaging/lib/frame'
import { decodePayload } from '@features/messaging/lib/gateway-client'

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('normalizeFrame', () => {
  it('接受枚举名字符串 ( synp 网关格式 )', () => {
    const frame = normalizeFrame({
      commandType: 'COMMAND_TYPE_NOTIFY',
      messageId: '01JD8Z3V9GKQWXFQPXB1H5NH6R',
      body: ''
    })
    expect(frame?.commandType).toBe('COMMAND_TYPE_NOTIFY')
    expect(frame?.messageId).toBe('01JD8Z3V9GKQWXFQPXB1H5NH6R')
  })

  it('兼容数字指令 ( hermet 文档格式 )', () => {
    expect(normalizeFrame({ commandType: 10, messageId: 'm1', body: '' })?.commandType).toBe('COMMAND_TYPE_NOTIFY')
    expect(normalizeFrame({ commandType: 7, messageId: 'm2', body: '' })?.commandType).toBe('COMMAND_TYPE_SYNC_ACK')
  })

  it('拒绝非法帧', () => {
    expect(normalizeFrame(null)).toBeNull()
    expect(normalizeFrame({ commandType: 'COMMAND_TYPE_SYNC' })).toBeNull()
    expect(normalizeFrame({ commandType: 99, messageId: 'm3', body: '' })).toBeNull()
  })
})

describe('decodePayload', () => {
  it('解码 base64 帧 body', () => {
    const body = toBase64(JSON.stringify({ latestSeq: 100 }))
    expect(decodePayload<{ latestSeq: number }>(body).latestSeq).toBe(100)
  })

  it('兼容 JSON 原文帧 body', () => {
    expect(decodePayload<{ cursor: number }>('{"cursor":42}').cursor).toBe(42)
  })
})
