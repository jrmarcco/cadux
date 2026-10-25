import { describe, expect, it } from 'vitest'
import { formatDateDivider, formatListTime, formatTime } from '@shared/lib/date'

const DAY_MS = 86_400_000

describe('formatTime', () => {
  it('补零输出 HH:mm', () => {
    const date = new Date()
    date.setHours(9, 5, 0, 0)
    expect(formatTime(date.getTime())).toBe('09:05')
  })
})

describe('formatListTime', () => {
  it('今天显示时间', () => {
    expect(formatListTime(Date.now() - 60_000)).toBe(formatTime(Date.now() - 60_000))
  })

  it('昨天显示「昨天」', () => {
    const yesterday = new Date()
    yesterday.setHours(0, 0, 0, 0)
    expect(formatListTime(yesterday.getTime() - DAY_MS)).toBe('昨天')
  })

  it('一周内显示周X', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setHours(12, 0, 0, 0)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    expect(formatListTime(threeDaysAgo.getTime())).toBe(
      `周${['日', '一', '二', '三', '四', '五', '六'][threeDaysAgo.getDay()]}`
    )
  })

  it('更早显示日期', () => {
    const old = new Date(2026, 0, 5, 10, 30)
    expect(formatListTime(old.getTime())).toBe('2026/01/05')
  })
})

describe('formatDateDivider', () => {
  it('今天 / 昨天', () => {
    expect(formatDateDivider(Date.now())).toBe('今天')
    const yesterday = new Date()
    yesterday.setHours(0, 0, 0, 0)
    expect(formatDateDivider(yesterday.getTime() - DAY_MS)).toBe('昨天')
  })

  it('更早显示中文日期', () => {
    expect(formatDateDivider(new Date(2026, 9, 1, 8, 0).getTime())).toBe('2026年10月1日')
  })
})
