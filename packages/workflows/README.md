# Agent Workflows

> AI Agent 工作流定义仓库 - Skills, Workflows, Tools

纯数据仓库，无代码，无依赖。

---

## 能力统计

| 层级 | 数量 | 说明 |
|------|------|------|
| **Tools** | 30 | 底层能力（原子操作，纯脚本） |
| **Skills** | 84 | 能力单元（可调用，含 Agent 封装） |
| **Workflows** | 29 | 工作流定义（编排，支持 phases） |

---

## 目录结构

```
agent-workflows/
├── tools/              # 底层能力（28 个）
│   ├── git/            # git 操作：clone, commit, push, branch, worktree
│   ├── npm/            # npm 操作：install, build, test
│   ├── docker/         # Docker 操作：run, build
│   ├── browser/        # 浏览器自动化：automate, mcp-debug, browser-start, browser-close
│   ├── file/           # 文件操作：read, write, copy
│   ├── code/           # 代码操作：parse, fingerprint, register-language
│   ├── governance/     # 治理工具：define-stance, aggregate-opinions
│   ├── notification/   # 通知工具：notify
│   ├── validation/     # 验证工具：validate-handlers, validate-readme-stats, validate-yaml-syntax, check-reuse
│   └── verification/   # 验证工具：verify_completion, wait-condition
│
├── skills/             # 能力单元（v0.8，原 steps 目录重命名）
│   ├── analysis/       # 分析类：analyze-codebase, analyze-impact...
│   ├── design/         # 设计类：generate-spec, design-architecture, design-api...
│   ├── development/    # 开发类：develop-task, execute-batch...
│   ├── planning/       # 规划类：load-tasks, validate-tasks, split-batch...
│   ├── quality/        # 质量类：review-code, run-tests, debug-systematic...
│   ├── deploy/         # 部署类：commit-push, deploy-frontend, deploy-backend...
│   ├── patch/          # Patch 类：execute
│   ├── bugfix/         # Bugfix 类：diagnose, fix, verify
│   ├── quick/          # Quick 类：analyze, implement, verify
│   ├── backlog/        # Backlog 类：add, list, update, resolve, decide
│   ├── project/        # Project 类：load-state, save-state, decide-next-workflow
│   ├── evolution/      # 进化类：report-gap, prioritize, implement
│   └── governance/     # 治理类：multi-stance-review, stance-review
│
├── workflows/          # 工作流定义（17 个）
│   │
│   │  # 🚀 核心开发流程（5 个）
│   ├── wf-planning.yml       # 规划阶段（生成架构设计 + tasks.yml + feature_list.json）
│   ├── wf-dev.yml            # 开发阶段（自动判断 execute/iterate/batch 模式）
│   ├── wf-test.yml           # 测试流程（单元测试）
│   ├── wf-release.yml        # 发布流程
│   ├── wf-full.yml           # 完整流程（规划→约束→开发→验证→E2E→发布）
│   │
│   │  # ⚡ 轻量流程（3 个）
│   ├── wf-patch.yml          # L0 极简工作流（单文件修改）
│   ├── wf-bugfix.yml         # L1 Bug 修复
│   ├── wf-quick.yml          # L1 轻量工作流（快速原型）
│   │
│   │  # ✅ 验证（3 个）
│   ├── wf-validate.yml       # 项目验证（支持 workflow/project 两种模式）
│   ├── wf-test.yml           # 单元测试
│   ├── wf-e2e-test.yml       # E2E 测试（浏览器自动化）
│   │
│   │  # 📋 审查/治理（2 个）
│   ├── wf-review.yml         # 审核工作流（自动选择审核立场）
│   ├── wf-audit.yml          # 独立审计
│   │
│   │  # 🔧 系统（1 个）
│   ├── wf-evolution.yml      # 系统进化工作流
│   │
│   │  # 🧪 内部测试（4 个，不对用户展示）
│   ├── test-batch-iterator-simple.yml
│   ├── test-batch-iterator.yml
│   ├── test-execute-phases-mock.yml
│   └── test-split-batch.yml
│
├── docs/               # 文档
│   └── tasks-yml-spec.md  # tasks.yml 格式规范
│
└── registry/           # 能力注册表
```

---

## 架构说明

### v0.8 三层结构

```
Tools (底层能力) → Skills (能力单元，可被直接调用) → Workflows (流程编排)
```

**概念变迁**：
- v0.7-：`steps/` 目录存放可复用执行单元（顶层）
- v0.8+：`skills/` 目录存放可调用能力单元，工作流内部执行单元仍叫 `step`

| 层级 | 执行方式 | AI 介入 | 复用性 |
|------|---------|---------|--------|
| **Tools** | 纯脚本 | ❌ 无 | 高 |
| **Steps** | 调用 Agent | ✅ 有 | 高 |
| **Workflows** | 组合 Steps | ✅ 有 | 中 |
| **Skills** | 触发 Workflow | ❌ 无 | 低 |

---

## 核心设计：任务驱动开发

### 统一的开发模式

所有开发工作流都基于 **tasks.yml** 任务清单：

```
┌─────────────────────────────────────────────────────────────────┐
│                     wf-planning (规划阶段)                       │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────────────┐    │
│  │ 需求分析 │ → │ 架构设计 │ → │ API 设计 │ → │ 生成         │    │
│  │         │   │         │   │         │   │ tasks.yml    │    │
│  └─────────┘   └─────────┘   └─────────┘   │ feature_list │    │
│                                             └──────────────┘    │
│                                              ↓                  │
│                                        validate-tasks           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   wf-dev (开发阶段)                              │
│                                                                 │
│  自动模式选择：                                                  │
│  - 有 tasks.yml → execute 模式（直接执行）                       │
│  - 无 tasks.yml + 有需求 → iterate 模式（分析+生成增量任务）      │
│  - 任务数 > 10 → batch 模式（分批执行+独立 review）              │
│                                                                 │
│  ┌─────────────┐   ┌──────────────────────────────────────┐    │
│  │ validate    │ → │ 动态执行 develop-task                 │    │
│  │ tasks.yml   │   │ (含 per-task review 循环)             │    │
│  └─────────────┘   └──────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Per-Task Review 循环

每个任务执行时都有 review 循环保证质量：

```
implement → review → [fix → re-review] × 3 → commit / fail
```

| 阶段 | 说明 |
|------|------|
| implement | 实现功能，不提交 |
| review | 审核是否符合 spec |
| fix | 修复问题（最多 3 轮） |
| commit | 审核通过后提交 |
| fail | 3 轮后仍不通过，报告失败 |

---

## 工作流层级体系

### 按复杂度分级

| 层级 | 工作流 | 步骤 | 验证 | 规划 | 测试 | 适用场景 |
|------|--------|------|------|------|------|----------|
| **L0** | wf-patch | 2 | ❌ | ❌ | ❌ | 配置、文案修改，无验证 |
| **L1** | wf-bugfix | 4 | ✅ | ❌ | 相关功能 | Bug 修复，轻量验证 |
| **L1** | wf-quick | 4 | ✅ | ❌ | 轻量 | 小功能、原型开发 |
| **L2** | wf-dev | 35 | ✅ | ✅ | ✅ | 迭代功能开发 |
| **L3** | wf-full | 30 | ✅ | ✅ | ✅ | 新项目、大功能 |

### 使用场景说明

每个工作流都有 `usageScenario` 字段说明适用场景：

```yaml
usageScenario: |
  🎯 **适合场景**：
  - 新项目从零开始
  - 大型功能开发
  
  ⚠️ **不适合**：
  - 单文件修改 → 用 wf-patch
  - Bug 修复 → 用 wf-bugfix
  
  📝 **后续步骤**：
  - 完成后可运行 wf-test 验证
```

### 智能决策流程

系统根据项目状态自动推荐工作流：

```
decide-next-workflow:
  1. tasks.yml 未完成 → wf-dev
  2. 有待处理 Bug → wf-bugfix
  3. 有新功能需求 → wf-dev (iterate 模式)
  4. 有配置修改 → wf-patch
  5. 默认 → ask_user
```

### 工作流关系

```
/wf-planning <需求>                    → 架构设计 + tasks.yml + feature_list.json
/wf-dev <项目路径>                     → execute 模式（有 tasks.yml）
/wf-dev <项目路径> <新需求>            → iterate 模式（生成增量任务）
/wf-dev <项目路径> --mode batch        → batch 模式（分批执行）
/wf-full <需求>                        → 规划 → 约束 → 开发 → 验证 → E2E → 发布
```

---

## 新增功能（2026-04-06）

### wf-dev 自动模式选择

wf-dev 会根据输入自动判断执行模式：

```
输入判断：
├─ 有 tasks.yml → execute 模式（直接执行任务清单）
├─ 无 tasks.yml + 有 requirement → iterate 模式（分析+生成增量任务）
└─ 任务数 > batch_threshold → batch 模式（分批执行，每批独立 review）
```

**用法示例：**

```bash
# EXECUTE 模式（有 tasks.yml）
/wf-dev /root/projects/my-app

# ITERATE 模式（无 tasks.yml + 需求）
/wf-dev /root/projects/my-app "添加用户登录功能"

# BATCH 模式（手动指定）
/wf-dev /root/projects/big-project --mode batch
```

### wf-review 自动立场选择

wf-review 会根据审核对象自动选择立场：

```
文件类型判断：
├─ architecture.md → 架构审核（architect + security + performance + critic + decider）
├─ *.ts/*.js → 代码审核（reviewer + critic + decider）
├─ proposal.md → 方案审核（supporter + critic + decider）
└─ 其他 → 通用审核（critic + supporter + decider）
```

**用法示例：**

```bash
# 自动识别为架构审核
/wf-review architecture.md

# 自动识别为代码审核
/wf-review src/login.ts

# 自动识别为方案审核
/wf-review proposal.md
```

### wf-validate 双模式支持

wf-validate 支持两种验证模式：

```bash
# workflow 模式（验证工作流项目自身）
/wf-validate . --type workflow

# project 模式（验证用户项目）
/wf-validate /root/projects/my-app
```

---

## Long-Running Agents 约束

wf-dev 和 wf-full 支持 Long-Running Agents 约束：

```bash
# 启用约束检查 + E2E 测试
/wf-dev /root/projects/my-app \
  --enable_constraints \
  --enable_e2e \
  --test_url http://localhost:3000 \
  --constraint_level iron_law
```

### 约束列表

| 约束 | 说明 | 级别 |
|------|------|------|
| `incremental_progress_required` | 单功能推进，禁止 one-shotting | iron_law |
| `no_feature_without_decomposition` | 功能拆解，必须先拆分为可验证子任务 | guideline |
| `no_feature_completion_without_e2e_test` | E2E 验证，功能完成需要端到端测试 | guideline |

---

## Anthropic 模式扩展

wf-planning 支持输出 Anthropic 格式：

```bash
# 传统格式（tasks.yml）
/wf-planning '开发一个博客系统'

# Anthropic 格式（feature_list.json + progress.json + init.sh）
/wf-planning '开发一个博客系统' --output_format feature_list

# 双格式输出
/wf-planning '开发一个博客系统' --output_format both
```

### 输出文件

| 文件 | 说明 |
|------|------|
| `feature_list.json` | 功能清单（含 passes 字段） |
| `progress.json` | 跨 session 进度追踪 |
| `init.sh` | 项目启动脚本 |

---

## tasks.yml 规范

### 必需字段

```yaml
project:
  name: string           # 项目名称
  path: string           # 项目路径
  tech_stack: object     # 技术栈
  type: string           # frontend | backend | fullstack

tasks:
  - id: string           # 任务 ID（唯一）
    name: string         # 任务名称
    type: string         # feature | bugfix | refactor
    priority: number     # 优先级 0-3
    description: string  # 任务描述
    files: []            # 涉及的文件
    dependencies: []     # 依赖的任务 ID
    spec: string         # 实现规格
    test_required: bool  # 是否需要测试
    acceptance: []       # 验收标准

execution_plan:
  - phase: string        # 阶段名称
    parallel: bool       # 是否并行
    tasks: []            # 任务 ID 列表
```

详细规范见 [docs/tasks-yml-spec.md](docs/tasks-yml-spec.md)

---

## 变量传递

| 格式 | 示例 | 说明 |
|------|------|------|
| `${steps.xxx.output}` | `${steps.analyze-requirements.output}` | 步骤整体输出 |
| `${steps.xxx.outputs.field}` | `${steps.design.outputs.tech_stack}` | 步骤输出字段 |
| `{{inputs.xxx}}` | `{{inputs.requirement}}` | 工作流输入 |

---

## Skills 自动生成

Skills 从 Workflows 自动生成，无需手动维护：

```bash
npm run generate-skills
```

Workflow 只需增加 `openclaw` 元数据：

```yaml
id: wf-dev
name: 开发工作流
openclaw:
  userInvocable: true
  emoji: "🚀"
  keywords: [开发, 任务, 执行, 迭代, tasks.yml]
```

---

## License

MIT发, 任务, 执行, 迭代, tasks.yml]
```

---

## License

MIT