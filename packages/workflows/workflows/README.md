# Workflows - 编排层

Workflows 是工作流引擎的**编排层**，定义完整的业务流程。

---

## 核心定义

**Workflow = 多步骤编排，定义完整的业务流程**

| 特征 | 说明 |
|------|------|
| 执行方式 | 编排多个 Step / Tool / Script |
| Agent 调用 | ✅ 可选（通过 Step） |
| 复用范围 | 项目级流程模板 |
| 创建文件 | ✅ workflows/xxx.yml |

---

## 目录结构

```
workflows/
├── wf-iterate.yml          # 迭代开发工作流
├── wf-evolution.yml        # 系统进化工作流
├── wf-verify-loop.yml      # 验证闭环工作流
├── wf-review.yml           # 代码审查工作流
├── wf-deploy.yml           # 部署工作流
└── ...
```

---

## Workflow 文件格式

```yaml
# workflows/wf-xxx.yml
id: wf-xxx
name: 工作流名称
description: |
  工作流描述
  
  核心流程：
  1. 步骤一
  2. 步骤二
  3. ...

# 使用场景
usageScenario: |
  🎯 **适合场景**：
  - 场景一
  - 场景二
  
  ⚠️ **不适合**：
  - 场景三

# OpenClaw 元数据
openclaw:
  userInvocable: true
  emoji: "🔧"
  keywords: [关键词, 列表]

# 输入参数
inputs:
  - name: param1
    type: string
    required: true
    description: 参数说明
  
  - name: param2
    type: number
    default: 3
    description: 可选参数

# 工作流步骤
steps:
  - id: phase-1
    phase: 阶段一
    
  - id: step-1
    tool: docker/run
    input:
      image_name: "${inputs.param1}"
  
  - id: step-2
    step: quality/run-tests
    input:
      project_path: "${inputs.project_path}"
  
  - id: step-3
    script: |
      #!/bin/bash
      echo "Done"

# 输出
outputs:
  - name: result
    type: string

# 超时配置
timeout: 1800  # 秒

# 标签
tags:
  - tag1
  - tag2

# 分类
category: development
```

---

## 步骤类型

### 1. 引用 Tool

```yaml
- id: start-container
  tool: docker/run
  input:
    image_name: "myapp"
  output:
    - container_id
```

### 2. 引用 Step 文件

```yaml
- id: run-tests
  step: quality/run-tests
  input:
    project_path: "${inputs.project_path}"
```

### 3. 内联脚本

```yaml
- id: check-health
  script: |
    #!/bin/bash
    curl http://localhost:3000/health
```

### 4. 调用 Agent

```yaml
- id: fix-bugs
  agent: codex
  prompt: |
    修复发现的错误...
    
    **项目路径**: ${inputs.project_path}
```

### 5. 循环结构

```yaml
- id: verify-loop
  type: loop
  max_iterations: 3
  initial_state:
    iteration: 0
    errors_found: 0
  
  steps:
    - id: test
      tool: browser/automate
      input:
        url: "${inputs.test_url}"
    
    - id: check
      script: |
        ERROR_COUNT=$(grep -c "error" /tmp/log.txt)
        echo "ERROR_COUNT=$ERROR_COUNT"
    
    - id: update
      action: set_state
      state:
        iteration: "${state.iteration + 1}"
  
  loop_condition: "${state.errors_found} > 0"
```

---

## 层级架构

```
┌─────────────────────────────────────────────────────────────┐
│                     Workflow（编排层）                       │
│                                                             │
│  定义完整业务流程，编排多个执行单元                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Steps（执行层）                    │   │
│  │                                                     │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │ tool 引用 │ │ step 引用│ │  script  │            │   │
│  │  └────┬─────┘ └────┬─────┘ └──────────┘            │   │
│  │       │            │                               │   │
│  └───────┼────────────┼───────────────────────────────┘   │
│          │            │                                   │
│  ┌───────┼────────────┼───────────────────────────────┐   │
│  │       ↓            ↓         Tools（能力层）        │   │
│  │  ┌──────────┐ ┌──────────┐                         │   │
│  │  │ docker/  │ │ browser/ │  ...                    │   │
│  │  │  run.yml │ │ automate │                         │   │
│  │  └──────────┘ └──────────┘                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 三层职责

| 层级 | 职责 | Agent | 文件 |
|------|------|:-----:|------|
| **Workflow** | 流程编排 | - | workflows/*.yml |
| **Step** | 执行单元 | ✅ 可选 | steps/*.yml 或内联 |
| **Tool** | 单一能力 | ❌ | tools/*.yml |

---

## 设计原则

### 1. 单一职责

每个 Workflow 解决一类问题：

| Workflow | 用途 |
|----------|------|
| wf-iterate | 迭代开发 |
| wf-evolution | 系统进化 |
| wf-verify-loop | 验证闭环 |
| wf-review | 代码审查 |

### 2. 参数化

```yaml
# ✅ 好的设计：参数化
inputs:
  - name: project_path
    type: path
    required: true

# ❌ 坏的设计：硬编码
script: cd /fixed/path
```

### 3. 可观测性

```yaml
steps:
  - id: important-step
    # ... 步骤定义
    output:
      - status      # 输出关键状态
      - result_path
```

---

## 触发方式

### 手动触发

```bash
/wf-iterate /path/to/project "实现用户登录功能"
```

### 定时触发

```yaml
# 通过 cron 配置
schedule: "0 9 * * 1"  # 每周一 9:00
```

### 事件触发

```yaml
# Git push 时触发
trigger:
  event: push
  branch: main
```

---

## 相关文档

- [Tools 能力层](../tools/README.md)
- [Steps 执行层](../steps/README.md)
