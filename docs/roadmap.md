# agent-platform Roadmap

> 约束驱动的 Agent 执行平台 — harness + runtime + workflows

---

## 一、Phase 1：约束集成（已完成）

**目标**：runtime 引入 harness 约束检查

| ID | 任务 | 优先级 | 工作量 | 状态 |
|----|------|:------:|:------:|:----:|
| **AR-001** | executeWorkflow 引入 checkConstraints() | P1 | 1h | ✅ |
| **AR-002** | PassesGate 引入（任务完成验证）| P2 | 1h | ✅ |
| **AR-003** | CheckpointValidator 引入（13种检查）| P2 | 2h | ✅ |

---

## 二、Phase 2：执行优化（当前）

**目标**：完善工作流执行体验

| ID | 任务 | 优先级 | 工作量 | 状态 |
|----|------|:------:|:------:|:----:|
| **AR-004** | ToolExecutor 引入（14工具）| P2 | 2h | ✅ 已实现 |
| **AR-005** | 断点续传优化 | P3 | 3h | ✅ |
| **AR-006** | 并行执行优化 | P3 | 2h | ✅ |

---

## 三、Phase 3：能力扩展（后续）

**目标**：集成更多 Agent 能力

| ID | 任务 | 优先级 | 工作量 | 状态 |
|----|------|:------:|:------:|:----:|
| **AR-007** | 多 Agent 协作（Orchestrator）| P3 | 4h | ✅ 已实现 |
| **AR-008** | 进度追踪 API | P3 | 2h | ✅ 已实现 |
| **AR-009** | 实时通知（WebSocket）| P3 | 3h | ✅ 已实现 |

---

## 四、与 harness 同步矩阵

| harness 功能 | runtime 状态 | 说明 |
|-------------|:------------:|------|
| **Iron Laws** | ✅ 已集成 | AR-001 |
| **CheckpointValidator** | ✅ 已集成 | AR-003（13种检查）|
| **PassesGate** | ✅ 已集成 | AR-002 |
| **SecurityGate** | ❌ 未集成 | CLI only |
| **ToolExecutor** | ✅ 已集成 | AR-004（14工具）|

---

## 五、包版本

| 包 | 版本 | 说明 |
|------|:----:|------|
| @dommaker/runtime | 0.0.5 | 执行引擎 |
| @dommaker/workflows | 0.0.6 | 工作流定义 |
| @dommaker/harness | 0.8.0 | 约束框架（依赖）|

---

## 六、相关 Roadmap

| 项目 | Roadmap | 说明 |
|------|---------|------|
| **harness** | [README.md](../README.md) | 约束框架 |
| **agent-studio** | [roadmap.md](../../agent-studio/docs/roadmap.md) | 业务平台 |

---

## 七、Phase 7：安全加固（2026-04-29）

> 与 agent-studio 协同完成

| ID | 任务 | 状态 |
|----|------|:----:|
| **SEC-004** | runtime 删除 API 权限保护 | ✅ |
| **SEC-007** | 异地备份（rclone 配置）| ✅ |

**改动**：
- `packages/runtime/src/middleware/auth.ts` - JWT/API Key 认证
- `packages/runtime/src/server.ts` - 3 个删除 API 保护
