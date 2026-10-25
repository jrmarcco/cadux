import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatMessage } from '@entities/conversation'
import { useMessagingStore } from '@features/messaging/model/messaging-store'

function incomingMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'srv-1',
    localId: null,
    conversationKey: 's:10001:10002',
    senderId: '10001',
    content: 'hello',
    contentType: 'text',
    sentAtMs: Date.now(),
    status: 'sent',
    ...overrides
  }
}

function pendingMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'biz-1',
    localId: 'biz-1',
    conversationKey: 's:10001:10002',
    senderId: '10002',
    content: 'hi',
    contentType: 'text',
    sentAtMs: Date.now(),
    status: 'pending',
    ...overrides
  }
}

describe('messaging store / fallbackSession 对端推导', () => {
  beforeEach(() => {
    useMessagingStore.getState().resetAll()
  })

  it('回归: 自身是较大 ID 一侧时, 占位会话 targetId 是对端而不是自己', () => {
    // key s:10001:10002, self=10002 ( 较大 ), 对方 10001 来消息
    useMessagingStore
      .getState()
      .applyIncomingMessage(incomingMessage(), { selfId: '10002', activeKey: null, countUnread: true })
    const session = useMessagingStore.getState().sessions['s:10001:10002']
    expect(session).toBeDefined()
    expect(session.targetId).toBe('10001')
    expect(session.unreadCount).toBe(1)
  })

  it('自身是较小 ID 一侧时同样正确', () => {
    useMessagingStore.getState().applyIncomingMessage(incomingMessage({ senderId: '10002' }), {
      selfId: '10001',
      activeKey: null,
      countUnread: true
    })
    expect(useMessagingStore.getState().sessions['s:10001:10002'].targetId).toBe('10002')
  })

  it('活跃会话的来消息不计未读; 自己多端同步的消息不计未读', () => {
    useMessagingStore.getState().applyIncomingMessage(incomingMessage(), {
      selfId: '10002',
      activeKey: 's:10001:10002',
      countUnread: true
    })
    expect(useMessagingStore.getState().sessions['s:10001:10002'].unreadCount).toBe(0)

    useMessagingStore.getState().applyIncomingMessage(incomingMessage({ id: 'srv-2', senderId: '10002' }), {
      selfId: '10002',
      activeKey: null,
      countUnread: true
    })
    expect(useMessagingStore.getState().sessions['s:10001:10002'].unreadCount).toBe(0)
  })

  it('历史 SYNC ( countUnread=false ) 不计入未读', () => {
    useMessagingStore.getState().applyIncomingMessage(incomingMessage(), {
      selfId: '10002',
      activeKey: null,
      countUnread: false
    })
    expect(useMessagingStore.getState().sessions['s:10001:10002'].unreadCount).toBe(0)
  })

  it('pending 消息经 localId 与服务端回推合并', () => {
    useMessagingStore.getState().addPendingMessage(pendingMessage())
    expect(useMessagingStore.getState().messages['s:10001:10002']).toHaveLength(1)
    expect(useMessagingStore.getState().pendingMap['biz-1']).toBe('s:10001:10002')

    useMessagingStore
      .getState()
      .applyIncomingMessage(incomingMessage({ id: 'srv-9', localId: 'biz-1', senderId: '10002' }), {
        selfId: '10002',
        activeKey: 's:10001:10002',
        countUnread: true
      })
    const state = useMessagingStore.getState()
    expect(state.messages['s:10001:10002']).toHaveLength(1)
    expect(state.messages['s:10001:10002'][0].id).toBe('srv-9')
    expect(state.pendingMap['biz-1']).toBeUndefined()
  })

  it('回显按帧 ID 合并 pending ( hermet 落库 message_id 为帧 ID, body 不含业务 id )', () => {
    useMessagingStore.getState().addPendingMessage(pendingMessage())
    useMessagingStore.getState().registerFrame('frame-77', 'biz-1')
    expect(useMessagingStore.getState().frameMap['frame-77']).toBe('biz-1')

    // 控制器逻辑: 命中 frameMap 时回填 localId 再应用
    const store = useMessagingStore.getState()
    const echo = incomingMessage({ id: 'frame-77', localId: null, senderId: '10002' })
    const bizId = store.frameMap[echo.id]
    if (bizId !== undefined) {
      echo.localId = bizId
      store.releaseFrame(echo.id)
    }
    store.applyIncomingMessage(echo, { selfId: '10002', activeKey: 's:10001:10002', countUnread: true })

    const state = useMessagingStore.getState()
    expect(state.messages['s:10001:10002']).toHaveLength(1)
    expect(state.messages['s:10001:10002'][0].id).toBe('frame-77')
    expect(state.messages['s:10001:10002'][0].status).toBe('sent')
    expect(state.pendingMap['biz-1']).toBeUndefined()
    expect(state.frameMap['frame-77']).toBeUndefined()
  })

  it('addPendingMessage 的占位会话 targetId 取对端', () => {
    useMessagingStore.getState().addPendingMessage(pendingMessage())
    expect(useMessagingStore.getState().sessions['s:10001:10002'].targetId).toBe('10001')
  })

  it('markSessionRead 清零未读', () => {
    useMessagingStore
      .getState()
      .applyIncomingMessage(incomingMessage(), { selfId: '10002', activeKey: null, countUnread: true })
    useMessagingStore.getState().markSessionRead('s:10001:10002')
    expect(useMessagingStore.getState().sessions['s:10001:10002'].unreadCount).toBe(0)
  })

  it('游标只前进不回退', () => {
    useMessagingStore.getState().setInboxCursor(10)
    useMessagingStore.getState().setInboxCursor(7)
    expect(useMessagingStore.getState().inboxCursor).toBe(10)
  })
})
