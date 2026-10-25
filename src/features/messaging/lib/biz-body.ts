import { encodeBase64 } from '@shared/lib/base64'

export interface BizBody {
  id?: string
  sid?: number
  destinationId?: number
  destinationType?: string
  content?: string
  contentType?: string
}

/**
 * 业务 body 解码: synp 文档约定 base64(JSON), hermet 文档示例为 JSON 原文 —
 * 接收端按 base64 → 原文 JSON 双重兼容解析。
 */
export function decodeBizBody(body: string): BizBody {
  if (body.length === 0) return {}
  try {
    return JSON.parse(body) as BizBody
  } catch {
    // 非法 JSON 且非 base64, 放弃
  }
  try {
    const binary = atob(body)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as BizBody
  } catch {
    return {}
  }
}

export function toChatMessage(
  inbox: {
    messageId: string
    senderId: number
    body: string
    sentAt: string
  },
  conversationKey: string
) {
  const biz = decodeBizBody(inbox.body)
  const sentAtMs = Number.isFinite(Date.parse(inbox.sentAt)) ? Date.parse(inbox.sentAt) : Date.now()
  return {
    id: inbox.messageId,
    localId: typeof biz.id === 'string' && biz.id.length > 0 ? biz.id : null,
    conversationKey,
    senderId: inbox.senderId,
    content: typeof biz.content === 'string' ? biz.content : '',
    contentType: biz.contentType === 'image' ? ('image' as const) : ('text' as const),
    sentAtMs,
    status: 'sent' as const
  }
}

export { encodeBase64 }
