import type { SessionSummary } from '@entities/conversation'
import { normalizeConversationKey } from '@entities/conversation'
import type { ChannelItem } from '@shared/types/api'

/** 服务端 channel → 本地会话摘要 */
export function mapChannels(items: ChannelItem[]): SessionSummary[] {
  return items.map((item) => ({
    key: normalizeConversationKey(item.destination),
    channelType: item.channelType === 'group' ? 'group' : 'single',
    targetId: item.targetId ?? null,
    name: item.channelName && item.channelName.length > 0 ? item.channelName : item.destination,
    avatar: item.channelAvatar ?? null,
    isMuted: Boolean(item.isMuted),
    isPinned: Boolean(item.isPinned),
    lastMessage:
      typeof item.lastMessageTime === 'number' && item.lastMessageTime > 0
        ? {
            content: item.lastMessageContent ?? '',
            senderId: item.lastMessageSenderId ?? null,
            contentType: item.lastMessageType ?? 'text',
            sentAtMs: item.lastMessageTime
          }
        : null,
    unreadCount: item.unreadCount ?? 0,
    mentionCount: item.mentionCount ?? 0
  }))
}
