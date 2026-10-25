import { describe, expect, it } from 'vitest'
import { parseJsonLossless } from '@shared/lib/lossless-json'

describe('parseJsonLossless', () => {
  it('超出 double 精度的 int64 解析为精确字符串', () => {
    const text = '{"contactId":134605228232032256,"userId":240070963854417920}'
    const parsed = parseJsonLossless(text) as Record<string, unknown>
    expect(parsed.contactId).toBe('134605228232032256')
    expect(parsed.userId).toBe('240070963854417920')
  })

  it('小整数与时间戳保持 number', () => {
    const parsed = parseJsonLossless('{"unreadCount":3,"lastMessageTime":1761400000000}') as Record<string, unknown>
    expect(parsed.unreadCount).toBe(3)
    expect(parsed.lastMessageTime).toBe(1761400000000)
  })

  it('字符串值内部的数字不被改写', () => {
    const text = '{"content":"note: 134605228232032256} 采单引号\\" 与逗号, 999999999999999999"}'
    const parsed = parseJsonLossless(text) as Record<string, unknown>
    expect(parsed.content).toBe('note: 134605228232032256} 采单引号" 与逗号, 999999999999999999')
  })

  it('负的大整数同样转字符串', () => {
    const parsed = parseJsonLossless('{"v":-134605228232032256}') as Record<string, unknown>
    expect(parsed.v).toBe('-134605228232032256')
  })

  it('浮点与科学计数法不受影响', () => {
    const parsed = parseJsonLossless('{"a":1.23456789012345678,"b":1e20,"c":-2.5}') as Record<string, unknown>
    expect(parsed.a).toBeCloseTo(Number('1.2345678901234567'), 15)
    expect(parsed.b).toBe(1e20)
    expect(parsed.c).toBe(-2.5)
  })

  it('嵌套对象与数组递归生效', () => {
    const parsed = parseJsonLossless('{"data":[{"id":134605228232032256,"tags":[134605228232032257]}]}') as {
      data: Array<{ id: unknown; tags: unknown[] }>
    }
    expect(parsed.data[0].id).toBe('134605228232032256')
    expect(parsed.data[0].tags[0]).toBe('134605228232032257')
  })

  it('非法 JSON 正常抛错', () => {
    expect(() => parseJsonLossless('{oops}')).toThrow()
  })
})
