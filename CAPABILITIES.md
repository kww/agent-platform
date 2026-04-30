# agent-platform 功能清单

> 最后更新: 2026-04-30 by titi

---

## 一、核心能力概览

| 能力域 | 模块数 | 说明 |
|--------|:-----:|------|
| **约束集成** | 3 | harness 铁律集成 |
| **执行引擎** | 3 | 工作流执行 |
| **编排层** | 26 | 多 Agent 协作 |
| **工具执行** | 14 | 内置工具 |
| **工作流定义** | 150+ | workflows 库 |
| **API** | 4 | REST 端点 |

---

## 二、约束集成

从 `@dommaker/harness` 引入的 Iron Laws：

| # | Iron Law | 集成位置 |
|:--:|----------|---------|
| 1 | NO BYPASSING CHECKPOINTS | `executor.ts → verifyCheckpoint()` |
| 2 | NO SELF APPROVAL | `executor.ts → PassesGate` |
| 3 | NO COMPLETION WITHOUT VERIFICATION | `executor.ts → validateCompletion()` |
| 4 | NO TEST SIMPLIFICATION | 测试层约束 |
| 5 | ONE TASK PER SESSION | 调度约束 |
| 6 | VERIFY EXTERNAL CAPABILITY | 设计阶段约束 |
| 7 | REVIEW IMPLEMENTATION AGAINST REQUIREMENTS | 完成阶段约束 |

---

## 三、编排层（packages/runtime/src/orchestration/）

### 3.1 核心编排

| 模块 | 文件 | 功能 |
|------|------|------|
| Orchestrator | orchestrator.ts | 核心编排器，会议事件驱动 |
| RoleScheduler | role-scheduler.ts | 角色调度（优先级 + 依赖）|
| ContextSharer | context-sharer.ts | Redis 上下文共享 |
| TaskQueue | task-queue.ts | 任务队列（Redis）|
| TaskWorker | task-worker.ts | 任务工作者 |
| TaskOutput | task-output.ts | 任务输出管理 |

### 3.2 会议系统

| 模块 | 文件 | 功能 |
|------|------|------|
| MeetingCore | meeting-core.ts | 会议核心逻辑 |
| MeetingStore | meeting-store.ts | 会议存储接口 |
| MeetingStateMachine | meeting-state-machine.ts | 会议状态机 |
| MeetingSubscriber | meeting-subscriber.ts | 会议事件订阅 |
| DiscussionDriver | discussion-driver.ts | 讨论驱动（LLM 发言）|

### 3.3 任务处理

| 模块 | 文件 | 功能 |
|------|------|------|
| TaskSplitter | task-splitter.ts | 任务拆分器 |
| WorkflowBlocker | workflow-blocker.ts | 工作流阻塞检查 |
| WorkflowLibrary | workflow-library.ts | 工作流库管理 |
| CompanyMCPPool | company-mcp-pool.ts | 公司 MCP 池 |

### 3.4 门禁检查

| 模块 | 文件 | 功能 |
|------|------|------|
| GateChecker | gate-checker.ts | 门禁检查器（5 种 Gate）|
| SpecConstraintLayer | spec-constraint-layer.ts | Spec 约束层 |
| GateBypassManager | gate-bypass-manager.ts | 门禁绕过管理 |

### 3.5 监控与审计

| 模块 | 文件 | 功能 |
|------|------|------|
| PerformanceMonitor | performance-monitor.ts | 性能监控 |
| AuditChain | audit-chain.ts | 审计链 |
| FailureHandler | failure-handler.ts | 失败处理器 |

### 3.6 其他

| 模块 | 文件 | 功能 |
|------|------|------|
| ContextBridge | context-bridge.ts | 上下文桥接 |
| EconomyAdapter | economy-adapter.ts | 经济系统适配 |
| StateListener | state-listener.ts | 状态监听器 |

---

## 四、执行引擎（packages/runtime/src/core/）

| 模块 | 文件 | 功能 |
|------|------|------|
| 工作流执行 | executor.ts | Workflow 执行引擎 |
| 上下文管理 | context.ts | 执行上下文 |
| 步骤调度 | scheduler.ts | 步骤执行调度 |

---

## 五、工具执行（packages/runtime/src/executors/）

### 内置工具（14 种）

| 工具 | 功能 |
|------|------|
| `spawn-codex` | 启动 Codex Agent |
| `file-read` | 读取文件 |
| `file-write` | 写入文件 |
| `file-exists` | 检查文件存在 |
| `git-clone` | 克隆仓库 |
| `git-commit` | 提交更改 |
| `git-push` | 推送更改 |
| `npm-install` | 安装依赖 |
| `npm-test` | 运行测试 |
| `npm-build` | 构建项目 |
| `run-script` | 执行脚本 |
| `http-request` | HTTP 请求 |
| `llm-call` | LLM 调用 |
| `workflow-run` | 运行子工作流 |

---

## 六、API 端点

| 端点 | 方法 | 功能 |
|------|:----:|------|
| `/api/runtime/execute` | POST | 执行工作流 |
| `/api/runtime/status/:id` | GET | 查询执行状态 |
| `/api/runtime/list` | GET | 列出能力 |
| `/api/runtime/cancel/:id` | POST | 取消执行 |

---

## 七、CLI 命令

```bash
agent-runtime --version          # 查看版本
agent-runtime list workflows     # 列出工作流
agent-runtime run wf-dev         # 执行工作流
agent-runtime status <id>        # 查询状态
agent-runtime server --port 3002 # 启动 API 服务
```

---

## 八、包版本

| 包 | 版本 | 说明 |
|------|:----:|------|
| @dommaker/runtime | 0.0.5 | 工作流执行引擎 |
| @dommaker/workflows | 0.0.6 | 工作流定义 |
| @dommaker/harness | ^0.8.3 | 约束框架（依赖）|

---

## 相关文档

- [README.md](README.md) — 项目介绍
- [docs/harness-integration.md](docs/harness-integration.md) — harness 集成说明
- [docs/roadmap.md](docs/roadmap.md) — 任务追踪