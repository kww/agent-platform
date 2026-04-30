# agent-runtime 功能清单

> 最后更新: 2026-04-30 by titi
> 铁律：代码变更必须同步更新此文件

## 核心模块 (src/core/)

### 执行引擎

| 模块 | 文件 | 功能 |
|------|------|------|
| 执行器 | executor.ts | 工作流执行引擎 + 角色执行器 |
| 状态管理 | state.ts | 执行状态记录 |
| 事件系统 | events.ts | 事件发布订阅 |
| 索引构建 | index-builder.ts | 执行索引构建 |
| 能力注册 | registry.ts | 步骤/工具注册 |
| 调度器 | scheduler.ts | 执行调度、并发控制 |
| 并行执行 | parallel-executor.ts | 并行步骤执行 |
| 缓存层 | cache.ts | TTL/LRU 缓存 |
| 错误处理 | error-handler.ts | 重试策略、降级机制 |
| 输出管理 | output-manager.ts | 输出收集、格式化 |

### 责任链系统 🆕

| 模块 | 文件 | 功能 |
|------|------|------|
| **责任链模型** | **responsibility-chain.ts** | **Stage → Role → Tools → Constraint 映射规则** |
| **阶段定义** | **stage-definitions.ts** | **6 阶段关键词 + 推荐函数** |

**阶段定义**：

| 阶段 | 关键词 | 责任角色 |
|------|--------|---------|
| plan | 需求、规划、设计、架构、分析 | architect, pm |
| develop | 开发、实现、编码、重构 | developer, tech-lead |
| verify | 测试、验证、审查、审计 | qa, tech-lead |
| deploy | 部署、发布、上线、运维 | tech-lead, ceo |
| fix | 修复、bug、问题、错误 | developer, qa |
| govern | 治理、合规、审计、审批 | architect, pm, ceo |

**变更类型 → 约束级别映射**：

| 变更类型 | 默认级别 | 说明 |
|---------|:--------:|------|
| database | L3 | 数据库变更高风险 |
| api-breaking | L3 | 破坏性 API 变更 |
| core-module | L3 | 核心模块改动 |
| api-non-breaking | L2 | 非破坏性 API 变更 |
| feature | L2 | 新功能开发 |
| bugfix | L1 | Bug 修复 |
| refactor | L1 | 代码重构 |
| docs | L1 | 文档变更 |
| test | L1 | 测试变更 |
| config | L1 | 配置变更 |

### 追踪系统

| 模块 | 文件 | 功能 |
|------|------|------|
| Token 追踪 | token-tracker.ts | 多模型 Token 统计 |
| 项目 Token | project-token-tracker.ts | 项目级 Token 累计 |
| 进度追踪 | progress-tracker.ts | 执行状态追踪 |
| 进度解析 | progress-parser.ts | Agent 输出进度提取 |
| 根因分析 | root-cause-analyzer.ts | 失败归因分析 |

### 角色系统

| 模块 | 文件 | 功能 |
|------|------|------|
| 立场系统 | stances.ts | 九种角色立场 |
| 立场处理器 | stance-handlers.ts | 立场 prompt 注入和审核 |
| 角色系统 | roles.ts | 拟人化能力组合 |
| **角色管理器** | **role-manager.ts** | **角色 CRUD、状态管理、能力分配** |
| **级别管理器** | **level-manager.ts** | **级别检查、晋升评估、降级处理** |
| 性格系统 | personality.ts | Big Five 性格模型 |

### Spec 系统

| 模块 | 文件 | 功能 |
|------|------|------|
| Spec Schema | specs/schemas/*.ts | 架构/模块/API Schema 定义 |
| Spec 验证器 | specs/validator.ts | 统一 Spec 校验入口 |
| **Spec 审查** | **spec-review.ts** | **双签制审查（架构师+项目负责人）** |

### 处理器

| 模块 | 文件 | 功能 |
|------|------|------|
| 内置处理器 | builtin-handlers.ts | 非Agent数据处理 |
| 输出处理 | output-processor.ts | 智能输出分类 |
| 历史压缩 | history-compressor.ts | 滑动窗口压缩 |
| **关键数据提取** | **key-data-extractor.ts** | **Agent 输出结构化提取** |

### MCP & 命令

| 模块 | 文件 | 功能 |
|------|------|------|
| MCP Client | mcp-client.ts | MCP 协议客户端 |
| 命令处理 | commands.ts | !do/!init/!status 等命令 |
| 复杂度分析 | complexity-analyzer.ts | 需求复杂度判断（规则+LLM） |
| Agent 回退 | agent-fallback.ts | 主备 Agent 切换 |

### Phase 6 模块

| 模块 | 文件 | 功能 |
|------|------|------|
| Messages Builder | messages-prompt-builder.ts | messages 传递 + Token 控制（分层压缩）|
| Baseline Validator | baseline-validator.ts | baselineDecision 检查 + 风险评估 |
| Risk Assessor | risk-assessor.ts | RiskScore 计算 + L1-L4 映射 |

### YAML 解析

| 模块 | 文件 | 功能 |
|------|------|------|
| YAML 解析 | parser.ts | 工作流 YAML 解析 |

### 通知服务

| 模块 | 文件 | 功能 |
|------|------|------|
| 通知服务 | notification-service.ts | 多渠道通知推送 |

---

## 编排层模块 (src/orchestration/)

### 上下文管理

| 模块 | 文件 | 功能 |
|------|------|------|
| **上下文共享** | **context-sharer.ts** | **跨角色上下文传递、渐进式披露** |
| **上下文桥接** | **context-bridge.ts** | **会议室→Skill Agent 上下文传递** |

### 编排器

| 模块 | 文件 | 功能 |
|------|------|------|
| 编排器 | orchestrator.ts | 多角色编排、会议集成 |
| **角色调度器** | **role-scheduler.ts** | **角色执行调度、会议上下文阶段** |

### 会议系统

| 模块 | 文件 | 功能 |
|------|------|------|
| **会议核心** | **meeting-core.ts** | **会议室逻辑、事件处理** |
| **会议存储** | **meeting-store.ts** | **会议持久化接口、约束级别** |
| **会议订阅** | **meeting-subscriber.ts** | **WebSocket 实时订阅** |
| **状态机** | **meeting-state-machine.ts** | **8 状态转换 + 乐观锁** |
| **状态监听器** | **state-listener.ts** | **桥接/通知/审计监听器** |

### Phase 6 编排

| 模块 | 文件 | 功能 |
|------|------|------|
| TaskQueue | task-queue.ts | Redis 队列管理 + 并发控制 |
| TaskWorker | task-worker.ts | Task 消费 + 并发检查 |
| TaskOutput | task-output.ts | 跨 Task 上下文存储 |
| WorkflowBlocker | workflow-blocker.ts | Workflow 阻塞/恢复/终止 |

### 讨论与拆分

| 模块 | 文件 | 功能 |
|------|------|------|
| DiscussionDriver | discussion-driver.ts | 自动化角色讨论循环 |
| TaskSplitter | task-splitter.ts | 决策 → tasks.yml |

### 治理层

| 模块 | 文件 | 功能 |
|------|------|------|
| GateChecker | gate-checker.ts | 6 种门禁检查 + 三层配置 |
| AuditChain | audit-chain.ts | 链式审计 + HMAC 签名 |
| EconomyAdapter | economy-adapter.ts | 任务结算 + 月度工资 |

### 错误处理

| 模块 | 文件 | 功能 |
|------|------|------|
| FailureHandler | failure-handler.ts | 分级错误处理（重试/升级/开会）|
| PerformanceMonitor | performance-monitor.ts | 操作耗时 + Token 统计 |

---

## 工具模块 (src/utils/)

| 模块 | 文件 | 功能 |
|------|------|------|
| **配置管理** | **config.ts** | **环境变量 + 文件配置** |
| **LLM 客户端** | **llm-client.ts** | **OpenAI 兼容 API 封装** |
| Discord 工具 | discord.ts | Discord Webhook 集成 |
| 日志工具 | logger.ts | 统一日志输出 |
| **重试机制** | **retry.ts** | **指数退避重试** |
| **Slugify** | **slugify.ts** | **URL 友好名称生成** |

### LLM 客户端功能

| 功能 | 方法 | 说明 |
|------|------|------|
| 单轮对话 | `chat(prompt)` | 简单问答 |
| 多轮对话 | `chatWithHistory(messages)` | 上下文保持 |
| 配置来源 | 环境变量 > 参数 | 自动降级 |

**环境变量**：
- `LLM_API_KEY` - API Key
- `LLM_BASE_URL` - API 端点（默认 OpenAI）
- `LLM_MODEL` - 模型名称（默认 gpt-3.5-turbo）
- `LLM_TIMEOUT` - 超时（默认 60s）

### 重试机制

| 策略 | 说明 | 默认值 |
|------|------|:------:|
| 固定退避 | 每次间隔相同 | 1000ms |
| 指数退避 | 间隔指数增长 | 1000ms → 60000ms |

**参数**：
- `maxAttempts` - 最大重试次数
- `backoff` - 退避策略
- `initialDelay` - 初始延迟
- `maxDelay` - 最大延迟

---

## 中间件 (src/middleware/)

| 模块 | 文件 | 功能 |
|------|------|------|
| **认证中间件** | **auth.ts** | **JWT Token / API Key 验证** |

### 认证中间件功能

| 函数 | 说明 |
|------|------|
| `verifyToken()` | JWT Token 验证 |
| `requireAuth()` | 要求认证（Token 或 API Key）|
| `requireNotGuest()` | 要求非访客用户 |
| `optionalAuth()` | 可选认证 |

---

## 执行器 (src/executors/)

| 执行器 | 文件 | 功能 |
|--------|------|------|
| Evolution | evolution.ts | 演进迭代执行 |
| Governance | governance.ts | 治理审核执行 |
| Spawn | spawn.ts | 子任务派发 |
| Tool | tool.ts | 工具调用执行 |
| Understand | understand.ts | 意图理解执行 |

---

## 拦截器 (src/core/enforcement-executors.ts)

已实现 17 个 Enforcement 执行器：

| enforcement | 说明 |
|-------------|------|
| verify-completion | 验证完成声明 |
| verify-e2e | 验证 E2E 测试 |
| debug-systematic | 系统性调试 |
| reuse-first | 复用优先检查 |
| update-capabilities | 功能清单同步 |
| tdd-cycle | TDD 循环 |
| passes-gate | 测试门控 |
| checkpoint-required | 检查点验证 |
| check-coverage | 覆盖率检查 |
| require-discussion | 设计决策讨论 |

---

## 监控模块 (src/monitoring/)

| 模块 | 文件 | 功能 |
|------|------|------|
| 指标监听器 | metrics-listener.ts | 事件转 Prometheus 指标 |
| 本地数据源 | local-data-source.ts | 复用内存指标数据 |
| Golden Master | golden-master.ts | 录制/验证工作流输出快照 |
| 性能回归 | performance-regression.ts | 录制/对比性能基准 |
| 质量评分 | quality-scorer.ts | 综合质量评分 |

### Prometheus 指标类型

| 类型 | 指标数 | 示例 |
|------|:------:|------|
| 工作流 | 5 | `workflow_duration_seconds` |
| 步骤 | 6 | `step_duration_seconds` |
| Token | 3 | `token_usage_total` |
| 工具 | 2 | `tool_duration_seconds` |
| Agent | 2 | `agent_timeout_total` |
| 铁律 | 1 | `iron_law_violations_total` |
| 系统 | 15+ | `process_resident_memory_bytes` |

---

## 类型定义 (src/types/)

| 类型 | 文件 | 说明 |
|------|------|------|
| 文档类型 | document.ts | 文档结构定义 |
| 治理类型 | governance.ts | 治理相关类型 |
| 角色类型 | role.ts | 角色定义类型 |
| 立场类型 | stance.ts | 立场定义类型 |

---

## HTTP API (server.ts)

### 执行管理

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/api/executions` | GET | 列出历史执行（**分页**） |
| `/api/executions/:id` | GET | 获取执行详情 |
| `/api/executions/:id/stop` | POST | 停止执行 |
| `/api/executions/:id/pause` | POST | 暂停执行 |
| `/api/executions/:id/resume` | POST | 恢复执行 |
| `/api/executions/:id/retry` | POST | 重试执行 |
| `/api/executions/:id/steps/:stepId/retry` | POST | 重试单步骤 |
| `/api/execute` | POST | 启动执行 |
| `/api/status/:id` | GET | 查询执行状态 |

### 项目/Workflow 管理

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/api/workflows` | GET | 列出所有工作流 |
| `/api/workflows/:id` | GET | 获取工作流详情 |
| `/api/skills` | GET | 列出原子步骤 |
| `/api/tools` | GET | 列出所有工具 |
| `/api/projects/:id` | DELETE | 删除项目（需认证）|

### 配置管理

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/api/config` | GET | 获取配置 |
| `/api/config` | POST | 更新配置 |

### 监控

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/health` | GET | 健康检查 |
| `/metrics` | GET | Prometheus 指标 |
| `/api/steps/stats` | GET | 步骤成功率统计 |

### MCP

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/api/v1/mcp/servers` | GET | 列出 MCP Servers |
| `/api/v1/mcp/servers` | POST | 注册 MCP Server |
| `/api/v1/mcp/servers/:id` | DELETE | 注销 MCP Server |
| `/api/v1/mcp/tools` | GET | 列出 MCP 工具 |
| `/api/v1/mcp/call` | POST | 调用 MCP 工具 |

### 复杂度分析

| 接口 | 方法 | 功能 |
|------|:----:|------|
| `/api/v1/complexity/analyze` | POST | 分析需求复杂度 |

---

## 约束级别

| 级别 | 名称 | 说明 | 审批要求 |
|:----:|------|------|---------|
| L1 | 快速执行 | 无风险改动 | 无需审批 |
| L2 | 标准流程 | 常规任务 | 单签 |
| L3 | 严格验证 | 高风险/核心模块 | 双签 |
| L4 | 最高约束 | 架构变更 | 开会讨论 + 双签 |

---

## 渐进式披露（4 阶段）

| 阶段 | 内容 | Token 预算 |
|:----:|------|:----------:|
| 1 | meta（元数据） | ~200 |
| 2 | + decisions（决策） | ~700 |
| 3 | + summary（摘要） | ~2700 |
| 4 | + messages（消息） | 不限 |

---

## 会议室状态转换

| 状态 | 可转换到 | 触发器 |
|------|---------|--------|
| pending | discussing | user_starts_meeting |
| discussing | designing | requirements_confirmed |
| designing | task_splitting | design_confirmed |
| task_splitting | executing | tasks_assigned |
| executing | testing | implementation_done |
| testing | reviewing / executing | tests_passed / tests_failed |
| reviewing | completed / executing | review_passed / changes_requested |

---

## 外置模块（@dommaker/harness）

| 模块 | harness 路径 | 功能 |
|------|-------------|------|
| IronLawChecker | `src/core/iron-laws/checker.ts` | 铁律检查 |
| IRON_LAWS | `src/core/iron-laws/definitions.ts` | 铁律定义 |
| CheckpointValidator | `src/core/validators/checkpoint.ts` | 检查点验证 |
| PassesGate | `src/core/validators/passes-gate.ts` | 测试门控 |
| SessionStartup | `src/core/session/startup.ts` | 启动检查 |
| CleanStateManager | `src/core/session/clean-state.ts` | 清理管理 |
| ErrorClassifier | `src/core/error/classifier.ts` | 错误分类 |
| FailureRecorder | `src/core/error/recorder.ts` | 失败记录 |
| PerformanceCollector | `src/core/performance/collector.ts` | 性能采集 |
| PerformanceAnalyzer | `src/core/performance/analyzer.ts` | 性能分析 |

---

## 变更日志

| 日期 | 变更内容 | 更新者 |
|------|---------|--------|
| 2026-04-30 | 补齐缺失功能：责任链、阶段定义、LLM客户端、重试机制、slugify | titi |
| 2026-04-22 | Skills 层废弃清理：删除 5 个文件 + 12 个 API 端点 | titi |
| 2026-04-22 | Phase 6 模块：TaskQueue/Worker/Output/Blocker + Messages Builder | titi |
| 2026-04-17 | FailureHandler/PerformanceMonitor 重构为 harness 适配器 | titi |
| 2026-04-16 | Phase 4 编排模块：AuditChain、EconomyAdapter | titi |
| 2026-04-16 | Phase 1 GateChecker：6 种门禁 + 三层配置 | titi |
| 2026-04-16 | Phase 3 编排模块：SkillLibrary/MCPPool/SpecConstraint | titi |
| 2026-04-16 | Phase 2 编排模块：DiscussionDriver、TaskSplitter | titi |
| 2026-04-16 | Phase 0 编排模块：ContextBridge/StateMachine/Handler | titi |
| 2026-04-14 | 编排层模块、约束级别、渐进式披露 | titi |
| 2026-04-12 | Skill/MCP/复杂度/分发模块和 API（v0.8） | titi |
| 2026-04-10 | 拦截器模块、拦截器 API（v0.7） | titi |
| 2026-04-09 | HTTP API 部分，历史记录分页 (AR-011) | titi |
| 2026-04-05 | 监控模块（Prometheus 指标） | titi |
| 2026-04-04 | 初始创建 | titi |
