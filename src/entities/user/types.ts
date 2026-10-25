/**
 * 用户/群组等 int64 ID 统一以十进制字符串承载:
 * 服务端 ID 超出 JS 安全整数范围, Number 往返会损坏 ( 见 shared/lib/lossless-json )。
 */
export type UserId = string

/** 用户摘要 ( 跨 feature 复用的领域对象 ) */
export interface UserSummary {
  id: UserId
  name: string
  avatar: string | null
}
