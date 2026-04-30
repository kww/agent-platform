# Agent Platform

> 约束驱动的 Agent 执行平台 — harness + runtime + workflows

---

## 🚀 快速开始

```bash
# 列出能力
npx @dommaker/workflows list workflows
npx @dommaker/workflows list tools

# 执行工作流
npx @dommaker/runtime run wf-dev --project ~/myapp

# 约束检查
harness check && harness passes-gate
```

---

## 🎯 核心能力

| 能力 | 状态 | 说明 | 详情 |
|------|:----:|------|------|
| Workflow 执行 | ✅ | 150+ 工作流定义 | [CAPABILITIES.md](CAPABILITIES.md) |
| 工具库 | ✅ | 113 个原子工具 | [CAPABILITIES.md](CAPABILITIES.md) |
| 约束集成 | ✅ | harness Iron Laws + Gates | [docs/harness-integration.md](docs/harness-integration.md) |
| Agent 共享 | ✅ | messages 传递 + TaskOutput | [orchestration/](packages/runtime/src/orchestration) |

→ **[完整功能清单](CAPABILITIES.md)**

---

## 📦 Packages

| 包 | 版本 | 用途 |
|------|:----:|------|
| @dommaker/runtime | 0.0.5 | 工作流执行引擎 |
| @dommaker/workflows | 0.0.6 | 工作流定义（150+ workflows + 113 tools）|
| @dommaker/harness | 0.8.3 | 约束框架（独立仓库）|

---

## 📁 目录结构

```
packages/
├── runtime/          # 执行引擎
│   └── src/
│       ├── core/       # executor, parser, registry
│       └── orchestration/  # task-queue, context-sharer
│
└── workflows/        # 工作流定义
    ├── workflows/      # 150+ 个工作流
    ├── tools/          # 113 个工具
    └── contexts/       # 5 个上下文模板
```

---

## 🔧 开发命令

```bash
pnpm install                    # 安装依赖
pnpm --filter @dommaker/runtime build   # 构建 runtime
pnpm --filter @dommaker/workflows build # 构建 workflows
pnpm test                       # 运行测试
```

---

## 🔗 详细文档

- → [CAPABILITIES.md](CAPABILITIES.md) — 功能清单
- → [docs/harness-integration.md](docs/harness-integration.md) — harness 集成
- → [packages/workflows/docs/FAQ.md](packages/workflows/docs/FAQ.md) — 工作流 FAQ
- → [packages/workflows/docs/workflow-development-guide.md](packages/workflows/docs/workflow-development-guide.md) — 开发指南

---

## 📝 License

MIT © dommaker