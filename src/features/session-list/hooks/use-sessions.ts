import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { messagingEvents, useMessagingStore } from '@features/messaging'
import { useAuthStore } from '@features/user-auth'
import { fetchChannels } from '../api/session.api'
import { mapChannels } from '../lib/map-channel'

/**
 * 会话列表数据源:
 * - HTTP 拉取一次并合并进 messaging store ( WS 事件负责增量更新 );
 * - WS 重连成功后刷新 ( 好友通过 / 建群后的会话是异步生成的 )。
 */
export function useSessionList(): ReturnType<typeof useQuery> {
  const queryClient = useQueryClient()
  const authenticated = useAuthStore((state) => state.accessToken !== null)

  const query = useQuery({
    queryKey: ['channels'],
    queryFn: fetchChannels,
    enabled: authenticated,
    staleTime: 30_000,
    retry: 1
  })

  useEffect(() => {
    if (!query.data) return
    useMessagingStore.getState().upsertSessions(mapChannels(query.data))
  }, [query.data])

  useEffect(() => {
    if (!authenticated) return
    return messagingEvents.on((event) => {
      if (event.type === 'connected') {
        void queryClient.invalidateQueries({ queryKey: ['channels'] })
      }
    })
  }, [authenticated, queryClient])

  return query
}
