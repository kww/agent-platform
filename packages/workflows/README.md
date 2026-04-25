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
| **Workflows** | 29 | 完整工作流定义 |
| **Tools** | 113 | 原子工具能力 |
| **Contexts** | 5 | 上下文模板 |
| **Templates** | 3 | 项目模板 |

## 目录结构

```
workflows/
├── workflows/          # 工作流定义（29 个）
│   ├── wf-dev.yml        # 开发工作流
│   ├── wf-planning.yml   # 规划流程
│   ├── wf-bugfix.yml     # Bug 修复
│   ├── wf-release.yml    # 发布流程
│   └── ...               # 其他工作流
│
├── tools/              # 工具定义（113 个）
│   ├── core/             # 核心工具（18 个）
│   │   ├── file/           # 文件操作
│   │   ├── git/            # Git 操作
│   │   ├── npm/            # NPM 操作
│   │   ├── docker/         # Docker 操作
│   │   ├── code/           # 代码操作
│   │   └── notification/   # 通知
│   │
│   ├── std/              # 业务工具（93 个）
│   │   ├── analysis/       # 分析类
│   │   ├── design/         # 设计类
│   │   ├── development/    # 开发类
│   │   ├── planning/       # 规划类
│   │   ├── quality/        # 质量类
│   │   ├── deploy/         # 部署类
│   │   ├── bugfix/         # Bugfix 类
│   │   ├── governance/     # 治理类
│   │   ├── evolution/      # 进化类
│   │   └── ...             # 其他
│   │
│   └── ext/              # 外部集成（2 个）
│       └── browser/        # 浏览器自动化
│
├── contexts/           # 上下文模板（5 个）
│   ├── frameworks/       # 框架上下文
│   └── languages/        # 语言上下文
│
├── templates/          # 项目模板（3 个）
│   ├── ci-template.yml
│   ├── iterate.yml
│   └── new-project.yml
│
├── registry/           # 能力注册表
│   └── index.json
│
└── bin/                # CLI
    └── workflows-cli.js
```

## 核心工作流

| 工作流 | 说明 |
|------|------|
| `wf-dev` | 开发工作流（智能模式判断）|
| `wf-planning` | 规划流程（架构 + tasks.yml）|
| `wf-bugfix` | Bug 修复流程 |
| `wf-quick` | 快速原型流程 |
| `wf-release` | 发布流程 |
| `wf-validate` | 项目验证 |
| `wf-review` | 审核工作流 |
| `wf-full` | 完整开发流程 |
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