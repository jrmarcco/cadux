/**
 * UTF-8 安全的 base64 编解码。
 * 浏览器原生 btoa/atob 只支持 Latin1, 消息内容含中文时必须先过 TextEncoder。
 */
export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodeBase64(base64: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
