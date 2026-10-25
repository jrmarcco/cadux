/** 由名字稳定地生成头像占位色相 ( 同名恒定, 视觉上可区分 ) */
export function nameHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return ((hash % 360) + 360) % 360
}
