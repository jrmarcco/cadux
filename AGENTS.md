# [项目名] 跨平台桌面应用项目

---

## 1. 技术栈与环境

- **语言**: TypeScript（strict: true）
- **桌面运行时**: Electron ≥ 44.8.0
- **Node 运行时**: ≥ 22.12.0
- **前端构建**: Vite ( 生产构建可换 Rspack )
- **前端框架**: React 18+
- **服务端状态**: TanStack Query ( 缓存、重试、失效统一管理 )
- **客户端状态**: Zustand ( 只在必要时使用，禁止做服务端状态 )
- **质量**: ESLint + Prettier + Stylelint + commitlint + husky ( CI 必须全绿 )

---

## 2. 目录结构

采用 Feature-first + 分层 混合结构:

```
src/
├── app/                    # 应用装配层：入口、Provider、路由表、全局样式
│   ├── App.tsx
│   ├── providers/
│   ├── router/
│   └── styles/
├── pages/                  # 路由页面（只做组合，不含业务逻辑）
│   ├── order-list/
│   │   ├── index.tsx
│   │   └── route.ts
│   └── order-detail/
├── features/               # 业务功能模块（核心）
│   ├── order-submit/
│   │   ├── api/            # 该功能的数据请求与 DTO
│   │   ├── components/     # 功能私有组件
│   │   ├── hooks/
│   │   ├── model/          # 状态、store、领域类型
│   │   ├── lib/            # 纯函数工具（可单测）
│   │   ├── types.ts
│   │   └── index.ts        # 对外唯一出口（Public API）
│   └── user-auth/
├── entities/               # 跨 feature 复用的领域对象（Order、User）
├── shared/                 # 与业务无关的基础设施
│   ├── ui/                 # 通用组件（Button、Modal、Table）
│   ├── api/                # http client、拦截器、错误归一化
│   ├── lib/                # 日期、金额、存储等纯工具
│   ├── hooks/
│   ├── config/
│   └── types/
├── assets/
└── test/                   # 测试工具、msw handlers、fixtures

```

分层依赖规则: app → pages → features → entities → shared

---

## 3. Git与版本控制

- **Commit Message规范**: **[严格遵循]** Conventional Commits 规范 (https://www.conventionalcommits.org/)。
  - 格式: `<type>(<scope>): <subject>`
  - 当被要求生成commit message时，必须遵循此格式。

---

---

## 5. 补充

- 要求使用 pnpm。
- Windows 环境下，Power shell 找不到 Node 环境时，可以使用命令 `fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression` 设置环境。
- 碰到网络问题可以使用代理 `http://127.0.0.1:7890`。
