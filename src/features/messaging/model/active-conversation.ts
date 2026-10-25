import { create } from 'zustand'
import type { ConversationKey } from '@entities/conversation'

interface ActiveConversationState {
  /** 当前在聊天区打开的会话; null 表示未选择 */
  activeKey: ConversationKey | null
  setActive: (key: ConversationKey | null) => void
}

export const useActiveConversationStore = create<ActiveConversationState>()((set) => ({
  activeKey: null,
  setActive: (key) => set({ activeKey: key })
}))
