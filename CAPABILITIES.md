# agent-platform 功能清单

> 最后更新: 2026-04-27 by titi
> 铁律：代码变更必须同步更新此文件

## 约束集成 (packages/runtime/src/core/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **Constraint Checker** | executor.ts | executeWorkflow 入口检查约束 | ✅ | 2026-04-26 |
| **CheckpointValidator** | executor.ts | 13 种检查类型验证 | ✅ | 2026-04-27 |
| **PassesGate** | executor.ts | 任务完成验证 | ✅ | 2026-04-26 |

## 执行引擎 (packages/runtime/src/core/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| 工作流执行 | executor.ts | Workflow 执行引擎 | ✅ | 2026-04-20 |
| 上下文管理 | context.ts | 执行上下文 | ✅ | 2026-04-20 |
| 步骤调度 | scheduler.ts | 步骤执行调度 | ✅ | 2026-04-20 |

## 工具执行 (packages/runtime/src/executors/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **内置工具** | tool.ts | 14 种内置工具（spawn-codex, file-*, git-*, npm-*） | ✅ | 2026-04-20 |
| 外部工具 | external-tool.ts | 外部脚本执行 | ✅ | 2026-04-20 |

## 工作流定义 (packages/workflows/src/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| wf-dev | workflows/wf-dev.ts | 开发工作流 | ✅ | 2026-04-20 |
| wf-test | workflows/wf-test.ts | 测试工作流 | ✅ | 2026-04-20 |
| wf-deploy | workflows/wf-deploy.ts | 部署工作流 | ✅ | 2026-04-20 |

## 包版本

| 包 | 版本 | 说明 |
|------|:----:|------|
| @dommaker/runtime | 0.0.4 | 工作流执行引擎 |
| @dommaker/workflows | 0.0.5 | 工作流定义 |
| @dommaker/harness | ^0.7.7 | 约束框架（依赖）|

---

## Iron Laws 集成

从 `@dommaker/harness` 引入的约束：

| # | Iron Law | 集成位置 |
|:--:|----------|---------|
| 1 | NO BYPASSING CHECKPOINTS | executor.ts → verifyCheckpoint() |
| 2 | NO SELF APPROVAL | executor.ts → PassesGate |
| 3 | NO COMPLETION WITHOUT VERIFICATION | executor.ts → validateCompletion() |
| 4 | NO TEST SIMPLIFICATION | 测试层约束 |
| 5 | ONE TASK PER SESSION | 调度约束 |
| 6 | VERIFY EXTERNAL CAPABILITY | 设计阶段约束 |
| 7 | REVIEW IMPLEMENTATION AGAINST REQUIREMENTS | 完成阶段约束 |

---

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/runtime/execute` | POST | 执行工作流 |
| `/api/runtime/status/:id` | GET | 查询执行状态 |
| `/api/runtime/list` | GET | 列出能力 |

---

## CLI 命令

```bash
agent-runtime --version          # 查看版本
agent-runtime list workflows     # 列出工作流
agent-runtime run wf-dev         # 执行工作流
agent-runtime status <id>        # 查询状态
agent-runtime server --port 3001 # 启动 API 服务
```

---

## 相关文档

- [README.md](../README.md) — 项目介绍
- [harness-integration.md](../docs/harness-integration.md) — harness 集成说明（本地）
- [roadmap.md](../docs/roadmap.md) — 任务追踪（本地）
