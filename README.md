# cadux

一个 im 桌面 GUI 客户端。
cadux 取自 Caduceus ( 赫尔墨斯双蛇杖，即信使权杖 )。

## 技术栈

- Electron ≥ 44 + TypeScript ( strict ) + React 19
- 构建: electron-vite ( Vite 8 )
- 服务端状态: TanStack Query · 客户端状态: Zustand
- 类型检查: tsc ( TypeScript 7 原生编译器 )
- Lint: ESLint + typescript-eslint ( 关键路径 type-aware ) + oxlint/tsgolint ( 快速反馈 ) + Stylelint
- 其他: Prettier + commitlint + husky + Vitest

## 快速开始

```bash
pnpm install        # 首次安装会自动下载 Electron 二进制
pnpm dev            # 开发模式 ( 主进程 / 预加载 / 渲染层均支持热更新 )
pnpm build          # 生产构建, 输出至 out/
pnpm typecheck      # tsc ( TS7 原生 ) 双 tsconfig 类型检查
pnpm lint           # ESLint ( CI 权威, 关键路径含 type-aware 规则 )
pnpm lint:fast      # oxlint + tsgolint 快速反馈层 ( pre-commit 同款 )
pnpm lint:style     # Stylelint
pnpm test           # Vitest 单测
```

服务端地址通过环境变量覆盖 ( 见 `src/shared/config/env.ts` ):

```
VITE_API_BASE_URL=http://127.0.0.1:10081   # 后端 hermet ( HTTP )
VITE_GATEWAY_WS_URL=ws://127.0.0.1:10071   # 网关 synp ( WebSocket )
```

> Windows 下若 pnpm install 未触发 Electron 二进制下载，重装依赖即可
> ( 构建脚本白名单见 `pnpm-workspace.yaml` 的 `allowBuilds` )；网络受限时可用
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 加速。

## 打包分发 ( electron-builder )

打包配置见 `electron-builder.yml`，`pnpm run build` 产出的 `out/` 三端产物
由 electron-builder 整体打入 asar ( 运行时依赖已全部打包进 bundle，asar 内无 node_modules )：

```bash
pnpm run icons      # 生成 build/icon.{png,ico,icns} ( sharp 程序化绘制, 改图案编辑 scripts/make-icons.mjs )
pnpm run pack:win   # 仅解包目录 ( release/win-unpacked ), 不做安装器, 快速验证
pnpm run dist:win   # Windows NSIS 安装包 → release/cadux-Setup-<version>.exe ( x64 )
pnpm run dist:mac   # macOS DMG → release/cadux-<version>-<arch>.dmg ( x64 + arm64 )
```

约定 ( 与 live-matrix 项目一致 )：

- 产物输出至 `release/`，`build/` 存放打包资源 ( 图标等 ) 并随仓库提交；
- `dist:mac` 需在 macOS 上执行 ( DMG 制作依赖 hdiutil )；`identity: null`
  跳过签名，需要分发签名版本时自行配置证书；
- 版本号变更走 `pnpm version patch|minor|major` ( 自动生成 commit + tag )，
  产物文件名自动带新版本号；发版前先把工作区提交干净。

网络受限时打包工具同样走镜像 ( 也可写入 shell profile )：

```bash
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
```

## 工具链架构 ( TypeScript 7 过渡期方案 )

三层职责，互为补充：

| 层       | 命令                                | 类型后端                                   | 职责                                 |
| -------- | ----------------------------------- | ------------------------------------------ | ------------------------------------ |
| 类型检查 | `pnpm typecheck`                    | TypeScript **7.0.2** 原生 ( `tsc` )        | 全项目类型检查权威                   |
| 快速反馈 | `pnpm lint:fast` / husky pre-commit | tsgolint ( tsgo, 与 tsc **同一张类型图** ) | 毫秒级 lint + 核心 type-aware 规则   |
| CI Lint  | `pnpm lint`                         | TypeScript **6** ( typescript-eslint )     | 全量 lint 规则 + 关键路径 type-aware |

### 双包别名 ( 微软官方 side-by-side 方案 )

TypeScript 7.0 尚无编程 API ( 计划 7.1 )，而 typescript-eslint 依赖 JS API，
因此两个版本通过 npm 别名并存 ( 见 `package.json` devDependencies )：

```json
{
  "@typescript/native": "npm:typescript@7.0.2", // bin: tsc → TS7 原生
  "typescript": "npm:@typescript/typescript6@^6.0.2" // bin: tsc6; 模块 API → TS6 ( 供 typescript-eslint )
}
```

出处: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) 的
"running side-by-side with TypeScript 6.0" 一节；typescript-eslint 侧进度见
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
( 支持 TS ≥ 7.1, PR #12803 )。

### type-aware 规则的两级分工

- **oxlint + tsgolint** ( `.oxlintrc.json`, `options.typeAware: true` )：作用于全部文件，
  覆盖 `no-floating-promises`、`no-misused-promises`、`switch-exhaustiveness-check`。
  tsgolint 稳定版 ( 2026-07 ) 已覆盖 typescript-eslint 59/61 条 type-aware 规则，
  且与 tsc 共享 TS7 类型图，无双后端分歧。本机实测 66 文件约 250ms。
- **ESLint + typescript-eslint** ( `eslint.config.mjs` 中标记为「关键路径 type-aware 收敛」的块 )：
  仅 `features/messaging` / `features/user-auth` / `shared/api` 启用
  `recommendedTypeChecked` + `projectService`，收敛 TS6 后端的运行范围；
  上述三条核心规则在此重复声明，保证 CI 强制 ( oxlint 只是反馈层，不作为 CI gate )。

### 分歧处理与退出路径

- 若 tsc ( TS7 ) 与 typescript-eslint ( TS6 ) 极少数字段判断不一致，以 `tsc` 为准，
  lint 侧用行内注释或规则微调收敛，并在本节记录。
- 当 typescript-eslint 发布 TS ≥ 7.1 支持 ( 预计 2026 秋 )：
  1. 删除 `typescript` 的 `npm:@typescript/typescript6` 别名，换回正式包；
  2. 复评 tsgolint 与 typescript-eslint 的角色分工 ( 可能完全收编到单引擎 )；
  3. 拆除本节说明。

> 落地记录 ( 2026-10-25 )：TS 7.0.2 + typescript-eslint 8.72.0 + oxlint 1.89.0 +
> oxlint-tsgolint 7.0.2005 全量验证通过 ( typecheck / lint / lint:fast / stylelint /
> vitest 27 / build )；type-aware 生效性以「探针文件正反验证」确认
> ( 关键路径报 no-floating-promises，范围外不报，oxlint 全局报 )。

## 目录结构

Feature-first + 分层，依赖方向: `app → pages → features → entities → shared`。

```
src/
├── app/          # 装配层: 入口、Provider、路由、全局样式
├── pages/        # 路由页面 ( login / main ), 只做组合
├── features/     # 业务功能模块
│   ├── user-auth/     # 登录、token 存储、刷新
│   ├── messaging/     # 通信引擎: synp 网关客户端、同步游标、会话/消息存储
│   ├── session-list/  # 会话列表
│   ├── chat/          # 聊天面板
│   └── contacts/      # 联系人
├── entities/     # 跨 feature 领域对象 ( user / conversation )
├── shared/       # 基础设施 ( ui / api / lib / config / types )
├── assets/
└── test/         # Vitest 单测
electron/
├── main/         # 主进程 ( 无边框窗口、窗口形态切换 IPC )
└── preload/      # 预加载 ( contextBridge 暴露 desktop API )
scripts/
└── make-icons.mjs # 应用图标生成 ( sharp, 产出 build/icon.* )
build/            # 打包资源 ( 图标, 随仓库提交 )
release/          # electron-builder 产物 ( gitignore )
```

## 架构要点 ( 与服务端契约对应 )

- **落库即事实，推送即通知，游标驱动**: `NOTIFY {latestSeq}` 只触发比对，
  落后则 `SYNC` 拉增量；游标 ( 收件箱 seq + 各会话 conversationSeq ) 在
  messaging store 中统一维护。
- **幂等去重**: 收件箱按 `seq`、消息按 `messageId` 去重；
  自身发送的消息经 `body.id` ( 本地 bizId ) 与回推合并，消除重复。
- **UPSTREAM_ACK 仅网关级回执**: 发送乐观置 pending，ACK 后置 sent，
  超时/失败可原 messageId 重试；大群走读扩散，收到 `conversationUpdate`
  指针后二次 `CONVERSATION_SYNC` 拉正文。
- **重连**: 指数退避 ( 1s → 30s + 抖动 )；重连成功后立即主动 `SYNC` 兜底。
- 两份服务端文档对 `commandType` ( 数字 / 枚举名 ) 与业务 `body`
  ( JSON 原文 / base64 ) 表述不一致，客户端发送遵循 synp 网关文档
  ( 枚举名 + base64 )，接收端两者兼容。
