import { createEventBus } from '@shared/lib/event-bus'

export type MessagingEvent = { type: 'connected' } | { type: 'disconnected' }

/** 连接事件总线: 供 session-list 等模块在重连后刷新 HTTP 数据 */
export const messagingEvents = createEventBus<MessagingEvent>()
