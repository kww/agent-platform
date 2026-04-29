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

# LLM 配置（用于 DiscussionDriver、MeetingCore 等模块）
LLM_API_KEY=sk-xxx             # LLM API Key（必填）
LLM_BASE_URL=https://api.deepseek.com/v1  # API 端点（可选，默认 OpenAI）
LLM_MODEL=deepseek-chat        # 模型名称（可选，默认 gpt-3.5-turbo）

# Agent API 配置
CODING_API_KEY=xxx              # Codex API Key
ANTHROPIC_API_KEY=xxx           # Claude API Key

# 认证配置（SEC-004）
JWT_SECRET=your-jwt-secret      # 与 studio 共享，验证同一套 token
RUNTIME_API_KEY=your-api-key    # 独立使用时的 API Key

# 执行配置
DEFAULT_TIMEOUT=1800000         # 默认超时（30分钟）
MAX_RETRIES=3                   # 最大重试次数
MAX_CONCURRENT=5                # 最大并发数

# 服务配置
AGENT_STUDIO_URL=http://localhost:13101
PROMETHEUS_URL=http://localhost:9090
```

## 🔒 隐私说明

**我们不会持久存储您的 API Key：**

- LLM API Key 仅存在于环境变量或 Redis 内存中
- Redis 存储设置 24 小时过期，不存数据库
- 不会记录到日志文件
- 进程重启后需重新配置

**配置方式：**

| 用户类型 | 配置方式 |
|---------|---------|
| **Agent Studio 用户** | Settings 页面配置，保存到 Redis 内存（24h 过期）|
| **Runtime CLI 用户** | 环境变量 `LLM_API_KEY` 等 |

## 核心 API

```typescript
import {
  executeWorkflow,
  listWorkflows,
  listTools,
  listSteps,
  validateWorkflow,
  getWorkflowStatus,
  createLLMClient,
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

## LLM 客户端

runtime 内置 LLM 客户端，支持 OpenAI 兼容 API：

```typescript
import { createLLMClient } from '@dommaker/runtime';

// 方式 1：环境变量配置（推荐）
// LLM_API_KEY=sk-xxx LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat
const client = createLLMClient(); // 自动读取环境变量

// 方式 2：直接配置
const client = createLLMClient({
  apiKey: 'sk-xxx',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
});

// 使用
const response = await client.chat('你好，请介绍一下自己');

// 多轮对话
const response = await client.chatWithHistory([
  { role: 'system', content: '你是一个有帮助的助手' },
  { role: 'user', content: '你好' },
  { role: 'assistant', content: '你好！有什么我可以帮助你的吗？' },
  { role: 'user', content: '请介绍一下自己' },
]);
```

支持的平台：OpenAI、DeepSeek、腾讯混元、阿里通义千问、智谱 GLM 等 OpenAI 兼容 API。

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
| `DELETE /api/executions/:id` | 删除执行（需认证）|
| `DELETE /api/projects/:id` | 删除项目（需认证）|
| `DELETE /api/v1/mcp/servers/:id` | 删除 MCP Server（需认证）|

## 🔒 认证说明（SEC-004）

删除 API 需要认证，支持两种方式：

### 1. JWT Token（studio 场景）

与 studio 共享 `JWT_SECRET`，前端登录后自动携带 token。

### 2. API Key（独立场景）

```bash
# 设置环境变量
RUNTIME_API_KEY=your-secret-key

# CLI 调用
curl -H "X-API-Key: $RUNTIME_API_KEY" http://localhost:3001/api/executions/123

# 或 query 参数
curl "http://localhost:3001/api/executions/123?apiKey=$RUNTIME_API_KEY"
```

**认证优先级**：JWT Token > API Key

**未认证返回**：`401 Unauthorized`

## 特性

- ✅ Phase 划分执行
- ✅ Session 上下文传递
- ✅ 变量解析 `${steps.xxx.output}`
- ✅ 断点续传
- ✅ 实时进度追踪
- ✅ 多 Agent 支持（Codex, Claude Code）
- ✅ Token 使用追踪
- ✅ 智能通知（Discord/Webhook/企业微信/Telegram）
- ✅ **删除 API 权限保护（SEC-004）**

## License

MIT