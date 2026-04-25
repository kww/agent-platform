# Agent Platform

> Monorepo for AI Agent workflow execution - @dommaker/runtime + @dommaker/workflows

## Packages

| 包 | 版本 | 说明 | CLI |
|------|:----:|------|:---:|
| **@dommaker/runtime** | 0.0.4 | 工作流执行引擎 | `agent-runtime` |
| **@dommaker/workflows** | 0.0.5 | 工作流定义（数据包）| `workflows` |

## 安装

```bash
# runtime（执行引擎）
npm install @dommaker/runtime

# workflows（工作流定义）
npm install @dommaker/workflows

# 或者直接使用 CLI
npx @dommaker/runtime --version
npx @dommaker/workflows --version
```

## CLI 使用

### runtime CLI

```bash
# 查看版本
agent-runtime --version

# 列出能力
agent-runtime list workflows
agent-runtime list tools
agent-runtime list steps

# 执行工作流
agent-runtime run wf-dev --project ~/myapp
agent-runtime run wf-dev --input project_path=~/myapp --input requirement="实现登录"

# 查询执行状态
agent-runtime status <executionId>

# 验证工作流
agent-runtime validate wf-dev

# 启动 HTTP API
agent-runtime server --port 3001
```

### workflows CLI

```bash
# 查看版本
workflows --version

# 统计信息
workflows stats

# 列出能力
workflows list workflows
workflows list tools
workflows list contexts

# 验证 YAML
workflows validate
workflows validate --dir workflows
```

## 目录结构

```
packages/
├── runtime/          # @dommaker/runtime - 执行引擎
│   ├── src/
│   │   ├── core/       # 核心引擎：executor, parser, registry
│   │   ├── orchestration/  # 编排层：task-queue, role-manager
│   │   ├── monitoring/  # 监控：performance, quality-scorer
│   │   └── utils/      # 工具：config, logger
│   ├── dist/          # 编译产物
│   └── package.json
│
└── workflows/        # @dommaker/workflows - 工作流定义
    ├── workflows/      # 29 个工作流定义
    ├── tools/          # 113 个工具定义
    │   ├── core/       # 核心工具：file, git, npm, docker
    │   ├── std/        # 业务工具：analysis, design, development...
    │   └── ext/        # 外部集成：browser
    ├── contexts/       # 5 个上下文模板
    ├── templates/      # 3 个项目模板
    ├── registry/       # 能力注册表
    ├── bin/            # CLI
    └── package.json
```

## 能力统计

| 类型 | 数量 | 说明 |
|------|:----:|------|
| Workflows | 29 | 完整工作流定义 |
| Tools | 113 | 原子工具能力 |
| Contexts | 5 | 上下文模板 |
| Templates | 3 | 项目模板 |

## 开发

```bash
# 安装依赖
pnpm install

# 构建 runtime
pnpm --filter @dommaker/runtime build

# 发布
cd packages/workflows && npm publish --access public
cd packages/runtime && npm publish --access public
```

## License

MIT

---

*更新时间：2026-04-25*