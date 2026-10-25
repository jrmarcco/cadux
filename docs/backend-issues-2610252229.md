# 后端服务问题清单 ( hermet / synp )

> 首轮记录: 2026-10-25 22:29 · 复测: 2026-10-25 23:52 ( 后端修复重新部署后 )
> 验证方式: cadux 桌面客户端 E2E + `scripts/ws-smoke.mjs` / `scripts/ws-verify-fixed.mjs`
> 所有问题均已在本地部署 ( hermet:10081 / synp:10071 ) 复现并留有证据;
> 客户端侧规避实现见 `src/shared/lib/lossless-json.ts` 与 `src/features/messaging/`。
> 复测**新发现**的问题见 [backend-issues-2610252352.md](./backend-issues-2610252352.md)。

## 复测结果 ( 2026-10-25 23:52, 新契约验证 16/16 通过 )

首轮 13 项中 **12 项已确认修复**, B-7 为新写入已修复 + 存量不回填 ( 见文末 S-1 )。

| #    | 问题                                                  | 状态                                                      | 复测证据                                                                                               |
| ---- | ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| B-1  | HTTP/JWT int64 以 JSON number 下发, JS 精度损坏       | ✅ 已修复                                                 | JWT `user_id` 为字符串 ( `"240070963854417920"` ); contacts/channels 全部 ID 带引号                    |
| B-2  | UPSTREAM destinationId 传字符串被静默丢弃             | ✅ 已修复                                                 | 字符串与数字字面量两种形态均可投递落库                                                                 |
| B-3  | 落库 body 为纯文本 content, 非 body 原文              | ✅ 已修复                                                 | 回显 body 为原文 JSON, 业务 `id`/`contentType` 完整, 数字/字符串形态原样保留                           |
| B-4  | 落库 message_id = 帧 messageId 未在文档说明           | ✅ 已修复 ( 文档 §7 显式声明 )                            | 回显 messageId = 帧 ID, 与文档一致                                                                     |
| B-5  | 业务级失败静默丢弃, 无回执                            | ✅ 已修复                                                 | 失败产生 `systemType: "send_failed"` 系统条目, 经 SYNC 送达, 含 `upstreamId` 可关联 pending            |
| B-6  | CORS 预检 ( OPTIONS ) 被 401 拦截                     | ✅ 已修复                                                 | OPTIONS 返回 204 + `access-control-allow-origin: http://localhost:5173`                                |
| B-7  | 群 channel CDC 部分成员缺 channel 行                  | ✅ 新写入已修复 ( 存量见 S-1 )                            | 新建群 `240138057232138240` A/B 双方 channels 均含该群行                                               |
| B-8  | 下行帧为二进制帧 ( Blob 投递 )                        | ✅ 已修复                                                 | 下行帧为 text 帧 ( string )                                                                            |
| B-9  | 顶号瞬间新连接 AUTH_ACK 可能丢失                      | ✅ 已知行为 ( 文档 §13 声明尽力而为, 重复 AUTH 幂等兜底 ) | —                                                                                                      |
| B-10 | protojson 省略 false 值 / errorMessage 泄漏 gRPC 文本 | ✅ 已修复                                                 | `hasMore`/`cursorExpired`/`isSuccess`/空 `errorMessage` 照常输出; 失败文本不再含 `rpc error: code=...` |
| B-11 | NOTIFY.messageId 复用触发消息的 UPSTREAM 帧 ID        | ✅ 已修复                                                 | NOTIFY messageId 为服务端独立生成的 32 位 hex                                                          |
| B-12 | 存量纯文本 body                                       | ✅ 已知行为 ( 文档 §13 声明存量兼容 )                     | —                                                                                                      |
| B-13 | admin/user 500 泄漏 SQL 内部细节                      | ✅ 已修复                                                 | 缺参返回 400 + `invalid param: email or mobile is required`, 无 SQL/约束名                             |

## 首轮详细记录 ( 2026-10-25 22:29, 修复前 )

### B-1 hermet: HTTP / JWT 将 int64 ID 序列化为 JSON 数字, JS 客户端精度损坏

- **现象**: `contacts` / `channels` 响应与 JWT `user_id` 均为无引号数字。超出 ±(2^53-1) 的 ID
  经 JS `JSON.parse` → `JSON.stringify` 往返后损坏 ( 实测 `134605228232032256` ↔ `134605228232032260` )。
- **后果**: 以损坏 ID 作为 destinationId 发消息被服务端判定"非联系人"**静默丢弃**
  ( hermet 日志: `single chat validation failed ... receiver_id=134605228232032260 ... are not contacts` );
  联系人 ID 展示错误; 会话 key 与服务端不一致。
- **建议**: 与 WS 链路一致, 全部 int64 以字符串序列化 ( protojson 风格 )。
- **客户端规避**: `parseJsonLossless` ( ≥16 位整数字面量解析为字符串 )、JWT 用正则无损提取、
  全链路 ID 以十进制字符串承载。

### B-2 hermet: UPSTREAM body 的 destinationId 仅接受 JSON 数字, 传字符串被静默丢弃

- **现象**: 对照实验中 `destinationId: "134605228232032256"` ( 字符串 ) 被 ACK 后无 NOTIFY、不落库;
  精确数字字面量 `134605228232032256` 正常投递。
- **叠加危害**: 与 B-1 叠加后, JS 客户端**没有任何常规序列化手段**能安全发送大 int64 目标
  ( `JSON.stringify(Number)` 输出损坏的最短表示 )。
- **客户端规避**: `encodeUpstreamBody` 以占位符替换注入原始数字字面量。

### B-3 hermet: 落库 message.body 为纯文本 content, 不是 UPSTREAM body 原文

- **现象**: `INSERT INTO message_1 ... body='e2e-b2a-fix2-...'` —— body 列直接存了 `content` 字段文本,
  业务 JSON 的 `id` / `destinationType` / `contentType` 等字段全部丢失。
- **与文档冲突**: frontend-api.md §7 "body 是发送者 UPSTREAM 帧 body 的原文"。
- **后果**: ① 多端自同步回显无法按 body.id 与本地 pending 合并 ( 客户端只能改按帧 ID, 见 B-4 );
  ② `contentType: image` 等类型信息在同步链路丢失, 接收端无法区分消息类型。
- **客户端规避**: 回显按帧 ID 合并 ( B-4 ); 类型信息暂时全部按 text 渲染。

### B-4 hermet: 落库 message_id = UPSTREAM 帧 messageId ( 非 body.id )

- **现象**: 回显消息的 `messageId` 即发送端网关帧的 ULID; body.id 与落库 ID 无关。
- **文档未说明**; 前端多端合并策略必须依赖此行为 ( 见 B-3 规避 )。建议在文档中显式声明。

### B-5 业务级失败静默丢弃, 无任何客户端可见回执

- 非好友 / 目标用户不存在 / body 反序列化失败 ( `json: cannot unmarshal string ...` ) 的 UPSTREAM
  均返回 `UPSTREAM_ACK{isSuccess:true}` 后被丢弃, 仅服务端日志留痕。
- 文档 §11 已声明"规划中", 此处确认现状仍未实现, 且**反序列化失败**这一类未在文档列出。

### B-6 hermet: CORS 预检 ( OPTIONS ) 在鉴权路由被 401 拦截

- `OPTIONS /api/v1/channel/channels` ( 带 Origin ) 返回 401 且无 CORS 响应头 →
  浏览器直连后端不可用, Web 客户端必须同源代理 ( cadux dev 走 vite proxy 规避 )。

### B-7 hermet: 群 channel CDC 写入不完整 ( 部分成员无 channel 行 )

- 同一群聊 `g:240079435428384768`: A 的 `channels` 有 channel 行 ( channelName=e2e-group-fixed ),
  B 的 `channels` 无该行, B 侧只能靠收件箱 fallback 生成 `群聊 240079435428384768` 占位会话。
- 双账号 channels 响应对比可复现 ( 2026-10-25 )。

### B-8 synp: 下行帧为二进制帧 ( payload 是 JSON 文本 )

- 浏览器 `WebSocket.onmessage` 以 **Blob** 投递, Node 亦为 Blob; 文档称"JSON 文本帧"。
- 未按帧类型解析的客户端会静默丢弃全部下行 ( cadux 修复前即此症状: 无限 AUTH 重试 )。
- 建议网关改发 text 帧, 或文档显式标注。

### B-9 synp: 顶号瞬间新连接的 AUTH_ACK 可能丢失

- 同账号同 device 新旧连接交替时, 新连接的 AUTH_ACK 可能因旧连接关闭竞态未送达
  ( synp 日志 `failed to send message: connection closed` ), 依赖协议"重复 AUTH 幂等"兜底重发。

### B-10 protojson 默认值省略 + 错误信息泄漏

- `SYNC_ACK.response` 在 false 时**缺省** `hasMore` / `cursorExpired` 字段 ( 文档示例均展示存在 );
- 失败应答缺省 `isSuccess`, 仅 `errorMessage`; 且 `errorMessage` 直接透传内部 gRPC 文本
  ( `failed to conversation sync: rpc error: code = PermissionDenied ...` )。

### B-11 synp: NOTIFY 帧 messageId 复用触发消息的 UPSTREAM 帧 ID

- 不符合"帧唯一 ID"语义, 客户端不能以 NOTIFY.messageId 做帧关联; 另 NOTIFY 重复下发常见
  ( 单条消息两端各 2 条 ), 按 latestSeq 比较可免疫。

### B-12 历史数据: 非 JSON 纯文本 body 透传入库

- 收件箱存在 body 为 `e2e-ws-msg-*` / `hello B from admin api` 等纯文本的存量消息
  ( 旧测试客户端非法 body 未校验直接落库 ), 客户端需按纯文本 content 兼容渲染。

### B-13 hermet: admin/user 接口错误信息泄漏内部实现

- `POST /api/v1/admin/user` 缺 `gender` 时返回 HTTP 500 + 原始 SQL 错误文本
  ( `violates check constraint "chk_gender_0" (SQLSTATE 23514)` ), 泄漏表结构与约束命名;
  且错误信封使用 `msg` 字段而非 `message` ( 与文档 §3 一致但与正常信封不一致 )。

## 存量数据说明

### S-1 修复前创建的群: 错误分片的 channel 行仍在原处 ( B-7 复测补充 )

- B-7 修复只影响**新写入**; 修复前创建的群 ( 如 `g:240079435428384768` / e2e-group-fixed )
  的 channel 行仍落在错误分片: **A 侧有 channel 行, B 侧没有** ( 2026-10-25 23:52 复测再次确认 )。
- 影响: B 端该群在会话列表只能以收件箱 fallback 生成 `群聊 240079435428384768` 占位
  ( 无群名/头像 ); 消息收发不受影响 ( 走收件箱/timeline )。
- 处置建议: 一次性回填脚本按新分片规则迁移存量 channel 行, 或接受占位展示。
