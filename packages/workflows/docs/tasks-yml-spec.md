# tasks.yml 规范
# ============================================================================
# 版本: 2.0.0 - AW-021 多因素优先级排序
# ============================================================================

## 必需字段

### project
```yaml
project:
  name: string           # 项目名称
  path: string           # 项目路径
  tech_stack: object     # 技术栈 { 前端: React, 后端: Express }
  type: string           # 项目类型: frontend | backend | fullstack
```

### tasks
```yaml
tasks:
  - id: string           # 任务 ID，如 task-001
    name: string         # 任务名称
    type: string         # 任务类型: feature | bugfix | refactor
    
    # 优先级字段（v2.0.0 扩展）
    priority: string     # 优先级: critical | high | medium | low（改为枚举）
    risk: string         # 风险等级: high | medium | low（新增）
    complexity: string   # 复杂度: large | medium | small（新增）
    value: string        # 业务价值: high | medium | low（新增）
    estimated_time: string # 预估时间: <1h | 1-2h | 2-4h | >4h（新增）
    
    description: string  # 任务描述
    files:               # 涉及的文件
      - path: string
        type: string     # create | modify | delete
    dependencies: []     # 依赖的任务 ID
    spec: string         # 实现规格
    test_required: bool  # 是否需要测试
    acceptance: []       # 验收标准
    
    # 子任务拆分（v2.1.0 AW-022）
    subtasks: []         # 子任务列表（嵌套结构）
    parent_id: string    # 父任务 ID（扁平化结构）
```

### execution_plan
```yaml
execution_plan:
  # 分批策略（v2.0.0 新增）
  strategy: string       # 分批策略: sequential | parallel | balanced | priority_first | risk_first | value_first | fast_first | dependency_priority | smart
  batch_size: number     # 每批次最大任务数（默认 3）
  
  # 权重配置（可选，覆盖默认）
  weights:
    priority:
      critical: number
      high: number
      medium: number
      low: number
    risk:
      high: number
      medium: number
      low: number
    complexity:
      large: number
      medium: number
      small: number
    value:
      high: number
      medium: number
      low: number
    estimated_time:
      "<1h": number
      "1-2h": number
      "2-4h": number
      ">4h": number
  
  # 预设配置（可选，快速切换场景）
  preset: string         # 场景预设: default | mvp_fast | urgent_critical | explore_new | balanced
  
  # 执行阶段
  phases:
    - phase: string      # 阶段名称
      parallel: bool     # 是否并行执行
      tasks: []          # 任务 ID 列表
```

## 可选字段

### design_docs
```yaml
design_docs:
  requirements: string   # 需求文档路径
  architecture: string   # 架构文档路径
```

### infrastructure
```yaml
infrastructure:
  - id: string
    name: string
    # ... 同 tasks 结构
```

### acceptance_criteria
```yaml
acceptance_criteria:
  functional: []         # 功能验收标准
  quality: []            # 质量验收标准
```

## 校验规则

| 规则 | 级别 | 说明 |
|------|------|------|
| project.name 存在 | ERROR | 必须有项目名称 |
| project.path 存在 | ERROR | 必须有项目路径 |
| tasks 至少 1 个 | ERROR | 必须有任务 |
| task.id 唯一 | ERROR | 任务 ID 不能重复 |
| task.id 格式正确 | WARN | 建议格式: task-001, task-002 |
| execution_plan 存在 | ERROR | 必须有执行计划 |
| dependencies 可解析 | ERROR | 依赖的任务必须存在 |
| 无循环依赖 | ERROR | 依赖图不能有环 |
| **task.priority 格式正确** | WARN | 建议格式: critical/high/medium/low |
| **task.risk 格式正确** | WARN | 建议格式: high/medium/low |
| **task.complexity 格式正确** | WARN | 建议格式: large/medium/small |
| **task.value 格式正确** | WARN | 建议格式: high/medium/low |
| **task.estimated_time 格式正确** | WARN | 建议格式: <1h/1-2h/2-4h/>4h |

## 生成前置条件

tasks.yml 应该由以下方式之一生成：

1. **wf-planning** 从需求生成
2. **generate-iteration-tasks** 从代码库分析生成
3. 手动编写（需要通过校验）

## 校验命令

```bash
# 校验 tasks.yml 格式
agent validate-tasks <tasks.yml>

# 输出：
# ✅ 校验通过
# 或
# ❌ 校验失败：
#   - ERROR: tasks[0].id 缺失
#   - WARN: execution_plan 没有 parallel 配置
```

## 完整示例

```yaml
# tasks.yml 示例（v2.0.0 格式）
project:
  name: my-app
  path: /path/to/project
  tech_stack:
    frontend: React
    backend: Express
    database: PostgreSQL
  type: fullstack

tasks:
  # 高优先级、高风险任务
  - id: task-001
    name: "登录认证模块"
    type: feature
    priority: critical
    risk: high
    complexity: large
    value: high
    estimated_time: ">4h"
    description: "实现完整的用户认证系统"
    dependencies: []
    files:
      - path: src/auth/login.ts
        type: create
      - path: src/auth/session.ts
        type: create
    spec: |
      实现登录、注册、Session 管理
      支持 JWT + Cookie 双模式
    test_required: true
    acceptance:
      - "用户可以正常登录"
      - "Session 超时自动失效"
      - "JWT 有效期可配置"
  
  # 中优先级、低风险任务
  - id: task-002
    name: "用户列表页面"
    type: feature
    priority: high
    risk: low
    complexity: medium
    value: high
    estimated_time: "2-4h"
    description: "用户管理列表页面"
    dependencies: [task-001]
    files:
      - path: src/pages/UserList.tsx
        type: create
    spec: |
      展示用户列表，支持搜索、排序
      分页每页 20 条
    test_required: true
    acceptance:
      - "列表正常展示"
      - "搜索功能正常"
  
  # 低优先级、快速任务
  - id: task-003
    name: "优化首页加载"
    type: enhancement
    priority: medium
    risk: low
    complexity: small
    value: medium
    estimated_time: "<1h"
    description: "首页加载优化"
    dependencies: []
    files:
      - path: src/pages/Home.tsx
        type: modify
    spec: "首页组件懒加载"
    test_required: false
    acceptance:
      - "首页加载时间 < 1s"

execution_plan:
  strategy: dependency_priority
  batch_size: 3
  preset: mvp_fast
  
  # 可选：自定义权重
  weights:
    priority:
      critical: 40
      high: 30
      medium: 20
      low: 10
    risk:
      high: 30
      medium: 15
      low: 5
    value:
      high: 25
      medium: 15
      low: 5
  
  phases:
    - phase: "认证模块"
      parallel: false
      tasks: [task-001]
    - phase: "用户管理"
      parallel: true
      tasks: [task-002, task-003]

design_docs:
  requirements: docs/requirements.md
  architecture: docs/architecture.md

acceptance_criteria:
  functional:
    - "所有用户认证功能正常"
    - "用户列表搜索排序正常"
  quality:
    - "测试覆盖率 > 80%"
    - "无 ESLint 错误"
```

## 预设配置说明

| 预设 | 适用场景 | 特点 |
|------|----------|------|
| **default** | 一般项目 | 均衡配置 |
| **mvp_fast** | MVP/原型 | 快速产出优先，低风险小任务优先 |
| **urgent_critical** | 紧急项目 | 优先级驱动，忽略其他因素 |
| **explore_new** | 新技术探索 | 风险驱动，高风险大任务优先 |
| **balanced** | 稳定迭代 | 均衡配置，适合常规开发 |

## 策略说明

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **sequential** | 严格串行 | 有复杂依赖链 |
| **parallel** | 尽可能并行 | 无依赖或依赖简单 |
| **balanced** | 依赖平衡 | 一般项目 |
| **priority_first** | 优先级优先 | 紧急项目 |
| **risk_first** | 风险优先 | 新技术探索 |
| **value_first** | 价值优先 | MVP/原型 |
| **fast_first** | 快速产出 | 演示/验证 |
| **dependency_priority** | 依赖+优先级综合 | 推荐 |
| **smart** | AI 智能分析 | 复杂项目 |

## 版本历史

| 版本 | 日期 | 变化 |
|------|------|------|
| 2.1.0 | 2026-04-07 | AW-022 新增 subtasks/parent_id 字段支持任务拆分 |
| 2.0.0 | 2026-04-07 | AW-021 多因素优先级排序 |
| 1.0.0 | 2026-04-02 | 基础格式定义 |
