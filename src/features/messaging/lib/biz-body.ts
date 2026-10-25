import { decodeBase64, encodeBase64 } from '@shared/lib/base64'
import type { UpstreamBizPayload } from '@entities/conversation'

export interface BizBody {
  id?: string
  sid?: string | number
  destinationId?: string | number
  destinationType?: string
  content?: string
  contentType?: string
  /** 系统回执 ( 新契约 §5 ): send_failed 等 */
  systemType?: string
  reason?: string
  upstreamId?: string
}

/**
 * 业务 body 解码: synp 文档约定 base64(JSON), hermet 文档示例为 JSON 原文。
 * 实测 ( 2026-10-25 ): 网关仅接受 base64; 且历史链路上存在非 JSON 的透传 body
 * ( 解码后为纯文本 ), 此情况按纯文本 content 处理。
 */
export function decodeBizBody(body: string): BizBody {
  if (body.length === 0) return {}
  try {
    return JSON.parse(body) as BizBody
  } catch {
    // 非法 JSON 且非 base64, 放弃
  }
  let text: string
  try {
    text = decodeBase64(body)
  } catch {
    return {}
  }
  try {
    return JSON.parse(text) as BizBody
  } catch {
    return { content: text }
  }
}

/** UPSTREAM body 中 int64 字面量的注入占位符 ( 序列化后整体替换为裸数字 ) */
const DESTINATION_PLACEHOLDER = '@@cadux-int64@@'

/**
 * UPSTREAM body 序列化: destinationId 必须是精确的 JSON 数字字面量。
 * 实测: ① 传字符串会被服务端静默丢弃; ② int64 超出 double 精度,
 * JSON.stringify(Number) 会输出损坏的最短表示 ( ...256 → ...260 ),
 * 因此以字符串承载 ID、序列化时做字面量注入。
 */
export function encodeUpstreamBody(biz: UpstreamBizPayload): string {
  if (!/^\d+$/.test(biz.destinationId)) {
    throw new Error(`非法 destinationId: ${biz.destinationId}`)
  }
  const json = JSON.stringify({ ...biz, destinationId: DESTINATION_PLACEHOLDER })
  const quoted = `"${DESTINATION_PLACEHOLDER}"`
  const at = json.indexOf(quoted)
  if (at < 0) {
    throw new Error('UPSTREAM body 序列化失败: 占位符丢失')
  }
  return json.slice(0, at) + biz.destinationId + json.slice(at + quoted.length)
}

export function toChatMessage(
  inbox: {
    messageId: string
    senderId: number | string
    body: string
    sentAt: string
  },
  conversationKey: string
) {
  const biz = decodeBizBody(inbox.body)
  const sentAtMs = Number.isFinite(Date.parse(inbox.sentAt)) ? Date.parse(inbox.sentAt) : Date.now()
  const isSystem = typeof biz.systemType === 'string' && biz.systemType.length > 0
  return {
    id: inbox.messageId,
    localId: !isSystem && typeof biz.id === 'string' && biz.id.length > 0 ? biz.id : null,
    conversationKey,
    // protojson 将 int64 senderId 序列化为字符串, 统一收敛为十进制字符串
    senderId: String(inbox.senderId),
    content: typeof biz.content === 'string' ? biz.content : '',
    contentType: isSystem ? ('system' as const) : biz.contentType === 'image' ? ('image' as const) : ('text' as const),
    sentAtMs,
    status: 'sent' as const,
    systemUpstreamId: isSystem && typeof biz.upstreamId === 'string' ? biz.upstreamId : undefined
  }
}

export { encodeBase64 }
