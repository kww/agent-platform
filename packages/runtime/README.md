# agent-runtime

> AI Agent 工作流执行引擎 - 支持 Phase 划分、Session 上下文、检查点验证、动态执行、实时进度追踪

## 核心概念

### 路径说明

| 路径 | 用途 | 示例 |
|------|------|------|
| `workdir` | 执行记录存放目录 | `/root/projects/outputs/wf-continue-xxx/` |
| `project_path` | 项目代码所在目录 | `/tmp/my-project` 或 `/root/projects/my-app` |

**设计原则**：
- 执行记录（`.agent-runtime/state.json`）存放在 `workdir`
- 代码操作（文件读写、测试、Git、Agent 执行）在 `project_path` 进行
- 分离设计支持在任意位置的项目上运行工作流

## 特性

- **Phase 划分**: 工作流按阶段（phases）执行，支持阶段事件和检查点验证
- **Session 上下文**: Agent 可见前序步骤输出，增量上下文传递
- **变量解析**: 支持 `${steps.xxx.output}` 步骤输出引用
- **动态执行**: 根据 tasks.yml 动态生成执行步骤
- **Per-Task Review**: 每个任务完成后自动审核，通过后才提交
- **Builtin Handlers**: 内置处理器，处理常见任务无需 Agent
- **断点续传**: 自动保存执行状态，支持恢复中断的工作流
- **多 Agent 支持**: Codex、Claude Code 等
- **🆕 实时进度追踪**: 进度百分比、预估剩余时间、步骤状态
- **🆕 智能通知服务**: Discord/Webhook/企业微信/Telegram 多渠道通知
- **🆕 错误自动分类**: 7 种错误类型自动识别，智能重试策略
- **🆕 超时预警**: 执行超时自动预警，Agent 特定超时配置
- **🆕 部分成功支持**: 某些步骤失败但整体可继续执行

## 安装

```bash
# 全局安装
npm install -g agent-runtime

# 或作为依赖
npm install agent-runtime
```

## 配置

```bash
# 环境变量
export AGENT_SKILLS_PATH=/path/to/agent-workflows
export CODING_API_KEY=xxx        # Codex API Key
export ANTHROPIC_API_KEY=xxx     # Claude API Key（备选）
```

## CLI 使用

```bash
# 启动 API 服务
agent-runtime server -p 3002

# 列出工作流
agent-runtime list workflows

# 列出步骤
agent-runtime list steps

# 列出工具
agent-runtime list tools

# 执行工作流
agent-runtime run wf-continue --input "project_path=/tmp/my-project"

# 查询状态
agent-runtime status <executionId>

# 校验 tasks.yml
agent-runtime validate-tasks /path/to/tasks.yml
```

## API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/workflows` | 列出工作流 |
| `GET /api/workflows/:id` | 获取工作流详情 |
| `GET /api/steps` | 列出步骤 |
| `POST /api/execute` | 执行工作流 |
| `GET /api/executions/:id` | 获取执行状态 |
| `POST /api/executions/:id/stop` | 停止执行 |
| `POST /api/executions/:id/steps/:stepId/retry` | 重试步骤 |
| `POST /api/validate-tasks` | 校验 tasks.yml |

## npm 包使用

```typescript
import { executeWorkflow, listWorkflows } from 'agent-runtime';

// 执行工作流
const result = await executeWorkflow('wf-continue', { 
  project_path: '/tmp/my-project' 
}, {
  workdir: '/tmp/my-project',
  onEvent: (event) => {
    console.log(`[${event.type}]`, event);
  }
});

console.log('执行结果:', result.outputs);
```

## 核心概念

### Workflow 工作流

工作流是步骤的组合，支持 phases 阶段划分和动态执行：

```yaml
id: wf-continue
name: 从设计文档继续开发

# 使用场景说明（前端显示）
usageScenario: |
  🎯 **适合场景**：
  - 已有 tasks.yml 需要执行
  - 从设计文档继续开发
  
  ⚠️ **不适合**：
  - 没有 tasks.yml → 用 wf-planning

steps:
  # 前置校验
  - id: validate-tasks
    execute:
      type: builtin
      handler: validate-tasks
    checkpoint:
      verify: valid == true
  
  # 加载任务
  - id: load-tasks
    execute:
      type: builtin
      handler: load-tasks
  
  # 动态执行
  - id: execute-tasks
    execute:
      type: dynamic
      source: "${steps.load-tasks.tasks}"
      step_template:
        step: development/develop-task
      parallel: true
      max_parallel: 3
```

### Workflow 接口

```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  usageScenario?: string;  // 使用场景说明，前端显示
  version?: string;
  
  // 层级信息
  level?: 'L0' | 'L1' | 'L2' | 'L3';
  tags?: string[];
  
  // 执行配置
  steps: Step[];
  phases?: Phase[];
  
  // 通知配置
  notification?: NotificationConfig;
  
  // 重试配置
  retry?: RetryConfig;
}
```

### Step 步骤类型

#### 1. Agent 执行（有 prompt）

```yaml
name: analyze-requirements
agent: codex
temperature: 0.3
tools:
  - file-read
  - file-write
prompt: |
  你是需求分析师。分析以下需求：
  {{input}}
```

#### 2. 工具执行（execute.type: tool）

```yaml
name: commit-push
execute:
  type: tool
  tool: git-commit-push
```

#### 3. 内置处理器（execute.type: builtin）

```yaml
name: validate-tasks
execute:
  type: builtin
  handler: validate-tasks
input:
  tasks_path: "${inputs.project_path}/tasks.yml"
  strict: true
```

#### 4. 动态执行（execute.type: dynamic）

```yaml
name: execute-tasks
execute:
  type: dynamic
  source: "${steps.load-tasks.tasks}"
  step_template:
    step: development/develop-task
    input:
      task: "{{task}}"
  parallel: true
  max_parallel: 3
```

#### 5. 批次迭代（execute.type: batch-iterator）

```yaml
name: execute-batches
execute:
  type: batch-iterator
  batches: "${steps.split-batch.batches}"
  step_template:
    step: development/execute-batch
    input:
      batch: "{{batch}}"
      batch_index: "{{index}}"
```

#### 6. 循环执行（execute.type: loop）

```yaml
name: review-fix-cycle
execute:
  type: loop
  max_iterations: 3
  exit_condition: "${steps.review-task.passed} == true"
  steps:
    - id: review
      step: quality/review-task
    - id: fix
      step: development/fix-issues
      condition: "${steps.review.passed} == false"
```

#### 7. 结果聚合（execute.type: aggregator）

```yaml
name: aggregate-results
execute:
  type: aggregator
  source: "${steps.execute-batches.results}"
  template:
    total: "{{count}}"
    passed: "{{filter(item.passed)}}"
    failed: "{{filter(not item.passed)}}"
```

#### 8. 通知发送（execute.type: notification）

```yaml
name: notify-completion
execute:
  type: notification
  channel: discord
  template:
    title: "✅ 工作流完成"
    message: "wf-execute-phases 执行完成，{{steps.aggregate.total}} 个任务"
```

### Builtin Handlers 内置处理器

| Handler | 用途 | 说明 |
|---------|------|------|
| **generate-tasks** | 生成任务清单 | 从 requirements.md + architecture.md 生成 tasks.yml |
| **load-tasks** | 加载任务清单 | 解析 tasks.yml，构建依赖图 |
| **validate-tasks** | 校验任务清单 | 校验格式、唯一性、循环依赖 |
| **split-batch** | 任务分批 | 将任务列表按依赖关系和批次大小拆分 |
| **git-commit** | Git 提交 | 审核通过后自动提交代码 |
| **report-failure** | 失败报告 | 记录审核未通过的任务 |
| **generate-iteration-tasks** | 生成迭代任务 | 从代码库分析生成增量任务 |
| **verify-completion** | 验证完成 | 检查所有验证条件 |
| **generate-completion-report** | 完成报告 | 汇总工作流执行结果 |
| **backlog/add** | 添加待办项 | 自动生成 ID，支持类型/优先级 |
| **backlog/list** | 列出待办项 | 支持按类型、状态过滤 |
| **backlog/update** | 更新待办项 | 更新状态、优先级等 |
| **backlog/resolve** | 解决待办项 | 标记为 resolved |
| **backlog/decide** | 智能决策 | 根据类型推荐工作流 |
| **project/load-state** | 加载项目状态 | 不存在时返回空 |
| **project/save-state** | 保存项目状态 | 更新或创建 |
| **decide-next-workflow** | 智能决策 | 分析项目状态，推荐下一步工作流 |

### 变量解析

| 格式 | 说明 |
|------|------|
| `${steps.xxx.output}` | 引用步骤输出 |
| `${steps.xxx.outputs.field}` | 引用步骤输出字段 |
| `${inputs.xxx}` | 引用工作流输入 |
| `{{task}}` | 动态执行时的当前任务 |

### Session 上下文

Agent 执行时自动注入前序步骤上下文，支持分层注入优化 Token 消耗：

```
## 📋 前序步骤上下文

### [需求分析] analyze-requirements
输出: 需求文档内容...

---
## 🎯 当前任务
{当前步骤 prompt}
```

**分层注入策略**：

| 步骤位置 | 注入内容 | 说明 |
|---------|---------|------|
| 最近 5 步 | 完整输出 | 确保上下文完整 |
| 5-10 步 | summary + keyData | 结构化摘要 |
| >10 步 | 只 summary | 最小化 Token |

**Token 节省效果**：

| 场景 | 压缩前 | 压缩后 | 节省 |
|------|:------:|:------:|:----:|
| 10 步历史 | ~5000 | ~1500 | 70% |
| 20 步历史 | ~10000 | ~2500 | 75% |

### Per-Task Review 循环

`develop-task` 步骤内置 review 循环：

```
implement → review → [fix → re-review] × 3 → commit / fail
```

| 阶段 | Step | 说明 |
|------|------|------|
| 实现 | implement-task | 实现功能，不提交 |
| 审核 | review-spec | 验证是否符合验收标准 |
| 修复 | fix-issues | 修复发现的问题 |
| 提交 | git-commit | 审核通过后提交 |
| 失败 | report-failure | 记录失败，等待人工介入 |

## 架构

```
Workflow
  ├─ steps[] 步骤
  │   ├─ Agent 执行（prompt）
  │   ├─ 工具执行（execute.type: tool）
  │   ├─ 内置处理器（execute.type: builtin）
  │   └─ 动态执行（execute.type: dynamic）
  │
  ├─ 变量传递
  │   ├─ ${steps.xxx.output}
  │   ├─ ${inputs.xxx}
  │   └─ {{task}}（动态）
  │
  ├─ 检查点验证
  │   ├─ file_exists
  │   ├─ command_success
  │   └─ condition_check
  │
  └─ Session 上下文
      └─ 前序步骤输出
```

## 事件

| 事件 | 说明 |
|------|------|
| `workflow.started` | 工作流开始 |
| `workflow.completed` | 工作流完成 |
| `phase.started` | 阶段开始 |
| `phase.completed` | 阶段完成 |
| `step.started` | 步骤开始 |
| `step.completed` | 步骤完成 |
| `agent.progress` | Agent 输出进度 |
| `task.review_passed` | 任务审核通过 |
| `task.review_failed` | 任务审核失败 |
| `task.committed` | 任务代码已提交 |

## 错误处理

### 错误类型分类

系统自动识别错误类型并采用不同重试策略：

| 错误类型 | 关键字 | 处理方式 |
|---------|--------|---------|
| **NETWORK** | ECONNREFUSED, ETIMEDOUT, socket hang up | 立即重试，5s 延迟 |
| **RATE_LIMIT** | 429, rate limit, too many requests | 延迟重试，60s 延迟 |
| **TIMEOUT** | timeout, timed out | 可重试，建议增加超时 |
| **API_ERROR** | 401, 403, invalid api key | 不重试，检查配置 |
| **PERMISSION** | EACCES, permission denied, exit 126/127 | 不重试，检查权限 |
| **CODE_ERROR** | syntax error, type error | 不重试，修改 prompt |
| **UNKNOWN** | 其他错误 | 不重试，查看日志 |

### 智能重试 (spawnWithRetry)

系统自动根据错误类型决定重试策略：

```typescript
import { spawnWithRetry } from 'agent-runtime';

// 自动重试配置
const result = await spawnWithRetry({
  agent: 'codex',
  prompt: '...',
  maxRetries: 3,
  baseDelay: 5000,  // 5s
  onRetry: (error, attempt) => {
    console.log(`重试 ${attempt}/3: ${error.message}`);
  },
});

// 结果包含重试信息
console.log(result.attempts);  // 重试次数
console.log(result.finalError); // 最终错误（如果失败）
```

**重试策略**：

| 错误类型 | 重试 | 延迟 | 最大重试 |
|---------|------|------|----------|
| NETWORK | ✅ | 5s | 3 |
| RATE_LIMIT | ✅ | 60s | 3 |
| TIMEOUT | ✅ | 10s | 2 |
| API_ERROR | ❌ | - | 0 |
| PERMISSION | ❌ | - | 0 |
| CODE_ERROR | ❌ | - | 0 |

**步骤级重试配置**：

```yaml
steps:
  - id: api-call
    agent: codex
    prompt: "..."
    retry:
      maxRetries: 5
      baseDelay: 10000
      retryableErrors: [NETWORK, RATE_LIMIT, TIMEOUT]
```

**工作流级重试配置**：

```yaml
id: wf-reliable
name: 高可靠性工作流
retry:
  maxRetries: 3
  baseDelay: 5000
  retryableErrors: [NETWORK, RATE_LIMIT]
```

### 进度解析 (ProgressParser)

实时解析 Agent 输出，检测心跳并提取进度信息：

```typescript
import { ProgressParser } from 'agent-runtime';

const parser = new ProgressParser({
  heartbeatInterval: 10000,     // 10s 检查心跳
  heartbeatWarning: 60000,      // 60s 无心跳预警
  heartbeatTimeout: 300000,     // 5m 超时
});

// 解析 Agent 输出
parser.parse(line, (event) => {
  if (event.type === 'progress') {
    console.log(`进度: ${event.value}%`);
  } else if (event.type === 'heartbeat_warning') {
    console.warn('⚠️ Agent 可能卡住');
  } else if (event.type === 'heartbeat_timeout') {
    console.error('❌ Agent 超时');
  }
});
```

**检测规则**：

- 心跳检查间隔：10s
- 预警阈值：60s 无输出
- 超时阈值：5m 无输出
- 进度提取：匹配 `[x]`, `%`, `步骤` 等模式

### 部分成功支持

工作流可配置部分步骤失败时继续执行：

```yaml
# workflow.yml
continueOnFailure:
  enabled: true
  maxFailures: 2              # 最多允许 2 个步骤失败
  failureSteps: [optional-1]  # 允许失败的步骤 ID
  onStepFailure: continue     # continue | warn | abort
```

执行完成后，失败信息会记录在 `outputs._partialSuccess`：

```json
{
  "_partialSuccess": {
    "totalSteps": 10,
    "completedSteps": 8,
    "failedSteps": 2,
    "failures": [
      { "stepId": "optional-1", "error": "..." }
    ]
  }
}
```

### 超时配置

支持工作流级别和 Agent 级别超时配置：

```typescript
const DEFAULT_TIMEOUTS = {
  workflow: 3600000,   // 1 小时
  step: 300000,        // 5 分钟
  agent: {
    'codex': 600000,       // 10 分钟
    'claude-code': 600000, // 10 分钟
    'pi': 600000,          // 10 分钟
  },
  warningThreshold: 50,  // 50% 时发送预警
};
```

环境变量覆盖：`TIMEOUT_WARNING_THRESHOLD=50`

---

## 🆕 自我进化机制

当 Agent 执行失败时，系统自动分析根本原因，生成能力缺口报告，驱动系统进化。

### 核心组件

| 组件 | 文件 | 说明 |
|------|------|------|
| **RootCauseAnalyzer** | `src/core/root-cause-analyzer.ts` | 失败归因分析 |
| **归因规则配置** | `config/root-cause-rules.yml` | 可自定义规则 |
| **进化处理器** | `src/executors/evolution.ts` | 处理进化步骤 |

### 失败归因类型

| 类型 | 说明 | 建议 |
|------|------|------|
| `external_failure` | 外部服务失败 | 重试、降级 |
| `capability_missing` | 能力缺失 | 新增 Tool/Step |
| `context_insufficient` | 上下文不足 | 补充上下文 |
| `constraint_too_strict` | 约束过严 | 放宽限制 |
| `constraint_too_loose` | 约束过松 | 加强约束 |
| `workflow_defect` | 工作流缺陷 | 修复工作流 |
| `agent_limitation` | Agent 能力限制 | 切换 Agent |
| `unknown` | 未知原因 | 人工介入 |

### GapReport 格式

```yaml
id: GAP-20260404-001
type: capability_missing
title: "缺少 Docker 容器健康检查能力"
description: |
  Agent 在验证 Docker 容器健康时失败，
  现有工具不支持健康检查。
severity: high
frequency: medium
suggestion:
  type: new_tool
  description: "添加 docker/health-check 工具"
  estimated_effort: low
```

### 使用方式

```typescript
import { analyzeRootCause, saveGapReport } from 'agent-runtime';

// 分析失败原因
const result = await analyzeRootCause(error, context);

if (result.gapReport) {
  // 保存到 evolution-backlog.yml
  await saveGapReport(projectPath, result.gapReport);
}
```

### 工作流触发

```bash
# 触发进化工作流
/wf-evolution /path/to/project

# 自动模式（跳过人工确认）
/wf-evolution /path/to/project --auto_mode=true --max_items=5
```

---

## 🆕 进度追踪与通知

### ProgressTracker API

```typescript
import { ProgressTracker, getProgressTracker } from 'agent-runtime';

// 创建追踪器
const tracker = new ProgressTracker({
  executionId: 'exec-001',
  workflowId: 'wf-continue',
  totalSteps: 10,
});

// 生命周期
tracker.startWorkflow();
tracker.startStep('step-1', 'First Step');
tracker.updateStepProgress('step-1', 50, 'Processing...');
tracker.completeStep('step-1');
tracker.failStep('step-1', 'ECONNREFUSED');  // 自动分类错误
tracker.completeWorkflow(outputs);

// 查询
tracker.getState();          // 完整状态
tracker.getProgress();       // 0-100%
tracker.estimateRemaining(); // 预估剩余秒数
tracker.generateReport();    // 格式化报告
```

### NotificationService API

```typescript
import { createNotificationService } from 'agent-runtime';

const service = createNotificationService({
  executionId: 'exec-001',
  workflowId: 'wf-continue',
  channels: ['discord', 'webhook'],
  interval: 300,  // 5 分钟
  webhookUrl: 'https://...',
});

// 启动定期通知
service.startPeriodicNotifications();

// 事件通知
await service.notify('workflow.started', { ... });
await service.notify('workflow.completed', { duration: 3600 });
await service.notify('warning.occurred', { message: '...' });

// 停止
service.stopPeriodicNotifications();
```

### 工作流通知配置

在工作流中配置通知：

```yaml
id: wf-long-running
name: 长时间运行工作流

# 通知配置
notification:
  enabled: true
  channels:
    - discord
    - webhook
  events:
    - workflow.started
    - workflow.completed
    - warning.occurred
  interval: 300  # 5 分钟推送一次进度
  webhookUrl: "${env.PROGRESS_WEBHOOK_URL}"

steps:
  - id: heavy-task
    agent: codex
    prompt: ...
```

### Skill 查询接口

用户可通过自然语言查询进度：

```
用户: 进度怎么样了
用户: 还剩多久
用户: 当前状态

AI: 调用 getProgressTracker(executionId).getShortStatus()
返回: "🔄 wf-continue 执行中 | 进度: 45% | 已完成: 3/7 | 预计: 5分钟"
```

## 🆕 P1 功能：上下文管理

### Token 使用追踪

```typescript
import { TokenTracker, MODEL_TOKEN_LIMITS } from 'agent-runtime';

// 创建追踪器
const tracker = new TokenTracker({
  executionId: 'exec-001',
  model: 'gpt-4',
  warningThreshold: 80,  // 80% 时预警
});

// 记录使用
tracker.recordUsage('step-1', inputText, outputText);

// 查询状态
tracker.getState();           // { used, remaining, percentage, ... }
tracker.getStats();           // { totalUsed, avgPerStep, stepCount }
tracker.isNearLimit();        // 是否接近限制
tracker.estimateRemainingSteps();  // 预估剩余步骤数

// 生成报告
tracker.generateReport();
```

### 执行结果中的 Token 统计

工作流执行完成后，`ExecutionResult` 包含 token 使用统计：

```typescript
interface ExecutionResult {
  // ... 其他字段
  tokenUsage?: {
    model: string;           // 使用的模型
    limit: number;           // 模型 token 限制
    used: number;            // 已使用 token
    remaining: number;       // 剩余 token
    percentage: number;      // 使用百分比
    stepCount: number;       // 步骤数
    avgPerStep: number;      // 平均每步 token
    steps: Array<{           // 每步详情
      stepId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
}
```

**UI 展示示例**：

```typescript
// 获取执行结果
const result = await executeWorkflow('wf-continue', inputs);

// 在项目详情页展示
if (result.tokenUsage) {
  const { model, used, limit, percentage, stepCount, avgPerStep } = result.tokenUsage;
  
  // 项目详情页 Token 卡片
  console.log(`
  📊 Token 使用统计
  ─────────────────────
  模型: ${model}
  已用: ${used.toLocaleString()} / ${limit.toLocaleString()} (${percentage}%)
  步骤: ${stepCount} 个
  平均: ${avgPerStep.toLocaleString()} tokens/步
  `);
}
```

### 项目级别 Token 统计

累计项目所有工作流的 token 消耗，按类型分类统计：

```typescript
import { getProjectTokenStats, getProjectTokenSummary } from 'agent-runtime';

// 获取项目 Token 摘要
const summary = getProjectTokenSummary('/path/to/project');
// 输出: "📊 Token 总计: 150,000 (15 次执行, 120 分钟)"

// 获取完整统计
const stats = getProjectTokenStats('/path/to/project');
console.log(stats);
// {
//   totalExecutions: 15,
//   totalTokens: 150000,
//   totalInputTokens: 60000,
//   totalOutputTokens: 90000,
//   byWorkflowType: {
//     development: { count: 8, totalTokens: 100000, ... },
//     iteration: { count: 4, totalTokens: 30000, ... },
//     bugfix: { count: 3, totalTokens: 20000, ... },
//   },
//   stepStats: {
//     'analyze-code': { count: 15, totalTokens: 30000, avgTokens: 2000 },
//     'design-solution': { count: 8, totalTokens: 20000, avgTokens: 2500 },
//     ...
//   },
//   recentExecutions: [...],
// }
```

**UI 展示示例**：

```
┌────────────────────────────────────────────────────┐
│ 📊 项目 Token 使用统计                             │
├────────────────────────────────────────────────────┤
│                                                    │
│ 总计                                               │
│ ───────────────────────────────────────────────── │
│ 执行次数: 15 次                                    │
│ 总 Token: 150,000                                  │
│ 输入 Token: 60,000                                 │
│ 输出 Token: 90,000                                 │
│ 总耗时: 120 分钟                                   │
│                                                    │
│ 按工作流类型                                       │
│ ───────────────────────────────────────────────── │
│ 开发    8 次 │ 100,000 tokens │ 平均 12,500 │
│ 迭代    4 次 │  30,000 tokens │ 平均  7,500 │
│ Bug修复 (bugfix)    3 次 │  20,000 tokens │ 平均  6,667 │
│                                                    │
│ 消耗最多的步骤 (Top 5)                             │
│ ───────────────────────────────────────────────── │
│ 1. analyze-code        15 次 │ 30,000 tokens │
│ 2. design-solution      8 次 │ 20,000 tokens │
│ 3. implement-code       8 次 │ 45,000 tokens │
│ 4. run-tests            8 次 │ 15,000 tokens │
│ 5. commit-changes       8 次 │  5,000 tokens │
└────────────────────────────────────────────────────┘
```

**数据存储位置**: `<project>/.agent-runtime/token-usage.json`

### 上下文管理

实时监控上下文占用情况，提供智能建议：

```typescript
import { getContextUsage, getContextSummary } from 'agent-runtime';

// 获取上下文使用情况
const usage = getContextUsage('/path/to/project', 'gpt-4-turbo', 8500);
console.log(usage);
// {
//   currentModel: 'gpt-4-turbo',
//   contextLimit: 128000,
//   projectTokensUsed: 150000,      // 项目累计
//   currentExecutionTokens: 8500,   // 本次执行
//   totalUsed: 158500,
//   effectiveRemaining: 0,
//   percentage: 100,
//   status: 'exceeded',             // normal | warning | critical | exceeded
//   suggestion: '⚠️ 已超限 158,500 / 128,000，必须切换到 claude-3-opus 或重置上下文'
// }

// 获取简短摘要（用于 UI）
const summary = getContextSummary('/path/to/project', 'gpt-4-turbo', 8500);
// "❌ 上下文: 158,500 / 128,000 (100%)"
```

**上下文状态**：

| 状态 | 占用 | 说明 |
|------|------|------|
| `normal` | < 50% | 上下文充足 |
| `warning` | 50-70% | 建议关注 |
| `critical` | 70-85% | 建议压缩或切换模型 |
| `exceeded` | > 85% | 必须处理 |

**UI 展示示例**：

```
┌──────────────────────────────────────────────────┐
│ 📊 上下文使用情况                                │
├──────────────────────────────────────────────────┤
│ 当前模型: gpt-4-turbo (上限 128K)                │
│                                                  │
│ 项目累计: 150,000 tokens                         │
│ 本次已用: 8,500 tokens                           │
│ ────────────────────────────────────────────────│
│ 总计占用: 158,500 / 128,000 ⚠️ 超限              │
│                                                  │
│ 💡 建议: 切换到 claude-3-opus (200K) 或压缩历史  │
└──────────────────────────────────────────────────┘
```

**自动模型推荐**：

```typescript
import { getProjectTokenTracker } from 'agent-runtime';

const tracker = getProjectTokenTracker('/path/to/project');
const recommended = tracker.getRecommendedModel('gpt-4-turbo', 8500);
// 返回: 'claude-3-opus' (满足 158,500 token 需求的最小上下文模型)
```

### 智能输出处理

```typescript
import { OutputProcessor } from 'agent-runtime';

const processor = new OutputProcessor({
  preserveCritical: true,     // 错误、决策完整保留
  preserveImportant: true,    // 文件、commit 结构化保留
  compressThreshold: 1000,    // 压缩阈值
});

// 单个输出处理
const result = processor.processOutput('step-1', outputText);
// result.category: 'critical' | 'important' | 'compressible'
// result.processed: 处理后的文本
// result.savedTokens: 节省的 token 数

// 批量处理
const batchResult = processor.processOutputs([
  { stepId: 'step-1', output: '...' },
  { stepId: 'step-2', output: '...', hasError: true },
]);
```

### Agent 回退机制

```typescript
import { AgentFallbackManager } from 'agent-runtime';

const manager = new AgentFallbackManager({
  enabled: true,
  fallbacks: [
    { primary: 'codex', fallback: 'claude-code', maxRetries: 2 },
    { primary: 'claude-code', fallback: 'codex', maxRetries: 2 },
  ],
});

// 初始化执行
manager.initExecution('exec-001', 'codex');

// 检查是否应回退
if (manager.shouldFallback('exec-001', classifiedError, attemptNumber)) {
  // 执行回退
  const newAgent = manager.executeFallback('exec-001', classifiedError, attempt);
  console.log(`切换到: ${newAgent}`);  // claude-code
}

// 获取历史
manager.getFallbackHistory('exec-001');
```

## License

MIT
