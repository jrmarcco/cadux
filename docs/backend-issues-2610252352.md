# 后端服务问题清单 · 新发现问题 ( hermet / synp )

> 记录时间: 2026-10-25 23:52 · 来源: 后端修复重新部署后的回归复测
> 验证方式: `scripts/ws-verify-fixed.mjs` 新契约验证 + 收件箱回显核对
> 首轮清单及复测状态见 [backend-issues-2610252229.md](./backend-issues-2610252229.md)

## 新 Bug

### B-14 hermet: invalid_destination 系统回执条目 conversationId 为空字符串 ( 未修复 )

- **现象**: 向**自身**发送消息触发 `send_failed` / `reason: "invalid_destination"` 时,
  收件箱条目的 `conversationId` 为 `""`。对照: `not_allowed` 场景条目携带规范
  `s:<minUid>:<maxUid>` ( 如 `s:999999999999:240070963854417920` )。
- **后果**: 客户端无法将该回执归属到任何会话; 直接归一化会被误判为群聊 key (`g:`),
  产生垃圾会话条目。cadux 已做防御 ( 回落至失败 pending 所在会话, 无 pending 则丢弃渲染 )。
- **建议**: invalid_destination 场景按触发帧目标 ( 或发送者会话 ) 填充 conversationId。
- **证据**: 2026-10-25 收件箱 seq=33: `conversationId: ""`,
  body `{"systemType":"send_failed","reason":"invalid_destination","upstreamId":"01M5SVQ6...","content":"消息发送失败: 目的地不存在或类型非法"}`。

## 观察记录 ( 非契约违反, 供参考 )

### O-1 send_failed 系统条目的 reason 映射与直觉相反

- 发给**不存在的用户** ( 999999999999 ) → `reason: "not_allowed"` ( "对方不是你的联系人…" );
  发给**自己** ( 用户存在 ) → `reason: "invalid_destination"` ( "目的地不存在或类型非法" )。
- 直觉上: 目标不存在应 `invalid_destination`, 存在但非好友应 `not_allowed`; 建议复核。
- 两种情况均有系统条目与可展示文案, 对前端功能无影响。

### O-2 CONVERSATION_SYNC 失败 errorMessage 仍带服务端处理前缀

- 实际: `failed to conversation sync: user is not an active member of the conversation`。
- 已不再泄漏 gRPC code; 文档未承诺 errorMessage 格式, 不算不一致;
  若后续面向用户展示建议改为中性文案。
