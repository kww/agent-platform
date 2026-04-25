# Agent Workflows 架构设计

> 版本：1.0.0
> 最后更新：2026-04-09

## 一、整体架构

```mermaid
graph TB
    subgraph "用户入口"
        Skill[OpenClaw Skill<br/>wf-*]
        CLI[CLI 命令]
        Studio[agent-studio UI]
    end

    subgraph "工作流层"
        WF[Workflows<br/>完整流程]
        subgraph "核心工作流"
            WF_Full[wf-full.yml<br/>完整开发流程]
            WF_Dev[wf-dev.yml<br/>开发流程]
            WF_Planning[wf-planning.yml<br/>规划流程]
            WF_Continue[wf-continue.yml<br/>继续流程]
            WF_Bugfix[wf-bugfix.yml<br/>Bug修复]
        end
    end

    subgraph "步骤层"
        Steps[Steps<br/>单一职责动作]
        subgraph "步骤分类"
            Step_Analysis[analysis/<br/>分析步骤]
            Step_Design[design/<br/>设计步骤]
            Step_Dev[development/<br/>开发步骤]
            Step_Quality[quality/<br/>质量步骤]
            Step_Planning[planning/<br/>规划步骤]
            Step_Governance[governance/<br/>治理步骤]
        end
    end

    subgraph "工具层"
        Tools[Tools<br/>原子操作]
        subgraph "工具分类"
            Tool_File[file/<br/>文件操作]
            Tool_Git[git/<br/>Git操作]
            Tool_Spawn[spawn/<br/>Agent调用]
            Tool_Notify[notification/<br/>通知]
            Tool_Browser[browser/<br/>浏览器]
            Tool_Docker[docker/<br/>容器]
        end
    end

    subgraph "执行引擎"
        Runtime[agent-runtime]
    end

    Skill --> WF
    CLI --> WF
    Studio --> WF

    WF --> Steps
    Steps --> Tools
    WF --> Runtime
    Steps --> Runtime
    Tools --> Runtime
```

---

## 二、三层架构

### 2.1 工作流层（Workflows）

**职责**：定义完整流程，组合多个步骤

| 工作流 | 用途 | 步骤数 |
|--------|------|--------|
| `wf-full.yml` | 完整软件开发流程 | 15+ |
| `wf-dev.yml` | 开发流程（含多立场审核） | 10+ |
| `wf-planning.yml` | 需求规划、任务拆分 | 8 |
| `wf-continue.yml` | 继续上次工作 | 5 |
| `wf-bugfix.yml` | Bug 修复流程 | 6 |
| `wf-constraint.yml` | 约束检查 | 4 |
| `wf-patch.yml` | 快速补丁 | 3 |
| `wf-quick.yml` | 轻量修复 | 2 |

### 2.2 步骤层（Steps）

**职责**：单一职责动作，可复用

| 分类 | 步骤示例 | 说明 |
|------|----------|------|
| `analysis/` | analyze-architecture, analyze-code | 代码分析 |
| `design/` | design-api, design-schema | 架构设计 |
| `development/` | fe-dev, be-dev, write-code | 开发实现 |
| `quality/` | code-review, run-tests | 质量检查 |
| `planning/` | generate-tasks, split-tasks | 任务规划 |
| `governance/` | constraint-check, review-check | 治理约束 |
| `project/` | load-state, save-state | 状态管理 |
| `backlog/` | add, list, decide | Backlog 管理 |

### 2.3 工具层（Tools）

**职责**：原子操作，无业务逻辑

| 分类 | 工具示例 | 说明 |
|------|----------|------|
| `file/` | read, write, edit | 文件操作 |
| `git/` | status, commit, push | Git 流程 |
| `spawn/` | codex, claude, pi | Agent 调用 |
| `notification/` | discord, wecom, qq | 多渠道通知 |
| `browser/` | search, fetch | Web 操作 |
| `docker/` | build, run, push | 容器操作 |
| `npm/` | install, publish | 包管理 |
| `validation/` | yaml, types, schema | 格式验证 |

---

## 三、工作流调用流程

```mermaid
sequenceDiagram
    participant User
    participant Skill
    participant Runtime
    participant WF
    participant Step
    participant Tool

    User->>Skill: /wf-dev 实现登录
    Skill->>Runtime: agent-runtime run wf-dev
    Runtime->>WF: 加载 wf-dev.yml
    WF->>Runtime: 解析步骤列表
    
    loop 每个步骤
        Runtime->>Step: 执行步骤
        Step->>Tool: 调用工具
        Tool-->>Step: 返回结果
        Step-->>Runtime: 返回输出
        Runtime->>Runtime: 更新状态
    end
    
    Runtime-->>Skill: 返回结果
    Skill-->>User: 输出结果
```

---

## 四、核心工作流详解

### 4.1 wf-full.yml（完整流程）

```mermaid
graph LR
    A[需求输入] --> B[规划阶段]
    B --> C[设计阶段]
    C --> D[开发阶段]
    D --> E[测试阶段]
    E --> F[部署阶段]
    
    subgraph B
        B1[analyze-requirement]
        B2[generate-tasks]
    end
    
    subgraph C
        C1[design-api]
        C2[design-schema]
    end
    
    subgraph D
        D1[fe-dev]
        D2[be-dev]
        D3[多立场审核]
    end
    
    subgraph E
        E1[unit-test]
        E2[integration-test]
    end
    
    subgraph F
        F1[deploy-staging]
        F2[deploy-production]
    end
```

### 4.2 wf-dev.yml（开发流程）

```yaml
# wf-dev.yml 核心结构
name: wf-dev
description: 开发流程（含多立场审核）

phases:
  - name: planning
    steps:
      - analyze-requirement
      - generate-tasks
      
  - name: development
    parallel: true
    steps:
      - fe-dev
      - be-dev
      
  - name: review
    stances: [developer, reviewer, qa]
    steps:
      - code-review
      - test-review
      
  - name: completion
    steps:
      - commit-code
      - push-code
```

### 4.3 wf-continue.yml（继续流程）

```mermaid
graph TB
    Start[启动] --> Load[加载 project-state.yml]
    Load --> Decide{decide-next-workflow}
    
    Decide -->|有 Bug| Bugfix[wf-bugfix]
    Decide -->|有 Feature| Dev[wf-dev]
    Decide -->|有规划任务| Planning[wf-planning]
    Decide -->|无任务| Done[结束]
    
    Bugfix --> Save[保存状态]
    Dev --> Save
    Planning --> Save
    Save --> Done
```

---

## 五、Backlog 管理

```mermaid
graph LR
    subgraph "Backlog 结构"
        BL[backlog.yml]
        Features[Features 列表]
        Bugs[Bugs 列表]
    end
    
    subgraph "Backlog 操作"
        Add[backlog/add]
        List[backlog/list]
        Update[backlog/update]
        Decide[backlog/decide]
    end
    
    BL --> Features
    BL --> Bugs
    
    Add --> BL
    List --> BL
    Update --> BL
    Decide --> BL
```

**backlog.yml 结构**：
```yaml
project: my-project
features:
  - id: F-001
    title: 用户登录
    status: pending
    priority: P1
    
bugs:
  - id: B-001
    title: 登录失败
    status: open
    severity: high
```

---

## 六、步骤定义规范

```yaml
# steps/xxx.yml 标准格式
name: step-name
description: 步骤描述

input:
  param1:
    type: string
    required: true
    description: 参数说明

output:
  result1:
    type: string
    description: 输出说明

agent: claude  # 或 codex, pi

prompt: |
  执行步骤的具体提示词
  可使用 ${input.param1} 引用输入

handler: builtin_handler_name  # 或自定义 handler

retry:
  maxAttempts: 3
  backoff: exponential

timeout: 300000  # 5分钟
```

---

## 七、工具定义规范

```yaml
# tools/xxx.yml 标准格式
name: tool-name
description: 工具描述

input:
  param1:
    type: string
    required: true

output:
  result1:
    type: string

handler: builtin_handler_name

# 工具无 Agent、无 Prompt，纯 Handler 执行
```

---

## 八、目录结构

```
agent-workflows/
├── workflows/         # 工作流定义
│   ├── wf-full.yml
│   ├── wf-dev.yml
│   ├── wf-planning.yml
│   ├── wf-continue.yml
│   ├── wf-bugfix.yml
│   ├── wf-constraint.yml
│   ├── wf-patch.yml
│   ├── wf-quick.yml
│   └── wf-dev/        # wf-dev 子工作流
│       ├── planning.yml
│       ├── development.yml
│       └── review.yml
│
├── steps/             # 步骤定义
│   ├── analysis/
│   ├── design/
│   ├── development/
│   ├── quality/
│   ├── planning/
│   ├── governance/
│   ├── project/
│   ├── backlog/
│   ├── bugfix/
│   ├── constraint/
│   ├── deploy/
│   ├── evolution/
│   ├── file/
│   ├── patch/
│   └── quick/
│
├── tools/             # 工具定义
│   ├── file/
│   ├── git/
│   ├── spawn/
│   ├── notification/
│   ├── browser/
│   ├── docker/
│   ├── npm/
│   ├── governance/
│   ├── verification/
│   └── validation/
│
├── skills/            # OpenClaw Skills
│   ├── wf-req/
│   ├── wf-arch/
│   ├── wf-dev/
│   ├── wf-be/
│   ├── wf-fe/
│   ├── wf-test/
│   ├── wf-review/
│   ├── wf-deploy/
│   ├── wf-analyze/
│   ├── wf-compare/
│   ├── wf-deps/
│   ├── wf-perf/
│   └── wf-solo/
│
├── docs/              # 文档
│   ├── architecture.md
│   ├── workflow-development-guide.md
│   ├── step-development-guide.md
│   ├── best-practices.md
│   ├── backlog-yml-spec.md
│   ├── tasks-yml-spec.md
│   └── project-state-yml-spec.md
│
├── tests/             # 测试（BATS）
│
├── CAPABILITIES.md    # 能力清单
├── README.md
└── package.json
```

---

## 九、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2026-04-07 | 约束工作流、规划增强、步骤完善 |
| 0.9.0 | 2026-04-02 | Backlog 管理、Bug 生命周期 |
| 0.8.0 | 2026-03-30 | wf-continue、project-state |
| 0.7.0 | 2026-03-25 | 基础工作流定义 |

---

## 十、依赖关系

```mermaid
graph LR
    AW[agent-workflows] -->|定义| AR[agent-runtime]
    AW -->|Skill| OpenClaw
    
    AR -->|执行| AW
    OpenClaw -->|触发| AW
```

---

*文档维护：agent-workflows 项目*
*知识库整合视图：`~/knowledge-base/projects/agent-system-architecture.md`*