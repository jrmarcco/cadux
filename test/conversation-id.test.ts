import { describe, expect, it } from 'vitest'
import {
  buildConversationKey,
  buildGroupKey,
  buildSingleKey,
  normalizeConversationKey,
  parseConversationKey,
  singleChatPeerId
} from '@entities/conversation'

describe('buildSingleKey', () => {
  it('以 min:max 归一化单聊双方 ID', () => {
    expect(buildSingleKey('10002', '10001')).toBe('s:10001:10002')
    expect(buildSingleKey(10001, '10002')).toBe('s:10001:10002')
  })

  it('int64 大 ID 保持精确 ( 超 double 精度, 不可走 Number )', () => {
    expect(buildSingleKey('134605228232032256', '240070963854417920')).toBe('s:134605228232032256:240070963854417920')
  })

  it('按数值序而非字典序排序 ( 位数不同时字典序会错 )', () => {
    expect(buildSingleKey('1000', '999')).toBe('s:999:1000')
    expect(buildSingleKey('9', '10')).toBe('s:9:10')
  })

  it('自身 ID 未知时生成占位 key', () => {
    expect(buildSingleKey(null, '10002')).toBe('s:_:10002')
  })
})

describe('buildConversationKey', () => {
  it('单聊与群聊分别构建', () => {
    expect(buildConversationKey('single', '10002', '10001')).toBe('s:10001:10002')
    expect(buildConversationKey('group', '500', '10001')).toBe('g:500')
  })

  it('buildGroupKey 直接前缀', () => {
    expect(buildGroupKey(123)).toBe('g:123')
  })
})

describe('normalizeConversationKey', () => {
  it('保留带前缀的网关格式', () => {
    expect(normalizeConversationKey('s:10001:10002')).toBe('s:10001:10002')
    expect(normalizeConversationKey('g:500')).toBe('g:500')
  })

  it('channels.destination 单聊历史格式补 s: 前缀', () => {
    expect(normalizeConversationKey('10001:10002')).toBe('s:10001:10002')
  })

  it('destination 群聊裸数字补 g: 前缀', () => {
    expect(normalizeConversationKey('500')).toBe('g:500')
  })
})

describe('parseConversationKey / singleChatPeerId', () => {
  it('解析群聊 key', () => {
    expect(parseConversationKey('g:500')).toEqual({
      channelType: 'group',
      numericIds: ['500'],
      hasPlaceholder: false
    })
  })

  it('解析单聊 key', () => {
    expect(parseConversationKey('s:10001:10002')).toEqual({
      channelType: 'single',
      numericIds: ['10001', '10002'],
      hasPlaceholder: false
    })
    expect(parseConversationKey('s:_:10002')).toMatchObject({ hasPlaceholder: true })
  })

  it('单聊 key 取对端 ID', () => {
    expect(singleChatPeerId('s:10001:10002', '10001')).toBe('10002')
    expect(singleChatPeerId('s:10001:10002', '10002')).toBe('10001')
    expect(singleChatPeerId('s:_:10002', '10002')).toBe('10002')
    expect(singleChatPeerId('s:10001:10002', null)).toBe('10002')
  })

  it('int64 ID 取对端不损坏', () => {
    expect(singleChatPeerId('s:134605228232032256:240070963854417920', '240070963854417920')).toBe('134605228232032256')
  })

  it('群聊 key 无对端概念', () => {
    expect(singleChatPeerId('g:500', '10001')).toBeNull()
  })
})
