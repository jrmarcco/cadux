// synp/hermet 协议冒烟脚本 ( node >= 22, 原生 WebSocket + fetch ):
// 登录双账号 → WS AUTH → SYNC → 双向 UPSTREAM → 边界用例。
// 注意: 所有 int64 ID 以字符串承载, UPSTREAM body 手工注入数字字面量
// ( JS number 序列化会损坏超精度 ID, 会被服务端静默丢弃 )。
// 用法: node scripts/ws-smoke.mjs [自定义消息内容]
import { ulid } from 'ulid'

const BACKEND = process.env.SMOKE_BACKEND ?? 'http://127.0.0.1:10081'
const GATEWAY = process.env.SMOKE_GATEWAY ?? 'ws://127.0.0.1:10071'
const ACCOUNTS = {
  A: { account: 'jrmarcco@gmail.com', credential: '<passwd>' },
  B: { account: 'test-user-1@example.com', credential: 'hermet@2026' }
}

const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
  } catch {
    return null
  }
}
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...args)

async function signIn({ account, credential }) {
  const res = await fetch(`${BACKEND}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, accountType: 'email', credential })
  })
  if (!res.ok) throw new Error(`sign-in ${account} HTTP ${res.status}`)
  const envelope = await res.json()
  if (envelope.code !== 200) throw new Error(`sign-in ${account} failed: ${JSON.stringify(envelope)}`)
  const token = envelope.data.accessToken
  // int64 user_id 用正则无损提取 ( JSON.parse 会损坏 )
  const payload = Buffer.from(token.split('.')[1], 'base64').toString('utf8')
  const m = payload.match(/"user_id"\s*:\s*"?(-?\d+)"?/)
  if (!m) throw new Error(`无法从 JWT 提取 user_id: ${payload}`)
  return { account, token, userId: m[1] }
}

class Gw {
  constructor(name) {
    this.name = name
    this.pending = new Map()
    this.notifySeq = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${GATEWAY}?device=pc`)
      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error(`${this.name} ws error`))
      this.ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') this.onFrame(ev.data)
        else void ev.data.text().then((text) => this.onFrame(text))
      }
    })
  }

  onFrame(raw) {
    let frame
    try {
      frame = JSON.parse(raw)
    } catch {
      log(this.name, '<< 非法 JSON 帧:', raw.slice(0, 120))
      return
    }
    if (frame.commandType === 'COMMAND_TYPE_HEARTBEAT') return
    const body = frame.body ? unb64(frame.body) : null
    log(
      this.name,
      `<< ${frame.commandType} id=${String(frame.messageId).slice(-6)}`,
      JSON.stringify(body)?.slice(0, 260)
    )
    if (frame.commandType === 'COMMAND_TYPE_NOTIFY') this.notifySeq = Number(body?.latestSeq ?? 0)
    if (String(frame.commandType).endsWith('_ACK')) {
      const waiter = this.pending.get(frame.messageId)
      if (waiter) {
        this.pending.delete(frame.messageId)
        clearTimeout(waiter.timer)
        waiter.resolve(body)
      }
    }
  }

  send(commandType, rawBody) {
    const messageId = ulid()
    this.ws.send(JSON.stringify({ commandType, messageId, body: rawBody === undefined ? '' : b64(rawBody) }))
    return messageId
  }

  /** rawBody 为对象 ( 常规 JSON.stringify ) 或已序列化文本 ( 需字面量注入时 ) */
  request(commandType, rawBody, timeoutMs = 5000) {
    const text = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
    const messageId = this.send(commandType, text)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId)
        resolve(null)
      }, timeoutMs)
      this.pending.set(messageId, { resolve, timer })
    })
  }

  waitNotify(timeoutMs = 6000) {
    return new Promise((resolve) => {
      const started = Date.now()
      const tick = setInterval(() => {
        if (this.notifySeq !== null || Date.now() - started > timeoutMs) {
          clearInterval(tick)
          resolve(this.notifySeq)
        }
      }, 100)
    })
  }
}

/** destinationId 必须是精确数字字面量 ( 传字符串会被静默丢弃 ) */
function upstreamBody({ id, destinationId, content }) {
  if (!/^\d+$/.test(destinationId)) throw new Error(`非法 destinationId: ${destinationId}`)
  const json = JSON.stringify({
    id,
    destinationId: '@@int64@@',
    destinationType: 'single',
    content,
    contentType: 'text'
  })
  return json.replace('"@@int64@@"', destinationId)
}

const main = async () => {
  const [userA, userB] = await Promise.all([signIn(ACCOUNTS.A), signIn(ACCOUNTS.B)])
  log(`A=${userA.account} userId=${userA.userId}`)
  log(`B=${userB.account} userId=${userB.userId}`)

  const gwA = new Gw('A')
  await gwA.connect()
  const authA = await gwA.request('COMMAND_TYPE_AUTH', { token: userA.token })
  if (!authA?.success) throw new Error(`A AUTH 失败: ${JSON.stringify(authA)}`)

  const gwB = new Gw('B')
  await gwB.connect()
  const authB = await gwB.request('COMMAND_TYPE_AUTH', { token: userB.token })
  if (!authB?.success) throw new Error(`B AUTH 失败: ${JSON.stringify(authB)}`)

  const syncB = await gwB.request('COMMAND_TYPE_SYNC', { cursor: 0, limit: 100 })
  const respB = syncB?.response
  console.log('\n== B 首次 SYNC ==')
  console.log(
    'latestSeq =',
    JSON.stringify(respB?.latestSeq),
    ' hasMore =',
    respB?.hasMore,
    ' entries =',
    respB?.entries?.length
  )

  // B → A
  const content = process.argv[2] ?? `smoke ${new Date().toISOString()}`
  console.log('\n== B → A UPSTREAM ( 精确字面量 destinationId ) ==')
  const up = await gwB.request(
    'COMMAND_TYPE_UPSTREAM',
    upstreamBody({ id: ulid(), destinationId: userA.userId, content })
  )
  console.log('UPSTREAM_ACK =', JSON.stringify(up))
  const notified = await gwB.waitNotify()
  console.log('B 收到 NOTIFY latestSeq =', notified, notified ? '( 投递成功 )' : '( 未收到, 需人工排查 )')

  // A 增量拉取
  const syncA = await gwA.request('COMMAND_TYPE_SYNC', { cursor: 0, limit: 100 })
  console.log('\n== A 全量 SYNC ==')
  for (const entry of syncA?.response?.entries ?? []) {
    console.log(
      '  seq =',
      JSON.stringify(entry.seq),
      ' conv =',
      entry.message?.conversationId ?? entry.conversationUpdate?.conversationId
    )
  }
  console.log('A latestSeq =', JSON.stringify(syncA?.response?.latestSeq))

  // A → B
  const reply = `reply ${new Date().toISOString()}`
  console.log('\n== A → B UPSTREAM ==')
  const up2 = await gwA.request(
    'COMMAND_TYPE_UPSTREAM',
    upstreamBody({ id: ulid(), destinationId: userB.userId, content: reply })
  )
  console.log('UPSTREAM_ACK =', JSON.stringify(up2))
  await gwB.waitNotify()
  const delta = await gwB.request('COMMAND_TYPE_SYNC', { cursor: Number(respB?.latestSeq ?? 0), limit: 100 })
  console.log(
    'B 增量 entries =',
    JSON.stringify(delta?.response?.entries?.map((e) => ({ seq: e.seq, sender: e.message?.senderId })))
  )

  // 边界: 字符串 destinationId ( 期望静默丢弃, 无 NOTIFY )
  console.log('\n== 边界: destinationId 传字符串 ( 期望被静默丢弃 ) ==')
  gwB.notifySeq = null
  const ackStr = await gwB.request(
    'COMMAND_TYPE_UPSTREAM',
    JSON.stringify({
      id: ulid(),
      destinationId: userA.userId,
      destinationType: 'single',
      content: 'string-dest',
      contentType: 'text'
    })
  )
  console.log('ACK =', JSON.stringify(ackStr), ' NOTIFY =', await gwB.waitNotify(3000))

  // 边界: 非群成员 CONVERSATION_SYNC
  console.log('\n== 边界: 非群成员 CONVERSATION_SYNC ==')
  const convBad = await gwB.request('COMMAND_TYPE_CONVERSATION_SYNC', {
    conversationId: 'g:999999999',
    cursor: 0,
    limit: 10
  })
  console.log(JSON.stringify(convBad)?.slice(0, 260))

  console.log('\n== 冒烟完成 ==')
  await sleep(1000)
  gwA.ws.close()
  gwB.ws.close()
  await sleep(300)
  process.exit(0)
}

main().catch((err) => {
  console.error('冒烟失败:', err)
  process.exit(1)
})
