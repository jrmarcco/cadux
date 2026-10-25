// E2E 辅助 ( 不顶号版 ): 以指定账号 + device=diag 连接
// 用法: node scripts/ws-e2e-helper.mjs <A|B> <expect前缀> <回复内容|-> <可选:发给陌生人内容>
import { ulid } from 'ulid'

const BACKEND = 'http://127.0.0.1:10081'
const GATEWAY = 'ws://127.0.0.1:10071'
const ACCOUNTS = {
  A: { account: 'jrmarcco@gmail.com', credential: '<passwd>' },
  B: { account: 'test-user-1@example.com', credential: 'hermet@2026' }
}
const DEVICE = 'diag'

const b64Text = (t) => Buffer.from(t, 'utf8').toString('base64')
const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const who = process.argv[2] ?? 'B'
const expectPrefix = process.argv[3] ?? ''
const replyContent = process.argv[4] ?? '-'
const strangerContent = process.argv[5] ?? undefined

const main = async () => {
  const cred = ACCOUNTS[who]
  const res = await fetch(`${BACKEND}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: cred.account, accountType: 'email', credential: cred.credential })
  })
  const tokens = (await res.json()).data
  const peerRaw = Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString('utf8')
  const selfId = peerRaw.match(/"user_id"\s*:\s*"?(\d+)"?/)[1]

  const ws = new WebSocket(`${GATEWAY}?device=${DEVICE}`)
  const pending = new Map()
  await new Promise((ok, err) => {
    ws.onopen = ok
    ws.onerror = err
  })
  ws.onmessage = (ev) => {
    const text = typeof ev.data === 'string' ? ev.data : null
    if (text === null) return
    const f = JSON.parse(text)
    if (String(f.commandType).endsWith('_ACK')) {
      const w = pending.get(f.messageId)
      if (w) {
        pending.delete(f.messageId)
        w(unb64(f.body ?? '') ?? {})
      }
    }
  }
  const req = (cmd, body, ms = 5000) =>
    new Promise((resolve) => {
      const id = ulid()
      const text = typeof body === 'string' ? body : JSON.stringify(body)
      ws.send(JSON.stringify({ commandType: cmd, messageId: id, body: b64Text(text) }))
      const t = setTimeout(() => {
        pending.delete(id)
        resolve(null)
      }, ms)
      pending.set(id, (x) => {
        clearTimeout(t)
        resolve(x)
      })
    })

  await req('COMMAND_TYPE_AUTH', { token: tokens.accessToken })
  const sync = await req('COMMAND_TYPE_SYNC', { cursor: 0, limit: 200 })
  const entries = sync?.response?.entries ?? []
  const content = (e) => {
    const d = unb64(e.message?.body ?? '')
    return typeof d?.content === 'string' ? d.content : typeof d === 'string' ? d : ''
  }
  if (expectPrefix) {
    const hit = entries.filter((e) => content(e).startsWith(expectPrefix))
    console.log(`[${who}] 收件箱 ${entries.length} 条, 命中 ${expectPrefix}: ${hit.length} 条`)
    for (const e of hit.slice(-2)) console.log(`  seq=${e.seq} content=${content(e)}`)
  }

  // 对端 ID: 取单聊会话里另一端
  const convEntry = entries.find((e) => e.message?.conversationId?.startsWith('s:'))
  const peerId = convEntry
    ? convEntry.message.conversationId
        .split(':')
        .slice(1)
        .find((x) => x !== selfId)
    : null

  if (replyContent !== '-' && peerId) {
    const ack = await req(
      'COMMAND_TYPE_UPSTREAM',
      JSON.stringify({
        id: ulid(),
        destinationId: String(peerId),
        destinationType: 'single',
        content: replyContent,
        contentType: 'text'
      })
    )
    console.log(`[${who}] 回复 ACK=${JSON.stringify(ack)} content=${replyContent}`)
  }
  if (strangerContent) {
    const ack = await req(
      'COMMAND_TYPE_UPSTREAM',
      JSON.stringify({
        id: ulid(),
        destinationId: '999999999999',
        destinationType: 'single',
        content: strangerContent,
        contentType: 'text'
      })
    )
    console.log(`[${who}] 发陌生人 ACK=${JSON.stringify(ack)} ( 期望系统回执 )`)
    await sleep(2500)
    const s2 = await req('COMMAND_TYPE_SYNC', { cursor: Number(sync?.response?.latestSeq ?? 0), limit: 100 })
    const sys = (s2?.response?.entries ?? []).find((e) => unb64(e.message?.body ?? '')?.systemType)
    console.log(`[${who}] 系统回执: ${sys ? JSON.stringify(unb64(sys.message.body)) : '未收到'}`)
  }
  ws.close()
  await sleep(300)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
