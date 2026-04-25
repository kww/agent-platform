# @dommaker/runtime

> AI Agent 工作流执行引擎 - npm 包 + CLI

## 安装

```bash
# npm
npm install @dommaker/runtime

# 或直接使用
npx @dommaker/runtime --version
```

## CLI 使用

```bash
# 查看版本
agent-runtime --version

# 列出能力
agent-runtime list workflows     # 列出工作流
agent-runtime list tools         # 列出工具
agent-runtime list steps         # 列出步骤

# 执行工作流（多种参数格式）
agent-runtime run wf-dev --project ~/myapp
agent-runtime run wf-dev --input project_path=~/myapp
agent-runtime run wf-dev --input '{"project_path": "~/myapp"}'
agent-runtime run wf-dev -p ~/myapp -r "实现登录"

# 执行单个步骤
agent-runtime step analyze-codebase -p ~/myapp

# 查询执行状态
agent-runtime status <executionId>

# 验证工作流
agent-runtime validate wf-dev

# 调试参数（不执行）
agent-runtime run wf-dev --project ~/myapp --dry-run

# 启动 HTTP API Server
agent-runtime server --port 3001
```

## 环境变量配置

```bash
# 工作流路径（默认使用 npm 包）
AGENT_WORKFLOWS_PATH=/path/to/workflows

# API 配置
CODING_API_KEY=xxx              # Codex API Key
ANTHROPIC_API_KEY=xxx           # Claude API Key

# 执行配置
DEFAULT_TIMEOUT=1800000         # 默认超时（30分钟）
MAX_RETRIES=3                   # 最大重试次数
MAX_CONCURRENT=5                # 最大并发数

# 服务配置
AGENT_STUDIO_URL=http://localhost:13101
PROMETHEUS_URL=http://localhost:9090
```

## 核心 API

```typescript
import {
  executeWorkflow,
  listWorkflows,
  listTools,
  listSteps,
  validateWorkflow,
  getWorkflowStatus
} from '@dommaker/runtime';

// 执行工作流
const result = await executeWorkflow('wf-dev', {
  project_path: '~/myapp',
  requirement: '实现登录功能'
});

console.log(result.executionId);
console.log(result.outputs);

// 列出工作流
const workflows = await listWorkflows();
// [{id: 'wf-dev', name: '开发工作流', ...}]

// 查询状态
const status = await getWorkflowStatus('exec-xxx');
```

## HTTP API

```bash
# 启动服务器
agent-runtime server --port 3001
```

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/workflows` | 列出工作流 |
| `GET /api/tools` | 列出工具 |
| `POST /api/execute` | 执行工作流 |
| `GET /api/executions/:id` | 获取执行状态 |
| `POST /api/executions/:id/stop` | 停止执行 |

## 特性

- ✅ Phase 划分执行
- ✅ Session 上下文传递
- ✅ 变量解析 `${steps.xxx.output}`
- ✅ 断点续传
- ✅ 实时进度追踪
- ✅ 多 Agent 支持（Codex, Claude Code）
- ✅ Token 使用追踪
- ✅ 智能通知（Discord/Webhook/企业微信/Telegram）

## License

MIT