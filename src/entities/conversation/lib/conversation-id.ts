import type { ChannelType, ConversationKey } from '../types'

export function buildSingleKey(selfId: number | null, targetId: number): ConversationKey {
  if (selfId === null) return `s:_:${targetId}`
  const [a, b] = selfId < targetId ? [selfId, targetId] : [targetId, selfId]
  return `s:${a}:${b}`
}

export function buildGroupKey(groupId: number): ConversationKey {
  return `g:${groupId}`
}

export function buildConversationKey(
  channelType: ChannelType,
  targetId: number,
  selfId: number | null
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
  numericIds: number[]
  /** buildSingleKey 在自身 ID 未知时生成的占位段 ( s:_:targetId ) */
  hasPlaceholder: boolean
} {
  if (key.startsWith('g:')) {
    const id = Number(key.slice(2))
    return {
      channelType: 'group',
      numericIds: Number.isFinite(id) ? [id] : [],
      hasPlaceholder: false
    }
  }
  const segments = key.split(':').slice(1)
  const numericIds = segments.map((part) => Number(part)).filter((id) => Number.isFinite(id) && Number.isInteger(id))
  return {
    channelType: 'single',
    numericIds,
    hasPlaceholder: segments.includes('_')
  }
}

/** 单聊 key → 对端用户 ID */
export function singleChatPeerId(key: ConversationKey, selfId: number | null): number | null {
  const { channelType, numericIds, hasPlaceholder } = parseConversationKey(key)
  if (channelType !== 'single') return null
  if (hasPlaceholder) return numericIds.length > 0 ? numericIds[numericIds.length - 1] : null
  if (selfId === null) return numericIds.length > 0 ? numericIds[numericIds.length - 1] : null
  return numericIds.find((id) => id !== selfId) ?? null
}
