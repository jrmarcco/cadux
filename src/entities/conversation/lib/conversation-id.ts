import type { ChannelType, ConversationKey } from '../types'

/** ID 归一为十进制字符串 ( int64 超出 JS 安全整数范围, 禁止走 Number ) */
function normalizeId(id: string | number): string {
  return String(id).trim()
}

function isDecimal(value: string): boolean {
  return /^\d+$/.test(value)
}

/** 数值序比较两个十进制 ID ( 位数不同时字典序不可用, 用 BigInt ) */
function compareId(a: string, b: string): number {
  const bigA = BigInt(a)
  const bigB = BigInt(b)
  return bigA < bigB ? -1 : bigA > bigB ? 1 : 0
}

export function buildSingleKey(selfId: string | number | null, targetId: string | number): ConversationKey {
  const target = normalizeId(targetId)
  if (selfId === null) return `s:_:${target}`
  const self = normalizeId(selfId)
  const [min, max] = compareId(self, target) <= 0 ? [self, target] : [target, self]
  return `s:${min}:${max}`
}

export function buildGroupKey(groupId: string | number): ConversationKey {
  return `g:${normalizeId(groupId)}`
}

export function buildConversationKey(
  channelType: ChannelType,
  targetId: string | number,
  selfId: string | number | null
): ConversationKey {
  return channelType === 'single' ? buildSingleKey(selfId, targetId) : buildGroupKey(targetId)
}

/**
 * 将多种形态的会话标识归一为规范 key:
 * - "s:a:b" / "g:500" ( 网关 conversationId ) 原样保留;
 * - "a:b" ( channels.destination 单聊历史格式, 不带前缀 ) 补 "s:" 前缀;
 * - "500" ( destination 群聊裸数字 ) 补 "g:" 前缀。
 */
export function normalizeConversationKey(raw: string): ConversationKey {
  if (raw.startsWith('s:') || raw.startsWith('g:')) return raw
  if (raw.includes(':')) return `s:${raw}`
  return `g:${raw}`
}

export function parseConversationKey(key: ConversationKey): {
  channelType: ChannelType
  numericIds: string[]
  /** buildSingleKey 在自身 ID 未知时生成的占位段 ( s:_:targetId ) */
  hasPlaceholder: boolean
} {
  if (key.startsWith('g:')) {
    const id = key.slice(2)
    return {
      channelType: 'group',
      numericIds: isDecimal(id) ? [id] : [],
      hasPlaceholder: false
    }
  }
  const segments = key.split(':').slice(1)
  return {
    channelType: 'single',
    numericIds: segments.filter(isDecimal),
    hasPlaceholder: segments.includes('_')
  }
}

/** 单聊 key → 对端用户 ID */
export function singleChatPeerId(key: ConversationKey, selfId: string | null): string | null {
  const { channelType, numericIds, hasPlaceholder } = parseConversationKey(key)
  if (channelType !== 'single') return null
  if (hasPlaceholder || selfId === null) {
    return numericIds.length > 0 ? numericIds[numericIds.length - 1] : null
  }
  return numericIds.find((id) => id !== selfId) ?? null
}
