export type UserId = number

/** 用户摘要 ( 跨 feature 复用的领域对象 ) */
export interface UserSummary {
  id: UserId
  name: string
  avatar: string | null
}
