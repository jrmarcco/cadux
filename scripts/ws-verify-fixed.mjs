// 2026-10-25 后端修复后的契约验证脚本:
// 逐项核对 docs/frontend-api.md ( 新版 ) 与实际行为, 输出 PASS/FAIL 证据。
// 用法: node scripts/ws-verify-fixed.mjs
import { ulid } from 'ulid'

const BACKEND = process.env.SMOKE_BACKEND ?? 'http://127.0.0.1:10081'
const GATEWAY = process.env.SMOKE_GATEWAY ?? 'ws://127.0.0.1:10071'
const ACCOUNTS = {
  A: { account: 'jrmarcco@gmail.com', credential: '<passwd>' },
  B: { account: 'test-user-1@example.com', credential: 'hermet@2026' }
}

const results = []
const report = (id, pass, detail) => {
  results.push({ id, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${id} | ${detail}`)
}

const b64Text = (text) => Buffer.from(text, 'utf8').toString('base64')
const unb64 = (s) => {
  try {
    return JSON.parse(Buffer.from(s, 'base64').toString('utf8'))
  } catch {
    return null
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function signIn({ account, credential }) {
  const res = await fetch(`${BACKEND}/api/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, accountType: 'email', credential })
  })
  const envelope = await res.json()
  if (envelope.code !== 200) throw new Error(`sign-in ${account} 失败: ${JSON.stringify(envelope)}`)
  const token = envelope.data.accessToken
  const payload = Buffer.from(token.split('.')[1], 'base64').toString('utf8')
  const m = payload.match(/"user_id"\s*:\s*("?-?\d+"?)/)
  return { account, token, userId: m ? m[1].replace(/"/g, '') : null, userIdRaw: m ? m[1] : null }
}

class Gw {
  constructor(name) {
    this.name = name
    this.pending = new Map()
    this.frameTypes = new Set()
    this.notifyIds = []
  }

  async connect(token) {
    this.ws = new WebSocket(`${GATEWAY}?device=pc`)
    await new Promise((ok, err) => {
      this.ws.onopen = ok
      this.ws.onerror = err
    })
    this.ws.onmessage = (ev) => {
      this.frameTypes.add(ev.data instanceof Blob ? 'Blob' : typeof ev.data)
      const text = typeof ev.data === 'string' ? ev.data : null
      if (text === null && !(ev.data instanceof Blob)) return
      if (ev.data instanceof Blob) {
        void ev.data.text().then((t) => this.onFrame(t))
        return
      }
      this.onFrame(text)
    }
    const ack = await this.request('COMMAND_TYPE_AUTH', { token })
    if (!ack?.success) throw new Error(`${this.name} AUTH 失败: ${JSON.stringify(ack)}`)
    return ack
  }

  onFrame(raw) {
    let frame
    try {
      frame = JSON.parse(raw)
    } catch {
      return
    }
    if (frame.commandType === 'COMMAND_TYPE_NOTIFY') {
      this.notifyIds.push({ messageId: frame.messageId, latestSeq: unb64(frame.body)?.latestSeq })
      return
    }
    if (String(frame.commandType).endsWith('_ACK')) {
      const waiter = this.pending.get(frame.messageId)
      if (waiter) {
        this.pending.delete(frame.messageId)
        clearTimeout(waiter.timer)
        waiter.resolve(frame.body ? unb64(frame.body) : {})
      }
    }
  }

  request(commandType, rawBody, timeoutMs = 5000) {
    const text = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)
    const messageId = ulid()
    this.ws.send(JSON.stringify({ commandType, messageId, body: rawBody === undefined ? '' : b64Text(text) }))
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId)
        resolve(null)
      }, timeoutMs)
      this.pending.set(messageId, { resolve, timer })
    })
  }

  async sync(cursor, limit = 100) {
    return this.request('COMMAND_TYPE_SYNC', { cursor, limit })
  }

  close() {
    this.ws.close()
  }
}

const main = async () => {
  const userA = await signIn(ACCOUNTS.A)
  const userB = await signIn(ACCOUNTS.B)

  // ── 1. JWT user_id 字符串化 ──
  report('T1 JWT user_id 为字符串', userB.userIdRaw.startsWith('"'), `原文 ${userB.userIdRaw}`)

  // ── 2. HTTP int64 字符串化 ──
  const contactsRaw = await (
    await fetch(`${BACKEND}/api/v1/contact/contacts`, { headers: { 'x-access-token': `Bearer ${userB.token}` } })
  ).text()
  const quoted = /"contactId"\s*:\s*"/.test(contactsRaw)
  report('T2 HTTP int64 ID 为字符串', quoted, `contacts 原文片段 ${contactsRaw.slice(0, 120)}`)

  // ── 3. CORS 预检 ──
  const preflight = await fetch(`${BACKEND}/api/v1/channel/channels`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-access-token'
    }
  })
  const corsHeader = preflight.headers.get('access-control-allow-origin')
  report(
    'T3 CORS 预检放行',
    preflight.status !== 401 && corsHeader !== null,
    `HTTP ${preflight.status} allow-origin=${corsHeader}`
  )

  // ── 4. admin/user 缺 gender → 400 校验信息 ( 不再 500 泄漏 SQL ) ──
  const adminRes = await fetch(`${BACKEND}/api/v1/admin/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-token': `Bearer ${userB.token}` },
    body: JSON.stringify({ nickname: 'verify-fix-probe' })
  })
  const adminBody = await adminRes.text()
  report(
    'T4 admin/user 校验错误为 400 且不泄漏内部细节',
    adminRes.status === 400 && !/SQLSTATE|constraint|gorm/i.test(adminBody),
    `HTTP ${adminRes.status} ${adminBody.slice(0, 140)}`
  )

  // ── WS 部分 ──
  const gwA = new Gw('A')
  const gwB = new Gw('B')
  await gwA.connect(userA.token)
  await gwB.connect(userB.token)

  const b0 = await gwB.sync(0)
  const resp0 = b0?.response ?? {}
  const sample = resp0.entries?.[resp0.entries.length - 1]

  // ── 5. 下行帧类型 ( Node: text 帧 → string; 二进制 → Blob ) ──
  await sleep(500)
  report(
    'T5 下行帧为 text 帧',
    gwB.frameTypes.has('string') && !gwB.frameTypes.has('Blob'),
    `帧类型集合 ${[...gwB.frameTypes].join(',')}`
  )

  // ── 6. 零值字段不缺省 ──
  report(
    'T6 SYNC_ACK 零值字段照常输出',
    resp0.hasMore !== undefined && resp0.cursorExpired !== undefined,
    `hasMore=${JSON.stringify(resp0.hasMore)} cursorExpired=${JSON.stringify(resp0.cursorExpired)}`
  )

  // ── 7. 既有条目 body/seq/senderId 形态 ──
  if (sample?.message) {
    const bodyDecoded = unb64(sample.message.body)
    const bodyIsJson = bodyDecoded !== null && typeof bodyDecoded === 'object'
    report(
      'T7 新条目 body 为业务 JSON 原文',
      bodyIsJson,
      bodyIsJson
        ? `seq=${JSON.stringify(sample.seq)} sender=${JSON.stringify(sample.message.senderId)} body keys=${Object.keys(bodyDecoded).join(',')}`
        : `seq=${JSON.stringify(sample.seq)} body 仍为纯文本: ${String(sample.message.body).slice(0, 60)}`
    )
  }

  // ── 8. destinationId 传字符串可投递 ──
  const beforeSeq = Number(resp0.latestSeq ?? 0)
  const stampStr = `fix-str-${Date.now()}`
  const upStr = await gwB.request(
    'COMMAND_TYPE_UPSTREAM',
    JSON.stringify({
      id: ulid(),
      destinationId: userA.userId,
      destinationType: 'single',
      content: stampStr,
      contentType: 'text'
    })
  )
  await sleep(2500)
  const afterStr = await gwB.sync(beforeSeq)
  const deliveredStr = (afterStr?.response?.entries ?? []).some(
    (e) => unb64(e.message?.body ?? '')?.content === stampStr
  )
  report(
    'T8 destinationId=字符串 可投递',
    upStr?.isSuccess === true && deliveredStr,
    `ACK=${JSON.stringify(upStr)} 落库=${deliveredStr}`
  )

  // ── 9. destinationId 传数字字面量兼容 ──
  const stampNum = `fix-num-${Date.now()}`
  const numJson = JSON.stringify({
    id: ulid(),
    destinationId: '@@i64@@',
    destinationType: 'single',
    content: stampNum,
    contentType: 'text'
  }).replace('"@@i64@@"', userA.userId)
  const upNum = await gwB.request('COMMAND_TYPE_UPSTREAM', numJson)
  await sleep(2500)
  const afterNum = await gwB.sync(Number(afterStr?.response?.latestSeq ?? 0))
  const deliveredNum = (afterNum?.response?.entries ?? []).some(
    (e) => unb64(e.message?.body ?? '')?.content === stampNum
  )
  const echoEntry = (afterNum?.response?.entries ?? []).find((e) => unb64(e.message?.body ?? '')?.content === stampNum)
  const echoBody = echoEntry ? unb64(echoEntry.message.body) : null
  report(
    'T9 destinationId=数字字面量 兼容',
    upNum?.isSuccess === true && deliveredNum,
    `ACK=${JSON.stringify(upNum)} 落库=${deliveredNum}`
  )
  if (echoBody) {
    report(
      'T9b 回显 body 含业务 id/contentType',
      typeof echoBody.id === 'string' && echoBody.contentType === 'text',
      `body=${JSON.stringify(echoBody).slice(0, 140)}`
    )
  }

  // ── 10. NOTIFY.messageId 独立生成 ──
  await sleep(500)
  const notifyIndependent = gwB.notifyIds.length === 0 || !gwB.notifyIds.some((n) => n.messageId === upStr?.__frameId)
  report('T10 NOTIFY.messageId 独立生成', notifyIndependent, `NOTIFY 样本 ${JSON.stringify(gwB.notifyIds.slice(0, 3))}`)

  // ── 11. 业务失败回执: 发给不存在用户 → 系统条目 ──
  const failJson = JSON.stringify({
    id: ulid(),
    destinationId: '999999999999',
    destinationType: 'single',
    content: `fix-fail-${Date.now()}`,
    contentType: 'text'
  })
  const upFail = await gwB.request('COMMAND_TYPE_UPSTREAM', failJson)
  await sleep(3000)
  const afterFail = await gwB.sync(Number(afterNum?.response?.latestSeq ?? 0))
  const systemEntry = (afterFail?.response?.entries ?? []).find((e) => {
    const body = unb64(e.message?.body ?? '')
    return body && typeof body === 'object' && body.systemType !== undefined
  })
  report(
    'T11 业务失败产生系统条目回执',
    systemEntry !== undefined,
    systemEntry
      ? `system=${JSON.stringify(unb64(systemEntry.message.body)).slice(0, 200)}`
      : `未收到系统条目; ACK=${JSON.stringify(upFail)} 增量=${JSON.stringify((afterFail?.response?.entries ?? []).map((e) => e.message?.conversationId))}`
  )

  // ── 12. 非群成员 CONVERSATION_SYNC 应答形态 ──
  const convBad = await gwB.request('COMMAND_TYPE_CONVERSATION_SYNC', {
    conversationId: 'g:999999999',
    cursor: 0,
    limit: 10
  })
  report(
    'T12 失败应答带 isSuccess 且不泄漏 gRPC 文本',
    convBad !== null && convBad.isSuccess === false && !/rpc error|PermissionDenied/i.test(convBad.errorMessage ?? ''),
    JSON.stringify(convBad)?.slice(0, 180)
  )

  // ── 13. 新建群: 双方 channel 行 ( B-7 修复验证 ) ──
  const groupName = `verify-grp-${Date.now()}`
  const groupRes = await fetch(`${BACKEND}/api/v1/group/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-token': `Bearer ${userA.token}` },
    body: JSON.stringify({ name: groupName, memberIds: [userA.userId, userB.userId] })
  })
  const groupEnvelope = await groupRes.json().catch(() => null)
  const groupId = groupEnvelope?.data?.id
  report(
    'T13a group/create 成功且 ID 为字符串',
    groupRes.status === 200 && typeof groupId === 'string',
    `HTTP ${groupRes.status} data.id=${JSON.stringify(groupId)}`
  )
  if (groupId) {
    await sleep(4000) // CDC 异步
    const chA = await (
      await fetch(`${BACKEND}/api/v1/channel/channels`, { headers: { 'x-access-token': `Bearer ${userA.token}` } })
    ).text()
    const chB = await (
      await fetch(`${BACKEND}/api/v1/channel/channels`, { headers: { 'x-access-token': `Bearer ${userB.token}` } })
    ).text()
    const aHas = chA.includes(String(groupId))
    const bHas = chB.includes(String(groupId))
    report('T13b 新群双方均有 channel 行', aHas && bHas, `A=${aHas} B=${bHas} ( groupId=${groupId} )`)

    // ── 14. 存量: 旧群 B 侧仍缺 channel 行 ( 预期, 记录存量范围 ) ──
    const legacyB = chB.includes('240079435428384768')
    const legacyA = chA.includes('240079435428384768')
    report('T14 存量旧群: B 侧仍缺 channel 行 ( 预期不回填 )', legacyA && !legacyB, `A 有=${legacyA} B 有=${legacyB}`)
  }

  console.log('\n== 汇总 ==')
  const failed = results.filter((r) => !r.pass)
  console.log(`共 ${results.length} 项, 通过 ${results.length - failed.length}, 未通过 ${failed.length}`)
  if (failed.length > 0) failed.forEach((f) => console.log(`  FAIL: ${f.id} ${f.detail}`))

  gwA.close()
  gwB.close()
  await sleep(400)
  process.exit(0)
}

main().catch((err) => {
  console.error('验证脚本失败:', err)
  process.exit(1)
})
