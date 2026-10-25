// E2E 辅助: 以 A 账号连接网关, 校验收到的 B 消息并自动回复一条
import { ulid } from 'ulid'

const BACKEND = 'http://127.0.0.1:10081'
const GATEWAY = 'ws://127.0.0.1:10071'
const b64Text = (text) => Buffer.from(text, 'utf8').toString('base64')
const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function signIn(account, credential) {
  const res = await fetch(`${BACKEND}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, accountType: 'email', credential })
  })
  return (await res.json()).data
}

const EXPECT_PREFIX = process.argv[2] ?? 'e2e-merge-fix3'
const REPLY = process.argv[3] ?? `e2e-a2b-reply-${Date.now()}`

const main = async () => {
  const a = await signIn('jrmarcco@gmail.com', '<passwd>')
  const ws = new WebSocket(`${GATEWAY}?device=pc`)
  const pending = new Map()
  await new Promise((ok, err) => {
    ws.onopen = ok
    ws.onerror = err
  })
  ws.onmessage = (ev) => {
    void ev.data.text().then((t) => {
      const f = JSON.parse(t)
      const body = f.body ? unb64(f.body) : null
      if (String(f.commandType).endsWith('_ACK')) {
        const w = pending.get(f.messageId)
        if (w) {
          pending.delete(f.messageId)
          w(body)
        }
      }
    })
  }
  const req = (cmd, payload, timeoutMs = 5000) =>
    new Promise((resolve) => {
      const id = ulid()
      const bodyText = typeof payload === 'string' ? payload : JSON.stringify(payload)
      ws.send(JSON.stringify({ commandType: cmd, messageId: id, body: b64Text(bodyText) }))
      const t = setTimeout(() => {
        pending.delete(id)
        resolve(null)
      }, timeoutMs)
      pending.set(id, (x) => {
        clearTimeout(t)
        resolve(x)
      })
    })

  await req('COMMAND_TYPE_AUTH', { token: a.accessToken })
  const sync = await req('COMMAND_TYPE_SYNC', { cursor: 0, limit: 100 })
  const entries = sync?.response?.entries ?? []
  const decodeContent = (body) => {
    const decoded = unb64(body ?? '')
    // hermet 落库 body 为纯文本 content, 兼容 JSON 两种形态
    if (typeof decoded?.content === 'string') return decoded.content
    return typeof decoded === 'string' ? decoded : ''
  }
  const fromB = entries.filter((e) => e.message && String(e.message.senderId) === '240070963854417920')
  const target = fromB.filter((e) => decodeContent(e.message.body).startsWith(EXPECT_PREFIX))
  console.log(
    `A 收件箱共 ${entries.length} 条, 来自 B ${fromB.length} 条, 命中前缀 ${EXPECT_PREFIX}: ${target.length} 条`
  )
  for (const e of target.slice(-3)) {
    console.log(`  seq=${e.seq} content=${decodeContent(e.message.body)}`)
  }

  // 回复 B ( 精确字面量注入 )
  const json = JSON.stringify({
    id: ulid(),
    destinationId: '@@i64@@',
    destinationType: 'single',
    content: REPLY,
    contentType: 'text'
  }).replace('"@@i64@@"', '240070963854417920')
  const ack = await req('COMMAND_TYPE_UPSTREAM', json)
  console.log('A 回复 ACK =', JSON.stringify(ack), ' content =', REPLY)
  await sleep(1500)
  ws.close()
  await sleep(300)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
