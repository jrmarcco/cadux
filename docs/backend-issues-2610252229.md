# 后端服务问题清单 ( hermet / synp )

> 记录时间: 2026-10-25 · 验证方式: cadux 桌面客户端 E2E + `scripts/ws-smoke.mjs` 协议冒烟
> 所有问题均已在本地部署 ( hermet:10081 / synp:10071 ) 复现并留有证据;
> 客户端侧规避实现见 `src/shared/lib/lossless-json.ts` 与 `src/features/messaging/`。

## 严重 ( 已在客户端做规避 )

### B-1 hermet: HTTP / JWT 将 int64 ID 序列化为 JSON 数字, JS 客户端精度损坏

- **现象**: `contacts` / `channels` 响应与 JWT `user_id` 均为无引号数字。超出 ±(2^53-1) 的 ID
  经 JS `JSON.parse` → `JSON.stringify` 往返后损坏 ( 实测 `134605228232032256` ↔ `134605228232032260` )。
- **后果**: 以损坏 ID 作为 destinationId 发消息被服务端判定"非联系人"**静默丢弃**
  ( hermet 日志: `single chat validation failed ... receiver_id=134605228232032260 ... are not contacts` );
  联系人 ID 展示错误; 会话 key 与服务端不一致。
- **证据**: 2026-10-25 hermet 日志 `WARN message-service single chat validation failed` × 多次。
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

## 中等

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

## 轻微 ( 文档差异 / 协议体验 )

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
  ( 单条消息两端各收到 2 条 ), 按 latestSeq 比较可免疫。

### B-12 历史数据: 非 JSON 纯文本 body 透传入库

- 收件箱存在 body 为 `e2e-ws-msg-*` / `hello B from admin api` 等纯文本的存量消息
  ( 旧测试客户端非法 body 未校验直接落库 ), 客户端需按纯文本 content 兼容渲染。

### B-13 hermet: admin/user 接口错误信息泄漏内部实现

- `POST /api/v1/admin/user` 缺 `gender` 时返回 HTTP 500 + 原始 SQL 错误文本
  ( `violates check constraint "chk_gender_0" (SQLSTATE 23514)` ), 泄漏表结构与约束命名;
  且错误信封使用 `msg` 字段而非 `message` ( 与文档 §3 一致但与正常信封不一致 )。
