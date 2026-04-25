# agent-runtime 常见问题 FAQ

> 版本：1.0.0
> 最后更新：2026-04-09

---

## 🔧 配置与安装

### Q1: 如何安装 agent-runtime？

**A**: 两种方式：

```bash
# 全局安装（CLI 使用）
npm install -g agent-runtime

# 作为项目依赖（npm 包使用）
npm install agent-runtime
```

---

### Q2: 需要配置哪些环境变量？

**A**: 核心配置：

```bash
# 工作流定义路径（必须）
export AGENT_SKILLS_PATH=/path/to/agent-workflows

# Agent API Key（至少配置一个）
export CODING_API_KEY=xxx        # Codex API Key
export ANTHROPIC_API_KEY=xxx     # Claude API Key
```

---

### Q3: workdir 和 project_path 有什么区别？

**A**:

| 路径 | 用途 | 示例 |
|------|------|------|
| `workdir` | 执行记录存放目录 | `/root/projects/outputs/wf-xxx/` |
| `project_path` | 项目代码所在目录 | `/tmp/my-project` |

**设计原则**：
- 执行记录（`.agent-runtime/state.json`）存放在 `workdir`
- 代码操作（文件读写、测试、Git）在 `project_path` 进行
- **分离设计**：支持在任意位置的项目上运行工作流

---

## 🚀 CLI 使用

### Q4: 如何列出所有工作流/步骤/工具？

**A**:

```bash
# 列出工作流
agent-runtime list workflows

# 列出步骤
agent-runtime list steps

# 列出工具
agent-runtime list tools
```

---

### Q5: 如何执行工作流？

**A**:

```bash
# 基础执行
agent-runtime run wf-continue --input "project_path=/tmp/my-project"

# 带参数执行
agent-runtime run wf-dev --input "project_path=/tmp/my-project&feature_id=F-001"

# 启动 API 服务
agent-runtime server -p 3002
```

---

### Q6: 如何查询执行状态？

**A**:

```bash
# 查询单个执行
agent-runtime status <executionId>

# 通过 API
curl http://localhost:3002/api/executions/<executionId>
```

---

## 🔄 断点续传

### Q7: 执行中断了如何恢复？

**A**: agent-runtime 自动保存执行状态：

```bash
# 查看执行状态
agent-runtime status <executionId>

# 如果状态为 interrupted，可直接恢复
agent-runtime resume <executionId>

# 或使用 wf-continue 工作流
agent-runtime run wf-continue --input "project_path=/tmp/my-project"
```

**自动保存点**：
- 每个步骤完成后
- Phase 切换时
- 检查点验证后

---

### Q8: state.json 文件在哪？

**A**: 存放在 `workdir/.agent-runtime/` 目录：

```
/root/projects/outputs/wf-xxx/
└── .agent-runtime/
    ├── state.json          # 执行状态
    ├── history.json        # 执行历史
    └── checkpoints.json    # 检查点
```

---

## ⚡ 性能与优化

### Q9: 步骤执行太慢怎么办？

**A**: 检查以下几点：

1. **并行执行**：无依赖步骤自动并行
2. **缓存机制**：重复步骤不重执行
3. **历史压缩**：长对话自动压缩

```bash
# 检查缓存命中率
agent-runtime status <executionId> | grep cache

# 调整缓存 TTL
export CACHE_TTL=300000  # 5 分钟
```

---

### Q10: Token 使用过多怎么办？

**A**:

1. **历史压缩**：自动启用 `history-compressor.ts`
2. **输出清理**：`output-manager.ts` 自动清理中间文件
3. **调整 Level**：`level-manager.ts` 动态调整上下文层级

---

## 🐛 常见错误

### Q11: 找不到工作流定义怎么办？

**A**: 检查路径配置：

```bash
# 确认环境变量
echo $AGENT_SKILLS_PATH

# 应指向 agent-workflows 目录
export AGENT_SKILLS_PATH=/root/projects/agent-workflows
```

---

### Q12: Agent 调用失败怎么办？

**A**: 检查 API Key：

```bash
# 确认配置
echo $CODING_API_KEY
echo $ANTHROPIC_API_KEY

# 测试连接
agent-runtime test-agent codex
agent-runtime test-agent claude
```

**常见原因**：
- API Key 未配置或过期
- 网络连接问题
- Agent 服务限流

---

### Q13: 步骤超时怎么办？

**A**: 调整超时配置：

```yaml
# steps/xxx.yml
timeout: 600000  # 10 分钟（默认 5 分钟）
```

或环境变量：

```bash
export STEP_TIMEOUT=600000
export WORKFLOW_TIMEOUT=3600000  # 1 小时
```

---

## 📡 通知与监控

### Q14: 如何配置 Discord 通知？

**A**: 配置环境变量：

```bash
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx
export DISCORD_CHANNEL_ID=123456789
```

通知类型：
- 执行开始/完成
- 步骤失败
- 超时预警
- Token 阈值提醒

---

### Q15: 如何查看实时进度？

**A**: 三种方式：

1. **CLI**：`agent-runtime status <executionId>`
2. **API**：`GET /api/executions/<executionId>`
3. **WebSocket**：实时推送事件

```typescript
// WebSocket 事件
ws.on('execution.status', (event) => {
  console.log(event.progress);  // 进度百分比
  console.log(event.eta);       // 预估剩余时间
});
```

---

## 🔗 相关链接

| 文档 | 路径 |
|------|------|
| agent-runtime 架构 | `docs/architecture.md` |
| agent-runtime README | `README.md` |
| 知识库整合 FAQ | `~/knowledge-base/docs/FAQ.md` |

---

*FAQ 维护：agent-runtime 项目*