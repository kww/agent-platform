# Spec: Phase 6 - Workflow Agent 共享 + Checkpoint 集成

> 版本: 1.0.0
> 创建日期: 2026-04-22
> 状态: 待开发
> 依赖: Phase 3 完成 + studio-meeting + studio-spec

---

## 一、目标

实现三层控制架构 + Checkpoint + SpecReview 集成 + 风险评估算法。

**核心问题解决**：
| 问题 | 解决方案 |
|------|---------|
| Workflow 内上下文丢失 | Agent 共享（messages 传递）|
| 多 Task 并发 Rate Limit | 并发控制（maxConcurrency:2）|
| 跨 Task 上下文 | Contract + dependentOutputs |
| 偏离检测时机晚 | Git hook + Checkpoint |
| SpecReview 自动化 | L1-L4 分级 |
| 风险评估 | RiskScore 公式 |

---

## 二、背景

**讨论时间**：2026-04-22 00:00-01:24（#coding 频道）

**设计文档**：
| 文档 | 路径 |
|------|------|
| Workflow Agent 共享设计 | `projects/agent-platform/workflow-agent-sharing-design.md` |
| SpecReview 评审自动化 | `projects/agent-platform/spec-review-automation-design.md` |

**核心澄清**：
- Workflow Agent 共享 ≠ Agent 自主执行全部流程
- 系统控制每一步 + Agent 执行 + messages 传递上下文
- Codex/Claude CLI 不支持进程持久化，每次 spawnAgent 重启
- 区别在于上下文内容：当前是"输出摘要截断"，共享是"完整对话分层压缩"

---

## 三、复用分析

### 3.1 直接复用（8 个）

| 能力 | 位置 | 复用度 |
|------|------|:------:|
| scheduler.ts | runtime/src/core/ | 100% |
| parallel-executor.ts | runtime/src/core/ | 100% |
| getMaxConcurrent() | executor.ts | 100% |
| buildSessionPrompt() | executor.ts | 100% |
| ContextSharer | orchestration/ | 100% |
| verifyCheckpoint() | executor.ts | 80% |
| SpecReviewMeetingService | studio-meeting/ | 100% |
| L1-L4 分级 | studio-spec/ | 100% |

### 3.2 需要新建（4 个）

| 能力 | 说明 |
|------|------|
| TaskQueue | Redis 队列管理（pending/running/waiting）|
| TaskWorker | Task 消费 + 并发控制检查 |
| messages 传递 | 扩展 buildSessionPrompt 支持 messages |
| RiskAssessor | 风险评估算法（Severity×Impact - Reversibility + Urgency）|

### 3.3 需要扩展（3 个）

| 能力 | 扩展内容 |
|------|---------|
| Workflow 定义 | 新增 agent/agentMode/agentConfig 字段 |
| verifyCheckpoint | 新增 baselineDecision 检查 |
| spawnAgent | 新增 messages 参数 |

---

## 四、模块设计

### 4.1 层 1：Task 并发控制（工作量: 1h）

**目标**：解决多 Task 并发 Rate Limit 问题

**复用**：
- `scheduler.ts` - ResourceScheduler
- `parallel-executor.ts` - ParallelExecutor
- `executor.ts: getMaxConcurrent()`

**新建**：
- `task-queue.ts` - Redis 队列管理
- `task-worker.ts` - Task 消费 + 并发检查

**配置参数**：
```typescript
interface TaskConcurrencyConfig {
  maxConcurrency: number;           // 全局并发限制（默认 2）
  perTypeConcurrency: number;       // Agent 类型限制（默认 1）
  checkInterval: number;            // 检查间隔（默认 5000ms）
}
```

**队列结构**：
```typescript
interface TaskQueue {
  pending: 'tasks:pending';         // 待执行
  running: 'tasks:running';         // 执行中
  waiting: 'tasks:waiting';         // 等待依赖
  completed: 'tasks:completed';     // 已完成
  
  typeCount: {
    codex: 'tasks:type:codex:running';
    claude: 'tasks:type:claude:running';
  };
}
```

---

### 4.2 层 2：Workflow Agent 共享（工作量: 2.5h）

**目标**：解决 Workflow 内上下文丢失问题

**复用**：
- `executor.ts: buildSessionPrompt()` - 基础框架
- `history-compressor.ts` - 历史压缩

**新建**：
- `messages-prompt-builder.ts` - messages 构建 + 分层压缩

**扩展**：
- Workflow 定义新增字段
- spawnAgent 新增 messages 参数

**Workflow 定义**：
```yaml
wf-backend:
  agent: codex              # Workflow 级别 Agent
  agentMode: shared         # 共享模式
  agentConfig:
    passHistory: true       # 传递对话历史
    historyStrategy: hybrid # 混合策略
    recentCount: 2          # 保留最近 2 轮
    maxHistoryTokens: 50000 # 最大历史 Token
```

**Token 控制**：
```typescript
function compressMessages(messages, maxTokens) {
  // 前序消息：提取关键数据
  // 最近消息：完整保留
  
  const oldMessages = messages.slice(0, -recentCount * 2);
  const recentMessages = messages.slice(-recentCount * 2);
  
  const oldSummary = extractKeyData(oldMessages);
  const recentHistory = buildPromptFromMessages(recentMessages);
  
  return [oldSummary, recentHistory, currentPrompt].join('\n');
}
```

---

### 4.3 层 3：跨 Task 上下文（工作量: 0.5h）

**目标**：Contract + dependentOutputs 传递

**复用**：
- `context-sharer.ts` - Redis 存储

**新建**：
- `task-output.ts` - TaskOutput 封装

**TaskOutput 结构**：
```typescript
interface TaskOutput {
  taskId: string;
  workflowId: string;
  keyData: KeyData;          // 提取的关键数据
  summary: string;           // 输出摘要
  completedAt: Date;
  ttl: number;               // 3600s
}
```

**存储方式**：
```typescript
await redis.set(`task:output:${taskId}`, JSON.stringify(output));
await redis.expire(`task:output:${taskId}`, 3600);
```

---

### 4.4 Checkpoint + SpecReview 集成（工作量: 4h）

**目标**：Git hook + Workflow checkpoint + 阻塞恢复

**复用**：
- `executor.ts: verifyCheckpoint()` - 基础框架
- `studio-meeting/spec-review-meeting-service.ts` - SpecReview 流程

**新建**：
- `baseline-validator.ts` - baselineDecision 检查
- `workflow-blocker.ts` - 阻塞恢复逻辑

**扩展**：
- verifyCheckpoint 新增 baselineDecision 检查

**Git hook**：
```bash
# .git/hooks/pre-commit
#!/bin/bash

TASK_CONTEXT=".task-context"
CONSTRAINT_LEVEL=$(jq -r '.constraintLevel' "$TASK_CONTEXT")

if [ "$CONSTRAINT_LEVEL" = "L3" ] || [ "$CONSTRAINT_LEVEL" = "L4" ]; then
  # 调用 API 检查偏离
  RESPONSE=$(curl -s POST "/api/v1/checkpoints/verify")
  
  if [ "$(jq -r '.passed' <<< "$RESPONSE")" = "false" ]; then
    git stash push -m "spec-review-$SPEC_ID"
    exit 1  # 阻止 commit
  fi
fi
```

**Workflow 阻塞恢复**：
```typescript
// 阻塞
async blockWorkflow(executionId, specReviewId) {
  await redis.set(`workflow:blocked:${executionId}`, ...);
  await redis.lrem('tasks:running', executionId);
  await redis.rpush('tasks:waiting', ...);
}

// 恢复
async resumeWorkflow(executionId) {
  await exec('git stash pop');
  await redis.lrem('tasks:waiting', ...);
  await redis.rpush('tasks:running', executionId);
}

// 终止
async abortWorkflow(executionId) {
  await exec('git stash drop');
  await createNewTaskFromReview(...);
}
```

---

### 4.5 风险评估算法（工作量: 2h）

**目标**：RiskScore 计算 + L1-L4 映射

**新建**：
- `risk-assessor.ts` - 风险评估算法

**风险公式**：
```
RiskScore = Severity × Impact - Reversibility + Urgency

范围：0-18
映射：
  0-2 → L1（自动批准）
  3-5 → L2（快速评审）
  6-10 → L3（需要评审）
  11-18 → L4（人工评审）
```

**权重表**：

| 因素 | 权重范围 | 说明 |
|------|:-------:|------|
| Severity | 1-4 | 偏离类型（约束违规=4，数据库=4）|
| Impact | 1-4 | 影响范围（全系统=4，单文件=1）|
| Reversibility | 0-3 | 可逆性（不可逆=0，易回滚=3）|
| Urgency | 0-2 | 紧急程度（阻塞=2，低=0）|

---

### 4.6 SpecReview 评审自动化（复用，工作量: 0h）

**复用**：
- `studio-spec/change-approver.service.ts` - L1-L4 分级配置
- `studio-meeting/spec-review-meeting-service.ts` - SpecReview 流程
- `discussion-driver.ts` - DiscussionDriver

**分级配置**：
| 级别 | 自动化 | DiscussionDriver | 用户干预 | 超时 |
|:----:|:------:|:----------------:|:-------:|:----:|
| L1 | 100% | ❌ 不启动 | ❌ | 1min |
| L2 | 80% | ✅ 自动投票 | 🔶 可选 | 5min |
| L3 | 50% | ✅ 讨论+建议 | ✅ 必须 | 1h |
| L4 | 0% | ✅ 辅助讨论 | ✅ 必须 | 24h |

---

## 五、验收标准

### AC-001：层 1 并发控制

| AC | 描述 | 测试 |
|:--:|------|:----:|
| AC-001-1 | maxConcurrency 配置生效 | `test/task-queue.test.ts` |
| AC-001-2 | perTypeConcurrency 配置生效 | `test/task-queue.test.ts` |
| AC-001-3 | Task 阻塞时移入 waitingQueue | `test/task-worker.test.ts` |
| AC-001-4 | Task 完成时通知依赖 Task | `test/task-worker.test.ts` |

### AC-002：层 2 Agent 共享

| AC | 描述 | 测试 |
|:--:|------|:----:|
| AC-002-1 | Workflow 定义 agent 字段解析 | `test/workflow-parser.test.ts` |
| AC-002-2 | messages 传递到 prompt | `test/messages-prompt.test.ts` |
| AC-002-3 | Token 超限时分层压缩 | `test/messages-compress.test.ts` |

### AC-003：层 3 跨 Task 上下文

| AC | 描述 | 测试 |
|:--:|------|:----:|
| AC-003-1 | TaskOutput 存储到 Redis | `test/task-output.test.ts` |
| AC-003-2 | 依赖 Task 读取 TaskOutput | `test/task-output.test.ts` |

### AC-004：Checkpoint + SpecReview

| AC | 描述 | 测试 |
|:--:|------|:----:|
| AC-004-1 | Git hook 触发偏离检测 | 手动测试 |
| AC-004-2 | 偏离时 Workflow 阻塞 | `test/workflow-blocker.test.ts` |
| AC-004-3 | approved 时恢复 Workflow | `test/workflow-blocker.test.ts` |
| AC-004-4 | rejected 时终止 Workflow | `test/workflow-blocker.test.ts` |

### AC-005：风险评估

| AC | 描述 | 测试 |
|:--:|------|:----:|
| AC-005-1 | RiskScore 计算（公式）| `test/risk-assessor.test.ts` |
| AC-005-2 | L1-L4 映射正确 | `test/risk-assessor.test.ts` |

---

## 六、工作量估算（基于复用）

| 模块 | 原估算 | 复用后 | 说明 |
|------|:------:|:------:|------|
| 层 1 并发控制 | 3h | **1h** | scheduler/parallelExecutor 复用 |
| 层 2 Agent 共享 | 4h | **2.5h** | buildSessionPrompt 复用 |
| 层 3 跨 Task | 1.5h | **0.5h** | ContextSharer 复用 |
| Checkpoint + SpecReview | 8h | **4h** | verifyCheckpoint + SpecReview 复用 |
| 风险评估 | 2h | **2h** | 全新实现 |
| **总计** | 18.5h | **10h** | **节省 8.5h** |

---

## 七、依赖

| 依赖 | 状态 | 说明 |
|------|:----:|------|
| Phase 3 完成 | ✅ | studio-spec L1-L4 分级 |
| studio-meeting | ✅ | SpecReviewMeetingService |
| runtime/src/core/scheduler.ts | ✅ | ResourceScheduler |
| runtime/src/core/parallel-executor.ts | ✅ | ParallelExecutor |
| orchestration/context-sharer.ts | ✅ | Redis 存储 |

---

## 八、风险

| 风险 | 等级 | 对策 |
|------|:----:|------|
| messages 传递 Token 超限 | 🟡 中 | 分层压缩 + maxHistoryTokens |
| Git hook 兼容性 | 🟡 中 | 测试 Docker Claude 场景 |
| Redis 连接依赖 | 🟢 低 | 复用现有 redis 实例 |

---

## 九、里程碑

| Milestone | 内容 | 工作量 | 状态 |
|:---------:|------|:------:|:----:|
| M1 | 层 1 并发控制 | 1h | ⬜ |
| M2 | 层 2 Agent 共享 | 2.5h | ⬜ |
| M3 | 层 3 跨 Task | 0.5h | ⬜ |
| M4 | Checkpoint + SpecReview | 4h | ⬜ |
| M5 | 风险评估算法 | 2h | ⬜ |

---

## 十、相关文档

| 文档 | 路径 |
|------|------|
| Workflow Agent 共享设计 | `projects/agent-platform/workflow-agent-sharing-design.md` |
| SpecReview 评审自动化 | `projects/agent-platform/spec-review-automation-design.md` |
| Roadmap | `issues/agent-platform-roadmap.md` |

---

*Spec 版本: 1.0.0*
*创建时间: 2026-04-22 01:31*