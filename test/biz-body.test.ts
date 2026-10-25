import { describe, expect, it } from 'vitest'
import { decodeBase64 } from '@shared/lib/base64'
import { decodeBizBody, encodeBase64, encodeUpstreamBody, toChatMessage } from '@features/messaging/lib/biz-body'

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

  it('兼容非 JSON 的透传 body: 解码后按纯文本 content 处理 ( 实测后端存在此情况 )', () => {
    const biz = decodeBizBody(toBase64('hello B marco store fail'))
    expect(biz.content).toBe('hello B marco store fail')
  })
})

describe('encodeBase64', () => {
  it('UTF-8 安全: 中文与 emoji 可往返', () => {
    const text = '你好，cadux 🐍'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })
})

describe('encodeUpstreamBody ( destinationId 精确注入 )', () => {
  it('destinationId 以裸数字字面量注入 ( int64 不经 Number )', () => {
    const json = encodeUpstreamBody({
      id: '01JD',
      destinationId: '134605228232032256',
      destinationType: 'single',
      content: '你好',
      contentType: 'text'
    })
    expect(json).toContain('"destinationId":134605228232032256')
    const parsed = JSON.parse(json.replace('"destinationId":134605228232032256', '"destinationId":"OK"')) as {
      destinationId: string
      content: string
      id: string
    }
    expect(parsed.destinationId).toBe('OK')
    expect(parsed.content).toBe('你好')
    expect(parsed.id).toBe('01JD')
  })

  it('小整数 destinationId 同样输出数字字面量', () => {
    const json = encodeUpstreamBody({
      id: 'x',
      destinationId: '10002',
      destinationType: 'single',
      content: 'hi',
      contentType: 'text'
    })
    expect(json).toContain('"destinationId":10002')
  })

  it('非法 destinationId 抛错', () => {
    expect(() =>
      encodeUpstreamBody({
        id: 'x',
        destinationId: '_not_digit',
        destinationType: 'single',
        content: 'hi',
        contentType: 'text'
      })
    ).toThrow()
  })

  it('内容包含占位符字面量时不影响注入', () => {
    const json = encodeUpstreamBody({
      id: 'x',
      destinationId: '10002',
      destinationType: 'single',
      content: '假装 "@@cadux-int64@@ 也不是占位符"',
      contentType: 'text'
    })
    expect(JSON.parse(json)).toMatchObject({ destinationId: 10002 })
  })
})

describe('toChatMessage ( int64 senderId )', () => {
  it('protojson 字符串 senderId 原样保留, 不做 Number 损坏', () => {
    const message = toChatMessage(
      {
        messageId: 'm1',
        senderId: '134605228232032256',
        body: toBase64(JSON.stringify({ id: 'local-1', content: 'hi' })),
        sentAt: '2026-10-25T10:00:00Z'
      },
      's:1:2'
    )
    expect(message.senderId).toBe('134605228232032256')
    expect(message.localId).toBe('local-1')
    expect(message.status).toBe('sent')
  })

  it('send_failed 系统回执识别为 system 类型并携带 upstreamId', () => {
    const body = toBase64(
      JSON.stringify({
        systemType: 'send_failed',
        reason: 'not_allowed',
        upstreamId: '01FRAME',
        content: '消息发送失败: 对方不是你的联系人或你不是群成员'
      })
    )
    const message = toChatMessage(
      { messageId: '01FRAME', senderId: '240070963854417920', body, sentAt: '2026-10-25T10:00:00Z' },
      's:1:2'
    )
    expect(message.contentType).toBe('system')
    expect(message.systemUpstreamId).toBe('01FRAME')
    expect(message.localId).toBeNull()
    expect(message.content).toContain('消息发送失败')
  })

  it('普通消息不受系统字段影响', () => {
    const message = toChatMessage(
      {
        messageId: 'm2',
        senderId: '10001',
        body: toBase64(JSON.stringify({ id: 'local-2', content: 'hi', contentType: 'text' })),
        sentAt: '2026-10-25T10:00:00Z'
      },
      's:1:2'
    )
    expect(message.contentType).toBe('text')
    expect(message.systemUpstreamId).toBeUndefined()
  })
})
