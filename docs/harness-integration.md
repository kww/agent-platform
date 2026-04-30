# harness 集成指南

> @dommaker/runtime 如何调用 @dommaker/harness

---

## 架构关系

```
agent-platform/
├── @dommaker/runtime     # 执行引擎
├── @dommaker/workflows   # 工作流定义
└── @dommaker/harness     # 约束框架（依赖）
```

**runtime 在关键节点调用 harness.check()，确保执行符合约束。**

---

## 集成点

### 1. CheckpointValidator（AR-003）

**文件**：`packages/runtime/src/core/executor.ts`

**用法**：
```typescript
import {
  CheckpointValidator,
  type Checkpoint,
  type CheckpointContext,
} from '@dommaker/harness';

async function verifyCheckpoint(checkpoint: any, context: ExecutionContext) {
  const validator = CheckpointValidator.getInstance();
  const checkpointContext: CheckpointContext = {
    projectPath: context.inputs.project_path,
    workdir: context.workdir,
    output: context.outputs,
  };

  const result = await validator.validate(checkpoint, checkpointContext);
  return result.passed;
}
```

**支持 13 种检查类型**：
- `file_exists`, `file_not_empty`, `file_contains`, `file_not_contains`
- `command_success`, `command_output`
- `output_contains`, `output_not_contains`, `output_matches`
- `json_path`, `http_status`, `http_body`, `custom`

---

### 2. PassesGate（AR-002）

**文件**：`packages/runtime/src/core/executor.ts`

**用法**：
```typescript
import { PassesGate } from '@dommaker/harness';

// 任务完成前验证
const gate = new PassesGate({
  tests: ['npm test', 'npm run build'],
  coverage: { minimum: 80 },
});

const result = await gate.validate(projectPath);
if (!result.passed) {
  throw new Error(`PassesGate 未通过: ${result.message}`);
}
```

---

### 3. Constraint Checker（AR-001）

**文件**：`packages/runtime/src/core/executor.ts`

**用法**：
```typescript
import { checkConstraints, ConstraintViolationError } from '@dommaker/harness';

// executeWorkflow 入口处检查
try {
  await checkConstraints({
    trigger: 'workflow_start',
    preset: 'standard',
    files: changedFiles,
  });
} catch (e) {
  if (e instanceof ConstraintViolationError) {
    console.error('Iron Law 违规:', e.violations);
    throw e;
  }
}
```

---

## 执行流程

```
executeWorkflow()
    │
    ├─→ checkConstraints(trigger: 'workflow_start')
    │
    ├─→ executeStep()
    │       │
    │       └─→ verifyCheckpoint(step.checkpoint)
    │
    └─→ PassesGate.validate()
            │
            └─→ 任务完成 ✅
```

---

## Iron Laws 引用

> 完整定义见 harness iron-laws.md

| ID | 规则 |
|---|------|
| `no_bypass_checkpoint` | 禁止跳过检查点 |
| `no_self_approval` | 禁止自评通过 |
| `no_completion_without_verification` | 完成必须验证 |
| `no_test_simplification` | 禁止简化测试 |
| `incremental_progress` | 单任务单会话 |

---

## 依赖版本

```json
{
  "dependencies": {
    "@dommaker/harness": "^0.7.7"
  }
}
```
