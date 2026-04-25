# 工作流开发指南

> 版本: 1.0.0 | 更新: 2026-04-07

## 目录

1. [概述](#概述)
2. [工作流结构](#工作流结构)
3. [步骤编排](#步骤编排)
4. [流程控制](#流程控制)
5. [模式类型](#模式类型)
6. [最佳实践](#最佳实践)
7. [示例](#示例)

---

## 概述

工作流（Workflow）是一系列步骤的有序编排，完成一个完整的任务。

**层级分类**：

| 层级 | 工作流 | 用途 |
|:----:|--------|------|
| L0 | wf-patch | 文案修改 |
| L1 | wf-quick, wf-bugfix | 小功能、Bug 修复 |
| L2 | wf-dev, wf-solo | 标准开发 |
| L3 | wf-full, wf-iterate | 大型功能 |
| L4 | wf-release | 发布上线 |

**设计原则**：

1. **渐进增强** - 从简单到复杂
2. **可组合** - 工作流可调用子工作流
3. **可恢复** - 支持中断后继续执行

---

## 工作流结构

```yaml
# 工作流注释（推荐）
# workflow-id - 简短描述
#
# 用途：xxx
# 特点：xxx
#
# 调用方式：
#   POST /api/execute
#   { ... }

id: workflow-id             # 唯一标识
name: 工作流名称            # 人类可读名称
description: 详细描述       # 工作流做什么
category: development       # 分类
emoji: "🚀"                 # UI 显示图标（可选）

# 使用场景说明（推荐）
usageScenario: |
  🎯 **适合场景**：
  - xxx
  
  ⚠️ **不适合**：
  - xxx → 用其他工作流

# 输入参数
inputs:
  - name: project_path
    type: string
    required: true
    description: 项目路径

# 步骤编排
steps:
  - id: step1
    step: category/action
    ...
  
  - id: step2
    ...

# 执行配置
config:
  ironLaws: true            # 是否检查 Iron Laws
  runTests: true            # 是否运行测试
  defaultAgent: codex       # 默认 Agent
  timeout: 300000           # 超时时间（毫秒）

# 输出定义
outputs:
  - name: result
    type: object
```

---

## 步骤编排

### 基本编排

```yaml
steps:
  # Step 1
  - id: analyze
    step: analysis/detect-layers
    input:
      project_path: "{{project_path}}"
    output: analysis

  # Step 2 - 引用上一步输出
  - id: design
    step: design/architecture
    input:
      project_path: "{{project_path}}"
      analysis: "{{analysis}}"
    output: architecture

  # Step 3
  - id: implement
    step: development/implement
    input:
      project_path: "{{project_path}}"
      architecture: "{{architecture}}"
    output: implementation
```

### 条件执行

```yaml
steps:
  - id: check
    step: quality/check
    output: check_result
  
  # 仅在检查通过时执行
  - id: deploy
    step: deploy/push
    condition: "{{check_result.passed}}"
    input:
      ...
  
  # 仅在检查失败时执行
  - id: fix
    step: development/fix
    condition: "{{not check_result.passed}}"
    input:
      issues: "{{check_result.issues}}"
```

### 并行执行

```yaml
steps:
  # 并行执行多个步骤
  - id: parallel-design
    parallel:
      - id: api-design
        step: design/api
        input:
          feature: "{{feature_description}}"
        output: api_spec
      
      - id: db-design
        step: design/db
        input:
          feature: "{{feature_description}}"
        output: db_schema
      
      - id: ui-design
        step: design/ui
        input:
          feature: "{{feature_description}}"
        output: ui_spec
    
    # 等待所有并行步骤完成
    output:
      api: "{{api_spec}}"
      db: "{{db_schema}}"
      ui: "{{ui_spec}}"

  # 并行完成后继续
  - id: implement
    step: development/implement
    input:
      api: "{{parallel-design.api}}"
      db: "{{parallel-design.db}}"
      ui: "{{parallel-design.ui}}"
```

---

## 流程控制

### Phase 分组

将步骤按阶段分组，便于理解和调试：

```yaml
steps:
  # ========== Phase 1: 分析 ==========
  - id: analyze-1
    ...
  - id: analyze-2
    ...
  
  # ========== Phase 2: 设计 ==========
  - id: design-1
    ...
  - id: design-2
    ...
  
  # ========== Phase 3: 实现 ==========
  - id: implement-1
    ...
```

### 子工作流调用

```yaml
steps:
  # 调用 wf-constraint 约束检查
  - id: constraint-check
    execute:
      type: workflow
      workflow: wf-constraint
    input:
      project_path: "{{project_path}}"
      constraint_level: strict
    output: constraint_result

  # 调用 wf-planning 规划
  - id: planning
    execute:
      type: workflow
      workflow: wf-planning
    input:
      project_path: "{{project_path}}"
      feature_description: "{{feature_description}}"
      mode: new_project
    output: tasks
```

### 循环处理

```yaml
steps:
  - id: process-items
    loop:
      items: "{{items}}"
      item_var: item
      step: process/single
      input:
        item: "{{item}}"
      output: results
```

---

## 模式类型

### 1. 线性模式

最简单的模式，步骤顺序执行：

```yaml
steps:
  - id: a
    ...
  - id: b
    ...      # 等待 a 完成
  - id: c
    ...      # 等待 b 完成
```

**适用**：L0/L1 轻量工作流

---

### 2. 分支模式

根据条件选择不同路径：

```yaml
steps:
  - id: check
    output: result
  
  - id: path-a
    condition: "{{result.type == 'feature'}}"
    ...
  
  - id: path-b
    condition: "{{result.type == 'bug'}}"
    ...
```

**适用**：Bug 修复、类型判断

---

### 3. 并行模式

多个步骤同时执行：

```yaml
steps:
  - id: parallel
    parallel:
      - id: frontend
        ...
      - id: backend
        ...
```

**适用**：前后端并行开发（wf-dev）

---

### 4. 循环模式

批量处理多个项目：

```yaml
steps:
  - id: batch-process
    loop:
      items: "{{items}}"
      ...
```

**适用**：批量测试、批量部署

---

### 5. 子工作流模式

调用其他工作流：

```yaml
steps:
  - id: subworkflow
    execute:
      type: workflow
      workflow: wf-xxx
```

**适用**：复用已有工作流

---

## 最佳实践

### 1. 选择合适层级

```yaml
# ✅ 好：选择合适的工作流
wf-patch    # 文案修改
wf-quick    # 小功能（1-3 文件）
wf-dev      # 标准开发（前后端并行）
wf-full     # 大型功能（完整流程）

# ❌ 坏：用 wf-full 做文案修改（过度设计）
```

### 2. 明确输入输出

```yaml
# ✅ 好：明确列出输入
inputs:
  - name: project_path
    type: string
    required: true
    description: 项目根目录路径
  
  - name: feature_description
    type: string
    required: true
    description: 功能描述

# ❌ 坏：隐式依赖外部状态
# 无 inputs 定义，依赖全局变量
```

### 3. 添加使用场景说明

```yaml
# ✅ 好：帮助用户选择正确工作流
usageScenario: |
  🎯 **适合场景**：
  - 小功能开发（1-3 个文件）
  - 原型/POC 开发
  
  ⚠️ **不适合**：
  - 文案修改 → 用 wf-patch
  - Bug 修复 → 用 wf-bugfix
  - 大型功能 → 用 wf-iterate

# ❌ 坏：无使用场景说明
```

### 4. 合理超时设置

```yaml
# ✅ 好：根据任务复杂度设置超时
config:
  timeout: 300000  # 5 分钟（L1）

# ✅ 好：大型功能设置更长超时
config:
  timeout: 1800000  # 30 分钟（L3）

# ❌ 坏：超时太短
config:
  timeout: 60000  # 1 分钟（不够）
```

### 5. 添加 Phase 分组

```yaml
# ✅ 好：清晰的 Phase 分组
steps:
  # ========== Phase 1: 分析 ==========
  - id: analyze
    ...
  
  # ========== Phase 2: 设计 ==========
  - id: design
    ...

# ❌ 坅：无分组，难以理解
steps:
  - id: step1
    ...
  - id: step2
    ...
  - id: step3
    ...
```

---

## 示例

### L0 轻量工作流：wf-patch

```yaml
id: wf-patch
name: 文案修改
description: L0 轻量工作流 - 文案、配置修改
category: development
emoji: "📝"

usageScenario: |
  🎯 **适合场景**：
  - 文案修改
  - 配置调整
  - 注释更新
  
  ⚠️ **不适合**：
  - 代码修改 → 用 wf-quick
  - Bug 修复 → 用 wf-bugfix

inputs:
  - name: project_path
    type: string
    required: true
  
  - name: change_description
    type: string
    required: true

steps:
  # Step 1: 分析修改范围
  - id: analyze
    step: patch/analyze
    input:
      project_path: "{{project_path}}"
      change_description: "{{change_description}}"
    output: analysis

  # Step 2: 应用修改
  - id: apply
    step: patch/apply
    input:
      project_path: "{{project_path}}"
      analysis: "{{analysis}}"
    output: result

  # Step 3: 提交
  - id: commit
    execute:
      type: builtin
      handler: git-commit
    input:
      message: "patch: {{change_description}}"
    output: commit_result

config:
  ironLaws: false
  runTests: false
  timeout: 60000  # 1 分钟
```

---

### L1 轻量工作流：wf-quick

```yaml
id: wf-quick
name: Quick Feature
description: L1 轻量工作流 - 小功能/原型开发
category: development
emoji: "⚡"

usageScenario: |
  🎯 **适合场景**：
  - 小功能开发（1-3 个文件）
  - 原型/POC 开发
  - 简单 API 端点
  
  ⚠️ **不适合**：
  - 文案修改 → 用 wf-patch
  - Bug 修复 → 用 wf-bugfix
  - 大型功能 → 用 wf-iterate

inputs:
  - name: project_path
    type: string
    required: true
  
  - name: feature_description
    type: string
    required: true

steps:
  # Phase 1: 分析
  - id: analyze
    step: quick/analyze
    input:
      project_path: "{{project_path}}"
      feature_description: "{{feature_description}}"
    output: analysis

  # Phase 2: 实现
  - id: implement
    step: quick/implement
    input:
      project_path: "{{project_path}}"
      analysis: "{{analysis}}"
    output: implementation

  # Phase 3: 验证
  - id: verify
    step: quick/verify
    input:
      project_path: "{{project_path}}"
      implementation: "{{implementation}}"
    output: verify_result

  # Phase 4: 提交
  - id: commit
    execute:
      type: builtin
      handler: git-commit
    input:
      message: "feat: {{feature_description}}"
    output: commit_result

config:
  ironLaws: true
  runTests: true
  defaultAgent: codex
  timeout: 300000  # 5 分钟
```

---

### L2 标准工作流：wf-dev（前后端并行）

```yaml
id: wf-dev
name: 团队协作流程
description: L2 标准工作流 - 前后端并行开发，有 API 契约
category: development
emoji: "👥"

usageScenario: |
  🎯 **适合场景**：
  - 前后端分离项目
  - 有明确的 API 契约
  - 团队协作开发
  
  ⚠️ **不适合**：
  - 个人开发 → 用 wf-solo
  - 小功能 → 用 wf-quick

inputs:
  - name: project_path
    type: string
    required: true
  
  - name: feature_description
    type: string
    required: true
  
  - name: feature_id
    type: string
    required: false
    description: Feature ID（从 backlog 加载）

steps:
  # ========== Phase 0: 加载 Feature ==========
  - id: load-feature
    condition: "{{feature_id != null}}"
    step: backlog/load
    input:
      project_path: "{{project_path}}"
      item_id: "{{feature_id}}"
    output: feature

  # ========== Phase 1: 分析 ==========
  - id: analyze
    step: analysis/detect-layers
    input:
      project_path: "{{project_path}}"
    output: layers

  # ========== Phase 2: 设计 API ==========
  - id: design-api
    step: design/api
    input:
      project_path: "{{project_path}}"
      feature_description: "{{feature.description || feature_description}}"
    output: api_spec

  # ========== Phase 3: 并行开发 ==========
  - id: parallel-dev
    parallel:
      # 前端开发
      - id: frontend
        step: development/frontend
        input:
          project_path: "{{project_path}}"
          api_spec: "{{api_spec}}"
        output: frontend_result
      
      # 后端开发
      - id: backend
        step: development/backend
        input:
          project_path: "{{project_path}}"
          api_spec: "{{api_spec}}"
        output: backend_result
    
    output:
      frontend: "{{frontend_result}}"
      backend: "{{backend_result}}"

  # ========== Phase 4: 集成测试 ==========
  - id: integration-test
    step: quality/integration-test
    input:
      project_path: "{{project_path}}"
    output: test_result

  # ========== Phase 5: 解决 Feature ==========
  - id: resolve-feature
    condition: "{{feature_id != null}}"
    step: backlog/resolve
    input:
      project_path: "{{project_path}}"
      item_id: "{{feature_id}}"
    output: resolve_result

config:
  ironLaws: true
  runTests: true
  defaultAgent: codex
  timeout: 600000  # 10 分钟
```

---

### L3 大型工作流：wf-full

```yaml
id: wf-full
name: 完整开发流程
description: L3 大型功能 - 从需求分析到部署上线
category: development
emoji: "🚀"

usageScenario: |
  🎯 **适合场景**：
  - 大型功能开发
  - 从零开始的新项目
  - 需要完整流程
  
  ⚠️ **不适合**：
  - 小功能 → 用 wf-quick
  - Bug 修复 → 用 wf-bugfix

inputs:
  - name: project_path
    type: string
    required: true
  
  - name: feature_description
    type: string
    required: true

steps:
  # ========== Phase 1: 需求分析 ==========
  - id: analyze-requirements
    step: planning/analyze-requirements
    input:
      feature_description: "{{feature_description}}"
    output: requirements

  # ========== Phase 2: 架构设计 ==========
  - id: design-architecture
    step: design/architecture
    input:
      project_path: "{{project_path}}"
      requirements: "{{requirements}}"
    output: architecture

  # ========== Phase 3: 任务拆分 ==========
  - id: split-tasks
    step: planning/split-tasks
    input:
      architecture: "{{architecture}}"
      requirements: "{{requirements}}"
    output: tasks

  # ========== Phase 4: 开发 ==========
  - id: implement
    step: development/implement
    input:
      project_path: "{{project_path}}"
      tasks: "{{tasks}}"
    output: implementation

  # ========== Phase 5: 测试 ==========
  - id: test
    step: quality/test
    input:
      project_path: "{{project_path}}"
    output: test_result

  # ========== Phase 6: 提交 ==========
  - id: commit
    execute:
      type: builtin
      handler: git-commit
    input:
      message: "feat: {{feature_description}}"
    output: commit_result

config:
  ironLaws: true
  runTests: true
  defaultAgent: codex
  timeout: 1800000  # 30 分钟
```

---

### 调用子工作流：wf-release

```yaml
id: wf-release
name: 发布上线流程
description: L4 发布流程 - 约束检查 + 发布
category: deploy
emoji: "📦"

inputs:
  - name: project_path
    type: string
    required: true
  
  - name: enable_constraints
    type: boolean
    required: false
    default: true

steps:
  # ========== Phase 1: 约束检查 ==========
  - id: constraint-check
    condition: "{{enable_constraints}}"
    execute:
      type: workflow
      workflow: wf-constraint
    input:
      project_path: "{{project_path}}"
      constraint_level: strict
    output: constraint_result

  # ========== Phase 2: 发布准备 ==========
  - id: prepare
    step: deploy/prepare
    input:
      project_path: "{{project_path}}"
    output: prepare_result

  # ========== Phase 3: 发布 ==========
  - id: deploy
    step: deploy/push
    input:
      project_path: "{{project_path}}"
    output: deploy_result

config:
  ironLaws: true
  runTests: true
  timeout: 600000  # 10 分钟
```

---

## 工作流目录结构

```
workflows/
├── wf-patch.yml           # L0 文案修改
├── wf-quick.yml           # L1 小功能
├── wf-bugfix.yml          # L1 Bug 修复
├── wf-dev.yml             # L2 团队协作
├── wf-solo.yml            # L2 个人开发
├── wf-full.yml            # L3 大型功能
├── wf-iterate.yml         # L3 迭代开发
├── wf-release.yml         # L4 发布上线
├── wf-constraint.yml      # 约束检查
├── wf-planning.yml        # 规划
└── wf-continue.yml        # 继续执行
```

---

## 参考资源

- [步骤开发指南](./step-development-guide.md)
- [最佳实践文档](./best-practices.md)
- [Backlog 规范](./backlog-yml-spec.md)
- [Tasks 规范](./tasks-yml-spec.md)