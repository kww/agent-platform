# Root Cause Analyzer - 失败归因分析器

> 版本：1.0.0  
> 最后更新：2026-04-12

## 概述

Root Cause Analyzer 是一个 AI 辅助的失败归因分析工具，用于分析任务执行失败的根本原因，识别能力缺口，生成 Gap Report。

## 核心功能

| 功能 | 说明 |
|------|------|
| **归因分析** | 分析任务执行失败的根本原因 |
| **能力缺口识别** | 识别缺失的工具、步骤、上下文 |
| **Gap Report 生成** | 生成结构化的能力缺口报告 |
| **进化建议** | 提供角色/系统进化建议 |

## 与 Harness Execution Trace 的区别

| 维度 | Root Cause Analyzer | Harness Execution Trace |
|------|---------------------|------------------------|
| **监控对象** | 任务执行失败 | 约束检查行为 |
| **输入** | 错误消息 + 执行上下文 | 约束检查记录 |
| **输出** | Gap Report（能力缺口） | Trace Summary（通过/失败/绕过率） |
| **目的** | 发现"缺少什么能力" | 发现"约束系统是否健康" |
| **触发** | 任务执行失败后 | 每小时统计 / 每日异常检测 |
| **成本** | 调用 LLM 分析 | 零 Token 成本（纯计算） |

**结论**：两者是互补关系，不是重复造轮子。

## 使用场景

### 1. 任务执行失败后自动归因

```typescript
import { analyzeRootCause } from 'agent-runtime';

const result = await analyzeRootCause({
  executionId: 'exec-123',
  errorMessage: '我不知道如何解析 PDF 文件',
  context: {
    constraintLevel: 'L2',
    retryCount: 3,
    role: 'developer'
  }
});

// 输出：
// {
//   rootCause: 'capability_missing',
//   gapReport: {
//     type: 'tool',
//     name: 'pdf-parser',
//     suggestion: '为角色添加 pdf-parser 能力'
//   }
// }
```

### 2. 识别能力缺口

```typescript
import { identifyGap } from 'agent-runtime';

const gaps = await identifyGap({
  role: 'developer',
  task: '处理 Excel 文件并生成报告',
  failures: ['不知道如何读取 Excel', '不知道如何生成图表']
});

// 输出：
// [
//   { type: 'tool', name: 'excel-reader', priority: 'high' },
//   { type: 'tool', name: 'chart-generator', priority: 'medium' }
// ]
```

### 3. 生成进化建议

```typescript
import { generateEvolutionSuggestions } from 'agent-runtime';

const suggestions = await generateEvolutionSuggestions({
  gapReport: {
    gaps: [
      { type: 'tool', name: 'pdf-parser' },
      { type: 'context', name: 'project-structure' }
    ]
  }
});

// 输出：
// [
//   { type: 'add_capability', description: '为 developer 角色添加 pdf-parser 能力' },
//   { type: 'enhance_context', description: '在任务开始前加载项目结构上下文' }
// ]
```

## 归因规则

### 默认归因规则

| 规则 ID | 类型 | 条件 | 归因结果 |
|---------|------|------|---------|
| `external_failure` | 外部失败 | 错误类型 = NETWORK/RATE_LIMIT/API_ERROR/TIMEOUT | 外部系统问题 |
| `capability_missing` | 能力缺失 | 包含"不知道"、"不会"、"无法处理" | 缺少能力 |
| `context_insufficient` | 上下文不足 | 包含"找不到文件"、"不知道位置" | 上下文不足 |
| `constraint_too_strict` | 约束过严 | 约束级别 = L3/L4 且失败率高 | 约束需要调整 |
| `agent_limitation` | Agent 限制 | 包含"超时"、"Token 限制" | Agent 限制 |

### 归因规则配置

```typescript
const customRules: RootCauseRule[] = [
  {
    id: 'custom_db_error',
    name: '数据库错误',
    condition: {
      errorPattern: /database.*error/i,
      errorType: ErrorType.EXTERNAL
    },
    attribution: {
      rootCause: FailureRootCause.EXTERNAL_FAILURE,
      gapType: GapType.EXTERNAL,
      suggestion: '检查数据库连接配置'
    }
  }
];
```

## 数据结构

### 归因分析结果

```typescript
interface RootCauseAnalysisResult {
  executionId: string;
  rootCause: FailureRootCause;
  confidence: number;  // 0-1
  gapReport?: GapReport;
  suggestions: GapSuggestion[];
  timestamp: number;
}
```

### Gap Report

```typescript
interface GapReport {
  type: GapType;  // 'tool' | 'step' | 'context' | 'constraint' | 'external'
  name: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  suggestions: GapSuggestion[];
}
```

### Gap Suggestion

```typescript
interface GapSuggestion {
  type: 'add_capability' | 'enhance_context' | 'adjust_constraint' | 'external_fix';
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedEffort?: string;  // 如 '2h', '1d'
}
```

## 复用能力

Root Cause Analyzer 复用了以下现有能力：

| 能力 | 来源 | 用途 |
|------|------|------|
| `classifySpawnError()` | `executors/spawn.ts` | 错误分类 |
| `IndexBuilder` | `index-builder.ts` | 错误索引构建 |
| `EventHandler` | `events.ts` | 事件发布 |

## CLI 使用

```bash
# 分析最近的失败执行
agent-runtime analyze-failure --execution-id exec-123

# 分析所有失败执行
agent-runtime analyze-failures --since 2026-04-01

# 生成 Gap Report
agent-runtime gap-report --role developer
```

## 与 ConstraintDoctor 的关系

当 Harness Execution Trace 检测到异常（如高失败率）时，可以调用 Root Cause Analyzer 进行深入分析：

```
Harness Trace 检测异常
    │
    └── 调用 Root Cause Analyzer
            │
            ├── 分析失败原因
            ├── 识别能力缺口
            └── 生成进化建议
                    │
                    └── ConstraintDoctor 评估建议
                            │
                            └── 自动调整约束 / 通知管理员
```

## 最佳实践

1. **失败后自动归因**：每次任务失败后自动调用 Root Cause Analyzer
2. **定期 Gap 分析**：每周生成 Gap Report，识别系统性能力缺口
3. **人工复核**：高影响 Gap Report 需要人工复核后再执行进化建议
4. **闭环验证**：添加新能力后验证失败率是否下降

## 相关文档

- [Architecture Overview](./architecture.md)
- [Harness Documentation](../../node_modules/@dommaker/harness/README.md)
- [Error Handling](./faq.md#error-handling)
