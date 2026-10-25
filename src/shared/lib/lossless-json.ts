/**
 * 无损 JSON 解析。
 *
 * 实测 ( 2026-10-25 ): hermet HTTP 响应与 JWT 将 int64 ID 序列化为 JSON 数字,
 * 而超出 ±(2^53-1) 的整数经 JS Number 往返会损坏
 * ( 134605228232032256 ↔ 134605228232032260 ), 以损坏 ID 发消息会被服务端静默丢弃。
 * 这里在解析前把 ≥16 位的整数字面量加引号转为字符串, 字符串值内部的数字不受影响。
 */
export function parseJsonLossless(text: string): unknown {
  return JSON.parse(quoteUnsafeIntegers(text))
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** 15 位以内整数必在安全范围内 ( 2^53-1 = 9007199254740991 ), ≥16 位一律转字符串 */
const UNSAFE_INTEGER_DIGITS = 16

function quoteUnsafeIntegers(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      i += 1
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i += 1
      continue
    }
    if (ch === '-' || isDigit(ch)) {
      let end = i
      if (text[end] === '-') end += 1
      while (end < text.length && isDigit(text[end])) end += 1
      // 浮点 / 科学计数法: 整体消费、原样输出 ( 小数部分可能被误判为新数字 token )
      if (text[end] === '.' || text[end] === 'e' || text[end] === 'E') {
        if (text[end] === '.') {
          end += 1
          while (end < text.length && isDigit(text[end])) end += 1
        }
        if (text[end] === 'e' || text[end] === 'E') {
          end += 1
          if (text[end] === '+' || text[end] === '-') end += 1
          while (end < text.length && isDigit(text[end])) end += 1
        }
        out += text.slice(i, end)
        i = end
        continue
      }
      const token = text.slice(i, end)
      const digitCount = token.startsWith('-') ? token.length - 1 : token.length
      if (digitCount >= UNSAFE_INTEGER_DIGITS) {
        out += `"${token}"`
      } else {
        out += token
      }
      i = end
      continue
    }
    out += ch
    i += 1
  }
  return out
}
