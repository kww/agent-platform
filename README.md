# Agent Platform

> 约束驱动的 Agent 执行平台 — harness + runtime + workflows

---

## 🚀 快速开始

### CLI 命令

```bash
# 查看版本
npx @dommaker/runtime --version
npx @dommaker/workflows --version

# 列出能力
npx @dommaker/workflows list workflows
npx @dommaker/workflows list tools
npx @dommaker/workflows list steps

# 执行工作流
npx @dommaker/runtime run wf-dev --project ~/myapp
npx @dommaker/runtime run wf-dev --input project_path=~/myapp --input requirement="实现登录"

# 查询执行状态
npx @dommaker/runtime status <executionId>

# 验证工作流
npx @dommaker/runtime validate wf-dev

# 启动 HTTP API
npx @dommaker/runtime server --port 3001
```

### 铁律检查

```bash
harness check         # 检查约束
harness passes-gate   # 验证测试通过
harness status        # 查看状态
```

---

## 🏗️ 架构关系

| 层 | 包 | 职责 |
|---|---|------|
| **约束层** | @dommaker/harness | Iron Laws + Gates + Checker |
| **执行层** | @dommaker/runtime | Workflow 执行引擎 |
| **定义层** | @dommaker/workflows | Workflow 数据包 |

**一句话**：runtime 在关键节点调用 harness.check()，确保执行符合约束。

---

## 📦 Packages

| 包 | 版本 | 说明 | CLI |
|------|:----:|------|:---:|
| **@dommaker/runtime** | 0.0.4 | 工作流执行引擎 | `npx @dommaker/runtime` |
| **@dommaker/workflows** | 0.0.5 | 工作流定义（数据包）| `npx @dommaker/workflows` |

---

## 📊 能力统计

| 类型 | 数量 | 说明 |
|------|:----:|------|
| Workflows | 29 | 完整工作流定义 |
| Tools | 113 | 原子工具能力 |
| Contexts | 5 | 上下文模板 |
| Templates | 3 | 项目模板 |

---

## 📁 目录结构

```
packages/
├── runtime/          # @dommaker/runtime - 执行引擎
│   ├── src/
│   │   ├── core/       # 核心引擎：executor, parser, registry
│   │   ├── orchestration/  # 编排层：task-queue, role-manager
│   │   ├── monitoring/  # 监控：performance, quality-scorer
│   │   └── utils/      # 工具：config, logger
│   └── dist/          # 编译产物
│
└── workflows/        # @dommaker/workflows - 工作流定义
    ├── workflows/      # 29 个工作流定义
    ├── tools/          # 113 个工具定义
    │   ├── core/       # 核心工具：file, git, npm, docker
    │   ├── std/        # 业务工具：analysis, design, development...
    │   └── ext/        # 外部集成：browser
    ├── contexts/       # 5 个上下文模板
    ├── templates/      # 3 个项目模板
    └── registry/       # 能力注册表
```

---

## 🔧 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm --filter @dommaker/runtime build
pnpm --filter @dommaker/workflows build

# 测试
pnpm test

# 发布
cd packages/runtime && npm publish --access public
cd packages/workflows && npm publish --access public
```

---

## 📝 License

MIT

---

*更新时间：2026-04-28*