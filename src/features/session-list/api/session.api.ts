import { httpRequest } from '@shared/api/http-client'
import type { ChannelItem } from '@shared/types/api'

export function fetchChannels(): Promise<ChannelItem[]> {
  return httpRequest<ChannelItem[]>('/api/v1/channel/channels')
}
