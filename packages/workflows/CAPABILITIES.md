# agent-workflows 功能清单

> 最后更新: 2026-04-30 by titi
> 铁律：代码变更必须同步更新此文件

## 统计概览

| 类型 | 数量 | 说明 |
|------|:----:|------|
| 工具 | 113 | core(22) + std(87) + ext(4) |
| 工作流 | 20 | 16 用户可见 + 4 内部测试 |
| Context 模板 | 若干 | frameworks/languages/templates |

---

## 工具库 (tools/)

### core - 核心工具 (22 个)

| 分类 | 数量 | 工具 |
|------|:----:|------|
| **code** | 3 | fingerprint, register-language, code-ops |
| **docker** | 2 | build, run |
| **file** | 3 | create, delete, move |
| **git** | 6 | commit, push, pull, branch, merge, rebase |
| **notification** | 1 | notify (Discord/Slack/企微/Telegram) |
| **npm** | 3 | install, build, test |
| **validation** | 4 | yaml-syntax, handlers, readme-stats, reuse-check |

### std - 标准工具 (87 个)

| 分类 | 数量 | 功能 |
|------|:----:|------|
| **governance** | 16 | 审计、合规、权限、双签审批等 |
| **analysis** | 12 | 代码库分析、依赖分析、性能分析等 |
| **development** | 10 | 功能实现、测试编写、重构等 |
| **quality** | 7 | Lint、测试、覆盖率、质量检查等 |
| **backlog** | 7 | 需求管理、优先级排序、GitHub 同步等 |
| **planning** | 6 | 冲刺规划、工作量估算等 |
| **constraint** | 4 | 约束检查、规则验证等 |
| **deploy** | 4 | 服务部署、回滚、环境管理等 |
| **design** | 5 | API 设计、架构设计、数据库设计等 |
| **project** | 3 | 项目初始化、配置等 |
| **bugfix** | 3 | Bug 诊断、修复、验证 |
| **evolution** | 3 | 代码演进、数据迁移、依赖升级 |
| **quick** | 3 | 快速修复、快速评审、快速测试 |
| **verification** | 2 | 完成度核验、条件等待 |
| **file** | 1 | 文件操作增强 |
| **patch** | 1 | 应用补丁 |

### ext - 扩展工具 (4 个)

| 分类 | 数量 | 工具 |
|------|:----:|------|
| **browser** | 4 | automate, start, close, mcp-debug |

---

## 工作流定义 (workflows/)

### 🚀 核心开发流程 (6 个)

| 工作流 | 用途 |
|--------|------|
| wf-planning | 规划阶段（生成架构设计 + tasks.yml + feature_list.json） |
| wf-dev | 开发阶段（自动判断 execute/iterate/batch 模式） |
| wf-constraint | 约束检查流程 |
| wf-continue | 继续未完成任务 |
| wf-test | 单元测试 |
| wf-release | 发布流程 |

### ⚡ 轻量流程 (3 个)

| 工作流 | 用途 |
|--------|------|
| wf-patch | L0 极简工作流（单文件修改） |
| wf-bugfix | L1 Bug 修复 |
| wf-quick | L1 轻量工作流（快速原型） |

### ✅ 验证 (3 个)

| 工作流 | 用途 |
|--------|------|
| wf-validate | 项目验证（支持 workflow/project 两种模式） |
| wf-e2e-test | E2E 测试（浏览器自动化） |
| wf-perf | 性能测试 |

### 📋 审查/治理 (2 个)

| 工作流 | 用途 |
|--------|------|
| wf-review | 审核工作流（自动选择审核立场） |
| wf-audit | 独立审计 |

### 🔧 系统 (2 个)

| 工作流 | 用途 |
|--------|------|
| wf-full | 完整流程（规划→约束→开发→验证→E2E→发布） |
| wf-evolution | 系统进化工作流 |

### 🧪 内部测试 (4 个，不对用户展示)

| 工作流 | 用途 |
|--------|------|
| test-batch-iterator-simple | 测试批次迭代功能 |
| test-batch-iterator | 测试完整批次迭代 |
| test-execute-phases-mock | 测试分批开发流程 |
| test-split-batch | 测试任务分批功能 |

---

## Context 模板 (contexts/)

| 分类 | 说明 |
|------|------|
| **frameworks/** | 框架模板（React/Vue/Next.js 等） |
| **languages/** | 语言模板（TypeScript/Python/Go 等） |
| **templates/** | 通用项目模板 |

---

## Workflow Agent 共享配置 (Phase 6)

### 配置示例

```yaml
wf-backend:
  agent: codex              # Workflow 级别 Agent
  agentMode: shared          # 共享模式：shared | separate
  agentConfig:
    passHistory: true        # 是否传递对话历史
    historyStrategy: hybrid  # 历史策略：full | summary | hybrid
    recentCount: 2           # hybrid 模式保留最近轮次
    maxHistoryTokens: 50000  # 最大历史 Token

  steps:
    - id: analyze
      prompt: "分析 API 需求..."
      # 使用 workflow.agent（共享）

    - id: develop
      prompt: "实现 API 路由..."
      agentOverride: claude   # 步骤级覆盖（不共享）
      checkpoint:
        verify: "file:src/api/*.ts"
        on_fail: "abort"
```

### Agent 优先级链

```
step.agentOverride > workflow.agent > workflow.defaultAgent > config.defaultAgent > codex
```

### 历史策略说明

| 策略 | 说明 | 适用场景 |
|------|------|---------|
| **full** | 完整历史（不压缩）| L3/L4 变更（需要完整上下文）|
| **summary** | 摘要历史（提取关键数据）| L1/L2 变更（低风险）|
| **hybrid** | 混合策略（前序摘要 + 最近完整）| 默认推荐 |

---

## 变更日志

| 日期 | 变更内容 | 更新者 |
|------|---------|--------|
| 2026-04-30 | 修复乱码，更新准确统计（113 tools, 20 workflows）| titi |
| 2026-04-22 | 新增 Phase 6 Agent 共享配置文档 | titi |
| 2026-04-14 | 新增 review-spec-approval step（双签审批） | titi |
| 2026-04-12 | 新增 4 个工具：fingerprint/register-language/define-stance/aggregate-opinions | titi |
| 2026-04-12 | browser-automate 改用 agent-browser-stealth 底层 | titi |
| 2026-04-12 | 新增 Skill 路由、创建、分发功能（v0.8） | titi |
| 2026-04-06 | AW-041：工作流精简（23→17），自动模式选择，约束检查，E2E 测试 | titi |
| 2026-04-04 | 初始创建 | titi |
