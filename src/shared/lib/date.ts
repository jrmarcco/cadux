function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** HH:mm */
export function formatTime(ms: number): string {
  const date = new Date(ms)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 会话列表时间: 今天 HH:mm / 昨天 / 周X / YYYY/MM/DD */
export function formatListTime(ms: number): string {
  const now = new Date()
  const today = startOfDay(now.getTime())
  const day = startOfDay(ms)
  const diffDays = Math.round((today - day) / 86_400_000)

  if (diffDays <= 0) return formatTime(ms)
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) {
    return `周${['日', '一', '二', '三', '四', '五', '六'][new Date(ms).getDay()]}`
  }
  const date = new Date(ms)
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`
}

/** 消息流中的日期分割线: 今天 / 昨天 / YYYY年M月D日 */
export function formatDateDivider(ms: number): string {
  const today = startOfDay(Date.now())
  const day = startOfDay(ms)
  const diffDays = Math.round((today - day) / 86_400_000)

  if (diffDays <= 0) return '今天'
  if (diffDays === 1) return '昨天'
  const date = new Date(ms)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
