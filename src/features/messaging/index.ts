export {
  markSessionRead,
  useActiveConversation,
  useConnectionState,
  useConversations,
  useMessages,
  useMessagingLifecycle,
  useSendMessage,
  useSession,
  useUnreadTotal
} from './hooks/use-messaging'
export { messagingEvents } from './model/events'
export { useActiveConversationStore } from './model/active-conversation'
export { currentSelfId, sendTextMessage } from './model/gateway-controller'
export { useMessagingStore } from './model/messaging-store'
export type { ConnectionState } from './model/messaging-store'
