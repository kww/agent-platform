# @dommaker/workflows

> AI Agent 工作流定义仓库 - Tools, Workflows, Contexts

## 安装

```bash
npm install @dommaker/workflows

# 或直接使用 CLI
npx @dommaker/workflows --version
```

## CLI 使用

```bash
# 查看版本
workflows --version

# 统计信息
workflows stats

# 列出能力
workflows list workflows
workflows list tools
workflows list contexts
workflows list templates

# 验证 YAML 文件
workflows validate
workflows validate --dir workflows
workflows validate my-workflow.yml
```

## 能力统计

| 类型 | 数量 | 说明 |
|------|:----:|------|
| **Workflows** | 20 | 16 用户可见 + 4 内部测试 |
| **Tools** | 113 | core(22) + std(87) + ext(4) |
| **Contexts** | 5 | frameworks/languages/templates |

## 目录结构

```
workflows/
├── workflows/          # 工作流定义（20 个）
│   ├── wf-dev.yml        # 开发工作流（智能模式）
│   ├── wf-planning.yml   # 规划流程
│   ├── wf-constraint.yml # 约束检查
│   ├── wf-continue.yml   # 继续未完成任务
│   ├── wf-bugfix.yml     # Bug 修复
│   ├── wf-release.yml    # 发布流程
│   └── ...               # 其他工作流
│
├── tools/              # 工具定义（113 个）
│   ├── core/             # 核心工具（22 个）
│   │   ├── file/           # 文件操作（3）
│   │   ├── git/            # Git 操作（6）
│   │   ├── npm/            # NPM 操作（3）
│   │   ├── docker/         # Docker 操作（2）
│   │   ├── code/           # 代码操作（3）
│   │   ├── notification/   # 通知（1）
│   │   └── validation/     # 验证（4）
│   │
│   ├── std/              # 业务工具（87 个）
│   │   ├── governance/     # 治理类（16）
│   │   ├── analysis/       # 分析类（12）
│   │   ├── development/    # 开发类（10）
│   │   ├── quality/        # 质量类（7）
│   │   ├── backlog/        # 需求类（7）
│   │   ├── planning/       # 规划类（6）
│   │   ├── constraint/     # 约束类（4）
│   │   ├── deploy/         # 部署类（4）
│   │   ├── design/         # 设计类（5）
│   │   ├── project/        # 项目类（3）
│   │   ├── bugfix/         # Bugfix（3）
│   │   ├── evolution/      # 进化类（3）
│   │   ├── quick/          # 快速类（3）
│   │   ├── verification/   # 验证类（2）
│   │   ├── file/           # 文件增强（1）
│   │   └── patch/          # 补丁类（1）
│   │
│   └── ext/              # 外部集成（4 个）
│       └── browser/        # 浏览器自动化
│
├── contexts/           # 上下文模板
│   ├── frameworks/       # 框架模板（React/Vue/Next.js）
│   ├── languages/        # 语言模板（TypeScript/Python/Go）
│   └── templates/        # 项目模板
│
├── registry/           # 能力注册表
│   └── index.json
│
└── bin/                # CLI
    └── workflows-cli.js
```

## 核心工作流

### 🚀 开发流程

| 工作流 | 用途 |
|--------|------|
| `wf-dev` | 开发工作流（自动判断 execute/iterate/batch 模式）|
| `wf-planning` | 规划阶段（架构设计 + tasks.yml）|
| `wf-constraint` | 约束检查流程 |
| `wf-continue` | 继续未完成任务 |
| `wf-test` | 单元测试 |
| `wf-release` | 发布流程 |

### ⚡ 轻量流程

| 工作流 | 用途 |
|--------|------|
| `wf-patch` | L0 极简工作流（单文件修改）|
| `wf-bugfix` | L1 Bug 修复 |
| `wf-quick` | L1 轻量工作流（快速原型）|

### ✅ 验证流程

| 工作流 | 用途 |
|--------|------|
| `wf-validate` | 项目验证 |
| `wf-e2e-test` | E2E 测试（浏览器自动化）|
| `wf-perf` | 性能测试 |

### 📋 治理流程

| 工作流 | 用途 |
|--------|------|
| `wf-review` | 审核工作流（自动选择审核立场）|
| `wf-audit` | 独立审计 |
| `wf-full` | 完整流程（规划→约束→开发→验证→E2E→发布）|
| `wf-evolution` | 系统进化工作流 |

## 在 runtime 中使用

```typescript
import { executeWorkflow } from '@dommaker/runtime';

// 自动使用 npm 包中的 workflows
await executeWorkflow('wf-dev', {
  project_path: '~/myapp'
});
```

## 自定义 workflows 路径

```bash
# 使用本地 workflows
export AGENT_WORKFLOWS_PATH=/path/to/my-workflows
```

## License

MIT