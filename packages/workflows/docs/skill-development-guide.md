# Skill 开发指南

> 版本: 2.0.0 | 更新: 2026-04-14
> 从 Step 重命名为 Skill - v0.8 概念对齐

## 目录

1. [概述](#概述)
2. [Skill 结构](#Skill 结构)
3. [字段详解](#字段详解)
4. [Skill 类型](#Skill 类型)
5. [输入输出](#输入输出)
6. [错误处理](#错误处理)
7. [最佳实践](#最佳实践)
8. [示例](#示例)

---

## 概述

**Skill** 是可复用的能力单元，用户可直接调用。每个 Skill 封装一个具体的功能，如：

- 分析项目结构
- 生成代码
- 运行测试
- Git 操作

**设计原则**：

1. **单一职责** - 每个Skill只做一件事
2. **可复用** - Skill可在多个工作流中复用
3. **可组合** - 通过输入输出连接，形成工作流

---

## Skill结构

```yaml
# Skill注释（可选，但推荐）
# skill-name - 简短描述
#
# 输入：
#   - input1: 说明
#   - input2: 说明
#
# 输出：
#   - output1: 说明

id: category/action          # 唯一标识，格式：类别/动作
name: Skill名称               # 人类可读名称
description: 详细描述        # Skill做什么
category: category           # 分类（可选）

# 执行方式
execute:
  type: builtin | agent | workflow
  handler: handler-name     # builtin: 内置处理器
  agent: codex              # agent: 使用的 Agent
  workflow: workflow-id     # workflow: 调用的子工作流

# 输入定义
inputs:
  input_name:
    type: string | object | array | boolean | number
    description: 输入说明
    required: true | false
    default: 默认值         # 可选

# 输出定义
outputs:
  - name: output_name
    type: string | object | array
    description: 输出说明

# 错误处理（可选）
on_error:
  strategy: retry | skip | fail
  max_retries: 3
  fallback: fallback-skill-id
```

---

## 字段详解

### id

**格式**: `category/action`

**示例**:
```yaml
id: backlog/add
id: design/api
id: analysis/detect-layers
id: git/commit
```

**命名规范**:
- 使用小写字母和连字符
- 类别表示Skill所属领域
- 动作表示具体操作

---

### name

**用途**: 显示名称，用于 UI 和日志

**示例**:
```yaml
name: 添加待办项
name: 设计 API
name: 检测层级
name: Git 提交
```

---

### description

**用途**: 详细说明Skill功能

**示例**:
```yaml
description: |
  向项目 Backlog 添加新的待办项。
  支持添加 Feature、Bug、Enhancement 等类型。
```

---

### execute

定义Skill如何执行。

#### builtin - 内置处理器

```yaml
execute:
  type: builtin
  handler: backlog/add
```

**可用处理器**:
| 处理器 | 用途 |
|--------|------|
| `backlog/add` | 添加待办项 |
| `backlog/list` | 列出待办项 |
| `backlog/update` | 更新待办项 |
| `backlog/resolve` | 解决待办项 |
| `git-commit` | Git 提交 |
| `file/write` | 写入文件 |
| `file/read` | 读取文件 |

#### agent - Agent 执行

```yaml
execute:
  type: agent
  agent: codex
  prompt: |
    分析项目结构：
    项目路径: {{project_path}}
    
    请识别：
    1. 技术栈
    2. 目录结构
    3. 主要模块
```

#### workflow - 调用子工作流

```yaml
execute:
  type: workflow
  workflow: wf-constraint
  input:
    project_path: "{{project_path}}"
```

---

### inputs

定义Skill的输入参数。

```yaml
inputs:
  project_path:
    type: string
    description: 项目路径
    required: true
  
  options:
    type: object
    description: 配置选项
    required: false
    default: {}
    properties:
      verbose:
        type: boolean
        default: false
      output_format:
        type: string
        enum: [json, yaml, text]
        default: json
  
  items:
    type: array
    description: 待处理项列表
    required: true
    items:
      type: object
      properties:
        name:
          type: string
        priority:
          type: number
```

---

### outputs

定义Skill的输出。

```yaml
outputs:
  - name: result
    type: object
    description: 执行结果
  
  - name: metrics
    type: object
    description: 执行指标
    properties:
      files_processed:
        type: number
      time_elapsed:
        type: number
```

---

## Skill类型

### 1. Builtin Skill

内置处理器，性能最好，适合简单操作。

```yaml
id: backlog/add
name: 添加待办项
execute:
  type: builtin
  handler: backlog/add
inputs:
  project_path:
    type: string
    required: true
  item:
    type: object
    required: true
outputs:
  - name: item
    type: object
```

### 2. Agent Skill

Agent 执行，适合复杂任务。

```yaml
id: design/api
name: 设计 API
execute:
  type: agent
  agent: codex
  prompt: |
    为以下功能设计 API：
    {{feature_description}}
    
    项目路径: {{project_path}}
outputs:
  - name: api_spec
    type: object
```

### 3. Workflow Skill

调用子工作流，适合复用已有工作流。

```yaml
id: quality/check
name: 质量检查
execute:
  type: workflow
  workflow: wf-constraint
inputs:
  project_path:
    type: string
    required: true
outputs:
  - name: report
    type: object
```

---

## 输入输出

### 模板变量

在工作流中引用Skill输出：

```yaml
skills:
  - id: skill1
    output: result
  
  - id: skill2
    input:
      # 引用上一步输出
      data: "{{result}}"
      
      # 引用特定字段
      items: "{{result.items}}"
      
      # 引用工作流输入
      project: "{{project_path}}"
```

### 条件输出

```yaml
outputs:
  - name: result
    type: object
    condition: "{{success}}"
    description: 成功时输出
  
  - name: error
    type: object
    condition: "{{not success}}"
    description: 失败时输出
```

---

## 错误处理

### Skill级错误处理

```yaml
id: risky-skill
name: 有风险的Skill
execute:
  type: agent
  agent: codex
  prompt: "执行任务"

# 错误处理配置
on_fail:
  strategy: retry | skip | fail | fallback
  max_retries: 3
  retry_delay: 1000  # 毫秒
  
  # 回退Skill
  fallback:
    skill: backup-skill
    input:
      original_error: "{{error}}"
```

### 错误类型

| 类型 | 说明 | 处理建议 |
|------|------|----------|
| `timeout` | 执行超时 | retry + 增加超时 |
| `network_fail` | 网络错误 | retry + backoff |
| `agent_fail` | Agent 执行失败 | retry 或 fallback |
| `validation_fail` | 输入验证失败 | fail（不重试） |
| `resource_limit` | 资源限制 | skip 或 fail |
| `config_error` | 配置错误 | fail（需人工修复） |
| `permission_denied` | 权限不足 | fail（需人工修复） |
| `unknown` | 未知错误 | 记录日志，fail |

### 示例

```yaml
id: deploy/push
name: 部署推送
execute:
  type: agent
  agent: codex
  prompt: "推送代码到远程仓库"

on_fail:
  strategy: retry
  max_retries: 3
  retry_delay: 2000
  
  error_handlers:
    - type: network_fail
      action: retry
      max_retries: 5
      retry_delay: 5000
    
    - type: permission_denied
      action: fail
      message: "请检查 Git 凭证配置"
```

---

## 最佳实践

### 1. 单一职责

```yaml
# ✅ 好：一个Skill做一件事
id: analysis/detect-layers
name: 检测项目层级

# ❌ 坏：一个Skill做多件事
id: analysis/detect-and-design
name: 检测层级并设计架构
```

### 2. 明确输入输出

```yaml
# ✅ 好：明确列出所有输入输出
inputs:
  project_path:
    type: string
    description: 项目根目录路径
    required: true

outputs:
  - name: layers
    type: array
    description: 检测到的层级列表

# ❌ 坏：缺少描述
inputs:
  path: { type: string }
```

### 3. 合理默认值

```yaml
# ✅ 好：提供合理默认值
inputs:
  output_format:
    type: string
    enum: [json, yaml, text]
    default: json
  
  max_items:
    type: number
    default: 100

# ❌ 坏：无默认值，强制要求
inputs:
  format: { type: string, required: true }
```

### 4. 错误恢复

```yaml
# ✅ 好：提供回退方案
on_fail:
  strategy: fallback
  fallback:
    skill: backup-plan

# ❌ 坏：直接失败
# 无 on_fail 配置
```

---

## 示例

### 完整Skill示例

```yaml
# design/api - API 设计Skill
#
# 输入：
#   - project_path: 项目路径
#   - feature_description: 功能描述
#   - style_guide: API 风格（可选）
#
# 输出：
#   - api_spec: API 规范
#   - endpoints: 端点列表

id: design/api
name: 设计 API
description: |
  根据功能描述设计 REST API。
  支持多种 API 风格，默认 RESTful。
category: design

execute:
  type: agent
  agent: codex
  prompt: |
    为以下功能设计 REST API：
    
    功能描述: {{feature_description}}
    项目路径: {{project_path}}
    API 风格: {{style_guide}}
    
    请生成：
    1. 端点列表（含方法、路径、描述）
    2. 请求/响应格式
    3. 错误码定义

inputs:
  project_path:
    type: string
    description: 项目根目录路径
    required: true
  
  feature_description:
    type: string
    description: 功能描述
    required: true
  
  style_guide:
    type: string
    description: API 风格指南
    required: false
    default: restful
    enum: [restful, graphql, rpc]

outputs:
  - name: api_spec
    type: object
    description: 完整 API 规范
    properties:
      version:
        type: string
      endpoints:
        type: array
      schemas:
        type: object
  
  - name: endpoints
    type: array
    description: 端点列表（简化版）
    items:
      type: object
      properties:
        method:
          type: string
        path:
          type: string
        description:
          type: string

on_fail:
  strategy: retry
  max_retries: 2
  error_handlers:
    - type: agent_fail
      action: retry
    - type: timeout
      action: fail
      message: "API 设计超时，请简化功能描述"
```

---

## Skill目录结构

```
skills/
├── README.md              # Skill索引
├── analysis/              # 分析类Skill
│   ├── detect-layers.yml
│   └── analyze-project.yml
├── backlog/               # Backlog 管理
│   ├── add.yml
│   ├── list.yml
│   ├── update.yml
│   └── resolve.yml
├── design/                # 设计类Skill
│   ├── api.yml
│   ├── architecture.yml
│   └── db.yml
├── development/           # 开发类Skill
│   ├── implement.yml
│   └── test.yml
└── quality/               # 质量检查Skill
    ├── lint.yml
    └── test.yml
```

---

## 参考资源

- [工作流开发指南](./workflow-development-guide.md)
- [最佳实践文档](./best-practices.md)
- [Backlog 规范](./backlog-yml-spec.md)
- [Tasks 规范](./tasks-yml-spec.md)