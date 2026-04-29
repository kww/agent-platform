# agent-runtime 功能清单

> 最后更新: 2026-04-22 by titi
> 铁律：代码变更必须同步更新此文件

## 核心模块 (src/core/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| 执行器 | executor.ts | 工作流执行引擎 + 角色执行器 | ✅ | 2026-04-14 |
| **铁律系统** | **@dommaker/harness** | **强制规则检查（外置）** | ✅ | 2026-04-10 |
| **拦截器** | **enforcement-executors.ts** | **Enforcement 执行器实现** | ✅ | 2026-04-10 |
| 立场系统 | stances.ts | 九种角色立场 | ✅ | 2026-04-03 |
| 立场处理器 | stance-handlers.ts | 立场 prompt 注入和审核 | ✅ | 2026-04-03 |
| 角色系统 | roles.ts | 拟人化能力组合 | ✅ | 2026-04-03 |
| **角色管理器** | **role-manager.ts** | **角色 CRUD、状态管理、能力分配** | ✅ | 2026-04-03 |
| **级别管理器** | **level-manager.ts** | **级别检查、晋升评估、降级处理** | ✅ | 2026-04-03 |
| **约束级别** | **types.ts** | **ConstraintLevel (L1-L4)** | ✅ | 2026-04-14 |
| Token 追踪 | token-tracker.ts | 多模型 Token 统计 | ✅ | 2026-04-02 |
| 项目 Token | project-token-tracker.ts | 项目级 Token 累计 | ✅ | 2026-04-02 |
| 进度追踪 | progress-tracker.ts | 执行状态追踪 | ✅ | 2026-04-02 |
| 进度解析 | progress-parser.ts | Agent 输出进度提取 | ✅ | 2026-04-02 |
| 通知服务 | notification-service.ts | 多渠道通知推送 | ✅ | 2026-04-03 |
| 历史压缩 | history-compressor.ts | 滑动窗口压缩 | ✅ | 2026-04-05 |
| **关键数据提取** | **key-data-extractor.ts** | **Agent 输出结构化提取** | ✅ | 2026-04-05 |
| 索引构建 | index-builder.ts | 执行索引构建 | ✅ | 2026-04-02 |
| **检查点验证** | **@dommaker/harness** | **步骤结果验证（外置）** | ✅ | 2026-04-04 |
| CSO 验证 | cso-validator.ts | 技能描述验证 | ✅ | 2026-03-29 |
| 根因分析 | root-cause-analyzer.ts | 失败归因分析 | ✅ | 2026-04-03 |
| 输出处理 | output-processor.ts | 智能输出分类 | ✅ | 2026-04-02 |
| YAML 解析 | parser.ts | 工作流 YAML 解析 | ✅ | 2026-04-04 |
| 能力注册 | registry.ts | 步骤/工具注册 | ✅ | 2026-04-04 |
| 事件系统 | events.ts | 事件发布订阅 | ✅ | 2026-03-29 |
| 上下文加载 | context.ts | 语言/框架上下文 | ✅ | 2026-03-30 |
| Agent 回退 | agent-fallback.ts | 主备 Agent 切换 | ✅ | 2026-04-02 |
| 内置处理器 | builtin-handlers.ts | 非Agent数据处理 | ✅ | 2026-04-04 |
| Meta Skills | meta-skills.ts | 自动技能检查 | ❌ 已废弃 | 2026-04-22 删除 |
| **测试门控** | **@dommaker/harness** | **禁止自评通过（外置）** | ✅ | 2026-04-04 |
| 性格系统 | personality.ts | Big Five 性格模型 | ✅ | 2026-04-03 |
| 状态管理 | state.ts | 执行状态记录 | ✅ | 2026-03-29 |
| **Session 启动** | **@dommaker/harness** | **启动检查点验证（外置）** | ✅ | 2026-04-04 |
| **Clean State** | **@dommaker/harness** | **Session 结束管理（外置）** | ✅ | 2026-04-04 |
| **Skill 类型** | **types.ts** | **Skill/Intent/Routing 类型定义** | ❌ 已废弃 | 2026-04-22 删除 |
| **Skill 路由** | **skill-router.ts** | **意图匹配 → Workflow 路由** | ❌ 已废弃 | 2026-04-22 删除 |
| **Skill 创建** | **skill-creator.ts** | **验证/保存/删除 Skill** | ❌ 已废弃 | 2026-04-22 删除 |
| **Skill 分发** | **skill-distribution.ts** | **Git 仓库导入 Skill** | ❌ 已废弃 | 2026-04-22 删除 |
| **复杂度分析** | **complexity-analyzer.ts** | **需求复杂度判断（规则+LLM）** | ✅ | 2026-04-12 |
| **MCP Client** | **mcp-client.ts** | **MCP 协议客户端** | ✅ | 2026-04-12 |
| **命令处理** | **commands.ts** | **!do/!init/!status 等命令** | ✅ | 2026-04-12 |
| **Spec Schema** | **specs/schemas/*.ts** | **架构/模块/API Schema 定义** | ✅ | 2026-04-12 |
| **Spec 验证器** | **specs/validator.ts** | **统一 Spec 校验入口** | ✅ | 2026-04-12 |
| **Spec 审查** | **spec-review.ts** | **双签制审查（架构师+项目负责人）** | ✅ | 2026-04-14 |
| 缓存层 | cache.ts | TTL/LRU 缓存 | ✅ | 2026-04-05 |
| 错误处理 | error-handler.ts | 重试策略、降级机制 | ✅ | 2026-04-05 |
| 调度器 | scheduler.ts | 执行调度、并发控制 | ✅ | 2026-04-05 |
| 并行执行 | parallel-executor.ts | 并行步骤执行 | ✅ | 2026-04-05 |
| 输出管理 | output-manager.ts | 输出收集、格式化 | ✅ | 2026-04-05 |
| **Phase 6: Messages Builder** | **messages-prompt-builder.ts** | **messages 传递 + Token 控制（分层压缩）** | ✅ | 2026-04-22 |
| **Phase 6: Baseline Validator** | **baseline-validator.ts** | **baselineDecision 检查 + 风险评估** | ✅ | 2026-04-22 |
| **Phase 6: Risk Assessor** | **risk-assessor.ts** | **RiskScore 计算 + L1-L4 映射** | ✅ | 2026-04-22 |

## 编排层模块 (src/orchestration/) 🆕

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **上下文共享** | **context-sharer.ts** | **跨角色上下文传递、渐进式披露** | ✅ | 2026-04-14 |
| **编排器** | **orchestrator.ts** | **多角色编排、会议集成** | ✅ | 2026-04-14 |
| **角色调度器** | **role-scheduler.ts** | **角色执行调度、会议上下文阶段** | ✅ | 2026-04-14 |
| **会议核心** | **meeting-core.ts** | **会议室逻辑、事件处理** | ✅ | 2026-04-13 |
| **会议存储** | **meeting-store.ts** | **会议持久化接口、约束级别** | ✅ | 2026-04-14 |
| **会议订阅** | **meeting-subscriber.ts** | **WebSocket 实时订阅** | ✅ | 2026-04-14 |
| **上下文桥接** | **context-bridge.ts** | **会议室→Skill Agent 上下文传递** | ✅ | 2026-04-16 |
| **状态机** | **meeting-state-machine.ts** | **8状态转换 + 乐观锁** | ✅ | 2026-04-16 |
| **状态监听器** | **state-listener.ts** | **桥接/通知/审计监听器** | ✅ | 2026-04-16 |
| **失败处理器** | **failure-handler.ts** | **分级错误处理（重试/升级/开会）** | ✅ | 2026-04-16 |
| **性能监控** | **performance-monitor.ts** | **操作耗时、Token使用、上下文大小** | ✅ | 2026-04-16 |
| **Skill 执行器** | **skill-executor.ts** | **统一 Skill Agent 执行接口** | ❌ 已废弃 | 2026-04-22 删除 |
| **Phase 6: TaskQueue** | **task-queue.ts** | **Redis 队列管理 + 并发控制（maxConcurrency）** | ✅ | 2026-04-22 |
| **Phase 6: TaskWorker** | **task-worker.ts** | **Task 消费 + 并发检查（perTypeConcurrency）** | ✅ | 2026-04-22 |
| **Phase 6: TaskOutput** | **task-output.ts** | **跨 Task 上下文存储 + 批量获取依赖输出** | ✅ | 2026-04-22 |
| **Phase 6: WorkflowBlocker** | **workflow-blocker.ts** | **Workflow 阻塞/恢复/终止（SpecReview 集成）** | ✅ | 2026-04-22 |

### ContextSharer 功能

| 功能 | 方法 | 说明 |
|------|------|------|
| 角色输出存储 | `setRoleOutput()` / `getRoleOutput()` | 存储角色执行结果 |
| 依赖读取 | `readDependencyOutput()` | 读取上游角色输出 |
| **会议元数据** | **`setMeetingMeta()` / `getMeetingMeta()`** | **会议基础信息** |
| **会议决策** | **`setMeetingDecisions()` / `getMeetingDecisions()`** | **会议决策列表** |
| **会议摘要** | **`setMeetingSummary()` / `getMeetingSummary()`** | **会议总结** |
| **会议消息** | **`setMeetingMessages()` / `getMeetingMessages()`** | **会议聊天记录** |
| **渐进式披露** | **`getMeetingContext(stage)`** | **按阶段加载会议上下文** |

### 渐进式披露（4 阶段）

| 阶段 | 内容 | Token 预算 | 使用场景 |
|:----:|------|:----------:|---------|
| **1** | meta（元数据） | ~200 | 快速预览 |
| **2** | + decisions（决策） | ~700 | 决策查看 |
| **3** | + summary（摘要） | ~2700 | 详细了解 |
| **4** | + messages（消息） | 不限 | 调试/审计 |

### 约束级别定义

| 级别 | 名称 | 说明 | 审批要求 |
|:----:|------|------|---------|
| **L1** | 快速执行 | 无风险改动 | 无需审批 |
| **L2** | 标准流程 | 常规任务 | 单签 |
| **L3** | 严格验证 | 高风险/核心模块 | 双签 |
| **L4** | 最高约束 | 架构变更 | 开会讨论 + 双签 |

### ContextBridge 功能（Phase 0）

| 功能 | 方法 | 说明 |
|------|------|------|
| 提取上下文 | `extract(meetingId, stage)` | 渐进式披露加载会议上下文 |
| 转换上下文 | `transform(rawContext, roleId, taskId)` | 共享上下文 → 角色上下文 |
| Token 裁剪 | `prune(roleContext, tokenBudget)` | 智能裁剪保持在预算内 |
| 执行 Skill | `invokeSkillAgent(skillId, context, roleId)` | 调用 Skill Agent |
| 结果回传 | `reportBack(meetingId, taskId, roleId, result)` | 执行结果写回共享池 |

### MeetingStateMachine 功能（Phase 0）

| 功能 | 方法 | 说明 |
|------|------|------|
| 初始化 | `initialize(meetingId)` | 创建初始状态（pending） |
| 状态转换 | `transition(meetingId, toState, request)` | 验证门禁 + 更新状态 |
| 获取状态 | `getState(meetingId)` | 读取当前状态记录 |
| 监听器 | `addListener(listener)` | 注册状态转换监听器 |

### 会议室状态转换

| 状态 | 可转换到 | 触发器 |
|------|---------|--------|
| pending | discussing | user_starts_meeting |
| discussing | designing | requirements_confirmed |
| designing | task_splitting | design_confirmed |
| task_splitting | executing | tasks_assigned |
| executing | testing | implementation_done |
| testing | reviewing / executing | tests_passed / tests_failed |
| reviewing | completed / executing | review_passed / changes_requested |

### DiscussionDriver 功能（Phase 2）

| 功能 | 方法 | 说明 |
|------|------|------|
| 运行讨论 | `runDiscussion(meetingId, topic)` | 自动化角色讨论循环 |
| 选择发言者 | `selectNextSpeaker(meetingId)` | 质疑者优先 → 话题相关 → 轮流 |
| 共识检查 | `checkConsensus(meetingId)` | LLM 判断是否达成一致 |
| 用户干预 | `needsUserIntervention(meetingId, consensus)` | 分歧≥3 或置信度<0.5 |

**发言策略优先级**：
1. 质疑者优先（stance_conflict）
2. 话题相关性（topic_relevance）
3. 未发言者优先
4. 轮流发言（round_robin）

**讨论终止条件**：
- ✅ 达成共识（confidence ≥ 0.8）
- ⚠️ 需要用户干预（分歧过多）
- ⏱️ 达到最大轮数
- ⏰ 超时

### TaskSplitter 功能（Phase 2）

| 功能 | 方法 | 说明 |
|------|------|------|
| 拆分任务 | `splitTasks(meetingId, decisions)` | 决策 → tasks.yml |
| 解析依赖 | `extractDependencies(tasks)` | 提取任务依赖关系 |
| 计算优先级 | `calculatePriorities(tasks, deps)` | 影响范围大的任务优先 |
| 检测警告 | `detectWarnings(tasks, deps)` | 循环依赖/孤立任务/估算过长 |

**任务结构**：
```typescript
interface Task {
  id: string;              // TASK-001
  name: string;            // 任务名称
  assignee: TaskAssignee;  // developer/architect/tester
  priority: 'P0'|'P1'|'P2'|'P3';
  files: string[];         // 涉及文件
  acceptance: string[];    // 验收条件
  dependsOn: string[];     // 依赖任务
  estimatedHours?: number; // 预估工时
}
```

**警告类型**：
- 🔄 循环依赖
- 🏝️ 孤立任务（无依赖关系）
- ⏰ 估算过长（>16h）
- ❓ 无验收条件

### CompanySkillLibrary 功能（Phase 3）❌ 已废弃

> **废弃原因**：角色无法编写 YAML 配置，简化为管理员分配 Workflow
> **替代方案**：capability-analyze.ts（利用现有 Prometheus 指标）
> **废弃时间**：2026-04-22

| 功能 | 方法 | 说明 |
|------|------|------|
| 创建技能 | `createSkill(companyId, skill)` | ❌ 已删除 |
| 解析技能 | `resolveSkill(companyId, key)` | ❌ 已删除 |
| 授予角色 | `grantSkillToRole(companyId, roleId, skillKey)` | ❌ 已删除 |
| 使用统计 | `getUsageStats(companyId, skillKey)` | ❌ 已删除 |

**继承机制**：❌ 已废弃

### CompanyMCPPool 功能（Phase 3）

| 功能 | 方法 | 说明 |
|------|------|------|
| 添加私有 MCP | `addPrivateMCP(companyId, mcp)` | 公司专属 MCP |
| 启用系统 MCP | `enableSystemMCP(companyId, key)` | 启用共享 MCP |
| 权限检查 | `hasPermission(companyId, roleId, mcpKey)` | 角色权限控制 |
| 使用统计 | `getUsageStats(companyId, mcpKey)` | 按工具统计 |

**权限控制**：
- 公司级：enabled/disabled
- 角色级：allowedRoles 数组

**敏感信息加密**：
```
API_KEY: "secret" → "enc:c2VjcmV0" (base64)
```

### SpecConstraintLayer 功能（Phase 3）

| 功能 | 方法 | 说明 |
|------|------|------|
| 创建 Spec | `createSpec(projectId, spec)` | 定义项目规范 |
| 验证 Spec | `validateSpec(spec)` | 完整性检查 |
| 分析变更级别 | `analyzeChangeLevel(change)` | L1-L4 分级 |
| 门禁检查 | `checkGate(projectId, change)` | 是否需要审批 |

**变更分级**：

| 级别 | 触发条件 | 审批要求 |
|:----:|---------|---------|
| L1 | 小改动（无敏感词） | 自动批准 |
| L2 | API 变更（非破坏性） | 单签 |
| L3 | 架构变更 / 破坏性 / 影响 >3 模块 | 双签 + 可能开会 |
| L4 | 紧急变更 | 立即执行 + 24h 内补审批 |

### GateChecker 功能（Phase 1）

| 功能 | 方法 | 说明 |
|------|------|------|
| 单门禁检查 | `checkGate(gate, context)` | 检查单个门禁 |
| 批量检查 | `checkAllGates(gates, context)` | 检查多个门禁并生成报告 |
| 获取有效配置 | `getEffectiveConfig(projectId, meetingId, taskId)` | 合并三层配置 |
| 保存结果 | `saveGateResult(meetingId, report)` | 持久化检查结果 |

**6 种门禁类型**：

| 门禁 | 检查内容 | 通过条件 |
|------|---------|---------|
| test | 单元测试 | 全部通过 |
| review | 代码审查 | 达到审批人数 |
| contract | API 契约 | 无破坏性变更 |
| spec | 设计规范 | 符合 Spec 定义 |
| security | 安全扫描 | 无高危漏洞 |
| performance | 性能指标 | 达到阈值要求 |

**三层配置结构**：
```
项目默认 → 会议室覆盖 → 任务定制
```

### AuditChain 功能（Phase 4）

| 功能 | 方法 | 说明 |
|------|------|------|
| 记录审计 | `record(action, data, signer)` | 添加链式审计条目 |
| 验证链 | `validateChain()` | 检查链完整性 |
| 查询审计 | `getEntriesByAction(action)` | 按操作类型查询 |
| 导出链 | `export()` | 导出 JSON |

**链式结构**：
```
genesis → entry1(hash) → entry2(hash) → ...
```

**安全机制**：
- SHA256 哈希计算
- HMAC 签名防篡改
- 链完整性验证

**审计操作类型**：
- 任务：task_created, task_transitioned, task_completed
- 会议：meeting_created, meeting_started, meeting_completed
- 门禁：gate_checked, gate_passed, gate_failed
- 经济：balance_changed, salary_paid

### EconomyAdapter 功能（Phase 4）

| 功能 | 方法 | 说明 |
|------|------|------|
| 任务结算 | `settleTaskCompletion(input)` | 计算成本 → 分配收入 |
| 月度工资 | `settleMonthlySalary(companyId)` | 发放角色工资 |
| 余额检查 | `checkBalance(companyId, amount)` | 检查是否足够 |
| 预支 | `requestAdvance(roleId, amount)` | 角色预支申请 |
| 还款 | `repayDebt(roleId, amount)` | 偿还欠款 |
| 充值 | `deposit(companyId, amount)` | 用户充值 |

**任务定价**：
| 类型 | 基础成本 | 角色分成 |
|------|:--------:|:--------:|
| Feature | 5000 | 60% |
| Bugfix | 2000 | 50% |
| Review | 1000 | 70% |
| Test | 1500 | 60% |
| Planning | 3000 | 70% |

**调整系数**：
- 质量评分：0.8x - 1.2x
- 用户满意度：+20% / -20%

### FailureHandler 功能（Phase 0）

| 功能 | 说明 |
|------|------|
| 错误分类 | 使用 harness ErrorClassifier（统一标准） |
| 失败记录 | 使用 harness FailureRecorder（文件存储） |
| 分级处理 | L1-L4 四级失败处理 |
| 自动重试 | L1 级别自动重试（可配置 maxRetries） |
| 升级处理 | L2-L4 级别升级处理 |
| 召集会议 | L3 级别创建会议讨论 |

**存储路径**：`.harness/logs/failures.log`

**实现依赖**：
- `@dommaker/harness` ErrorClassifier
- `@dommaker/harness` FailureRecorder
- `@dommaker/harness` ErrorType, FailureLevel

| 错误类型 | 处理方式 | 说明 |
|---------|---------|------|
| TEST_FAILED | 自动重试 | 最多 3 次 |
| GATE_FAILED | 升级处理 | 人工干预 |
| DEPENDENCY_BLOCKED | 开会讨论 | 创建新会议室 |
| CONTEXT_OVERFLOW | 强制压缩 | 重试 |
| TIMEOUT | 自动重试 | 最多 3 次 |
| SKILL_ERROR | 自动重试 | 最多 3 次 |

### PerformanceMonitor 功能（Phase 0）

| 功能 | 说明 |
|------|------|
| 操作耗时监控 | 使用 harness PerformanceCollector（文件存储） |
| 统计分析 | 使用 harness PerformanceAnalyzer |
| Token 使用统计 | 上下文 Token + 执行 Token |
| 上下文大小统计 | 条目数、总大小 |
| 性能报告生成 | 汇总统计、异常检测 |
| 超阈值告警 | 超过预设阈值时触发事件 |

**存储路径**：`.harness/logs/performance.log`

**实现依赖**：
- `@dommaker/harness` PerformanceCollector
- `@dommaker/harness` PerformanceAnalyzer

### Meeting 接口

```typescript
interface Meeting {
  id: string;
  projectId: string;
  title: string;
  status: 'pending' | 'active' | 'completed';
  participantRoles: string[];
  constraintLevel?: ConstraintLevel; // L1-L4
  // ... 其他字段
}

interface MeetingDecision {
  id: string;
  content: string;
  agreed: boolean;
  roles: string[];
  constraintLevel?: ConstraintLevel;
  createdAt: string;
}
```

## 拦截器执行器 (src/core/enforcement-executors.ts)

已实现 17 个 Enforcement 执行器：

| enforcement | 说明 | 实现方式 |
|-------------|------|---------|
| verify-completion | 验证完成声明 | 运行 npm test，解析测试结果 |
| verify-e2e | 验证 E2E 测试 | 运行 npm run test:e2e |
| debug-systematic | 系统性调试 | 检查根因调查记录 |
| reuse-first | 复用优先检查 | 检查复用搜索记录 |
| update-capabilities | 功能清单同步 | 检查 CAPABILITIES.md 更新日期 |
| tdd-cycle | TDD 循环 | 检查是否有测试 |
| passes-gate | 测试门控 | 必须有测试证据 |
| checkpoint-required | 检查点验证 | 检查 checkpoints.json |
| check-coverage | 覆盖率检查 | 运行 npm run test:coverage |
| require-discussion | 设计决策讨论 | 检查 design-decision.md |
| full-test-coverage | 完整测试覆盖 | 简化实现（总是通过） |
| type-safe | 类型安全检查 | 简化实现（总是通过） |
| check-local-first | 本地优先检查 | 简化实现（总是通过） |
| preserve-complexity | 保持复杂度 | 简化实现（总是通过） |
| skill-test-scenario | 技能测试场景 | 简化实现（总是通过） |
| create-readme | 创建 README | 简化实现（总是通过） |
| add-docs | 添加文档 | 简化实现（总是通过） |

**自动注册**：服务启动时自动注册所有执行器。

## 监控模块 (src/monitoring/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **指标监听器** | **metrics-listener.ts** | **事件转 Prometheus 指标** | ✅ | 2026-04-05 |
| **监控入口** | **index.ts** | **模块导出** | ✅ | 2026-04-05 |

### 监控指标类型

| 类型 | 指标数 | 示例 |
|------|:------:|------|
| 工作流 | 5 | `workflow_duration_seconds`, `workflow_started_total` |
| 步骤 | 6 | `step_duration_seconds`, `step_failed_total` |
| Token | 3 | `token_usage_total`, `token_cost_dollars` |
| 工具 | 2 | `tool_duration_seconds`, `tool_calls_total` |
| Agent | 2 | `agent_timeout_total`, `agent_warning_total` |
| 铁律 | 1 | `iron_law_violations_total` |
| 系统 | 15+ | `process_resident_memory_bytes`, `nodejs_eventloop_lag_seconds` |

### 端点

- `/metrics` - Prometheus 指标端点（端口 3002）

## Golden Master 测试 (src/monitoring/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **Golden Master 框架** | **golden-master.ts** | **录制/验证工作流输出快照** | ✅ | 2026-04-05 |

### Golden Master 功能

| 功能 | 说明 |
|------|------|
| 录制 | 执行工作流，保存输入/输出快照 |
| 验证 | 用相同输入执行，比对输出差异 |
| 结构相似度 | 分析文档结构（标题、代码块、列表） |
| 阈值检测 | 文件数变化、Token 变化、耗时变化 |

### 检查项

| 检查项 | 默认阈值 |
|--------|:--------:|
| 执行成功 | 必须一致 |
| 文件数量变化 | ≤3 |
| 结构相似度 | ≥85% |
| Token 变化 | ≤30% |
| 耗时变化 | ≤50% |

### 使用方式

```bash
npm run golden:list          # 列出所有 Golden Masters
npm run golden:record <id>   # 录制指定工作流
npm run golden:verify <id>   # 验证指定工作流
npm run golden:verify-all    # 验证所有工作流
```

## 性能回归检测 (src/monitoring/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **性能回归框架** | **performance-regression.ts** | **录制/对比性能基准** | ✅ | 2026-04-05 |

### 性能回归功能

| 功能 | 说明 |
|------|------|
| 基准录制 | 记录 P50/P90/P99 耗时、Token 消耗 |
| 回归检测 | 对比当前性能与基准，检测退化 |
| 阈值检测 | 耗时变化、Token 变化超过阈值报警 |
| CI 集成 | Push 到 master 自动检测 |

### 检查项

| 检查项 | 默认阈值 |
|--------|:--------:|
| P99 耗时变化 | ≤20% |
| P50 耗时变化 | ≤20% |
| Token 变化 | ≤20% |
| 成功率下降 | ≤5% |

### 使用方式

```bash
npm run bench:list          # 列出所有性能基准
npm run bench:record <id>   # 录制工作流性能
npm run bench:check <id>    # 检测工作流性能回归
npm run bench:check-all     # 检测所有工作流
```

### CI 触发

- Push 到 master 分支
- 每天 UTC 6:00（北京时间 14:00）
- 手动触发

## 质量评分系统 (src/monitoring/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **质量评分框架** | **quality-scorer.ts** | **综合质量评分** | ✅ | 2026-04-05 |

### 评分维度

| 维度 | 权重 | 说明 |
|------|:----:|------|
| 成功率 | 40% | 成功次数 / 总次数 |
| 效率得分 | 25% | 基准耗时 / 实际耗时 |
| Token 效率 | 20% | 有效输出 / Token 消耗 |
| 输出质量 | 15% | 结构完整度 + 内容相关度 |

### 评分等级

| 等级 | 分数范围 |
|:----:|:--------:|
| A | ≥ 90 |
| B | ≥ 80 |
| C | ≥ 70 |
| D | < 70 |

### 使用方式

```bash
npm run quality:score <id>   # 计算单个工作流评分
npm run quality:all          # 计算所有工作流评分
npm run quality:list         # 列出所有评分
npm run quality:report <id>  # 生成质量报告
```

### 复用模块

| 功能 | 来源 |
|------|------|
| Prometheus 查询 | performance-regression.ts |
| 结构分析 | golden-master.ts |
| 百分位计算 | performance-regression.ts |
| **本地数据源** | **local-data-source.ts** ✅ |

## 本地数据源 (src/monitoring/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **本地数据适配器** | **local-data-source.ts** | **复用内存中的指标数据** | ✅ | 2026-04-05 |

### 功能

| 功能 | 说明 |
|------|------|
| 本地指标访问 | 直接访问 Prometheus 注册表（内存） |
| 无需 HTTP | 避免 HTTP 请求，更快 |
| 离线支持 | 无 Prometheus 服务时也能工作 |

### 数据来源

| 数据 | 来源模块 |
|------|---------|
| 耗时 | metrics-listener.ts（内存注册表） |
| Token | metrics-listener.ts（内存注册表） |
| 步骤状态 | metrics-listener.ts（内存注册表） |
| 成功率 | metrics-listener.ts（内存注册表） |

## 外置模块说明

以下模块已迁移至 `@dommaker/harness` npm 包：

| 模块 | harness 路径 | 迁移原因 |
|------|-------------|---------|
| IronLawChecker | `src/core/iron-laws/checker.ts` | 通用约束 |
| IRON_LAWS | `src/core/iron-laws/definitions.ts` | 通用铁律 |
| CheckpointValidator | `src/core/validators/checkpoint.ts` | 通用验证 |
| PassesGate | `src/core/validators/passes-gate.ts` | 通用门控 |
| SessionStartup | `src/core/session/startup.ts` | 通用启动 |
| CleanStateManager | `src/core/session/clean-state.ts` | 通用清理 |

**导入方式**：
```typescript
import {
  IronLawChecker,
  IRON_LAWS,
  CheckpointValidator,
  PassesGate,
  SessionStartup,
  CleanStateManager,
} from '@dommaker/harness';
```

## 中间件模块 (src/middleware/)

| 模块 | 文件 | 功能 | 状态 | 最后修改 |
|------|------|------|:----:|---------|
| **认证中间件** | **auth.ts** | **JWT Token / API Key 验证** | ✅ | 2026-04-29 |

### 认证中间件功能

| 函数 | 说明 |
|------|------|
| `verifyToken()` | JWT Token 验证（与 studio 共享逻辑）|
| `requireAuth()` | 要求认证（Token 或 API Key）|
| `requireNotGuest()` | 要求非访客用户 |
| `optionalAuth()` | 可选认证 |

### 认证方式

| 方式 | 适用场景 | Header |
|------|---------|--------|
| JWT Token | studio 前端 | `Authorization: Bearer <token>` |
| API Key | CLI/脚本 | `X-API-Key: <key>` 或 `?apiKey=<key>` |

---

## 执行器 (src/executors/)

| 执行器 | 文件 | 功能 | 状态 |
|--------|------|------|:----:|
| Evolution | evolution.ts | 演进迭代执行 | ✅ |
| Governance | governance.ts | 治理审核执行 | ✅ |
| Spawn | spawn.ts | 子任务派发 | ✅ |
| Tool | tool.ts | 工具调用执行 | ✅ |
| Understand | understand.ts | 意图理解执行 | ✅ |

## 类型定义 (src/types/)

| 类型 | 文件 | 说明 |
|------|------|------|
| 文档类型 | document.ts | 文档结构定义 |
| 治理类型 | governance.ts | 治理相关类型 |
| 角色类型 | role.ts | 角色定义类型 |
| 立场类型 | stance.ts | 立场定义类型 |

## HTTP API (server.ts)

### 执行管理 API

| 接口 | 方法 | 功能 | 状态 |
|------|------|------|:----:|
| `/api/executions` | GET | 列出执行历史（**支持分页**） | ✅ |
| `/api/executions/:id` | GET | 获取执行详情 | ✅ |
| `/api/executions/:id/stop` | POST | 停止执行 | ✅ |
| `/api/executions/:id/pause` | POST | 暂停执行 | ✅ |
| `/api/executions/:id/resume` | POST | 恢复执行 | ✅ |
| `/api/executions/:id/retry` | POST | 重试执行 | ✅ |
| `/api/execute` | POST | 启动执行 | ✅ |
| `/api/status/:id` | GET | 查询执行状态 | ✅ |

### 分页参数 (AR-011)

`GET /api/executions` 支持分页：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|:------:|------|
| `page` | number | 1 | 页码（从 1 开始） |
| `limit` | number | 20 | 每页数量 |

**响应格式**：
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 工作流/步骤/工具 API

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/workflows` | GET | 列出所有工作流 |
| `/api/workflows/:id` | GET | 获取工作流详情 |
| `/api/steps` | GET | 列出所有步骤 |
| `/api/tools` | GET | 列出所有工具 |

### 配置 API

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/config` | GET | 获取配置 |
| `/api/config` | POST | 更新配置 |

### 监控 API

| 接口 | 方法 | 功能 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/metrics` | GET | Prometheus 指标 |

### 拦截器 API (v0.7+)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/v1/iron-laws/intercept` | POST | 拦截操作（返回详细结果） |
| `/api/v1/iron-laws/claim` | POST | 声明操作（失败返回 403） |
| `/api/v1/iron-laws/executors/register` | POST | 注册自定义执行器 |
| `/api/v1/iron-laws/executors` | GET | 获取已注册执行器列表 |

### Skill API (v0.8+) ❌ 已废弃

> **废弃时间**：2026-04-22
> **废弃端点**：12 个 API 已删除

| 接口 | 方法 | 功能 | 状态 |
|------|------|------|:----:|
| `/api/v1/skills` | GET | 列出所有 Skill | ❌ |
| `/api/v1/skills/:id` | GET | 获取 Skill 详情 | ❌ |
| `/api/v1/skills/route` | POST | 意图路由决策 | ❌ |
| `/api/v1/skills/match` | POST | 意图匹配 | ❌ |
| `/api/v1/skills/workflows` | GET | 列出可用工作流 | ❌ |
| `/api/v1/skills/list` | GET | 列出现有 Skills | ❌ |

### 复杂度分析 API (v0.8+)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/v1/complexity/analyze` | POST | 分析需求复杂度 |

**请求示例**：
```json
{
  "input": "怎么实现一个推荐系统",
  "useLLM": false
}
```

**响应示例**：
```json
{
  "success": true,
  "analysis": {
    "level": "complex",
    "confidence": 0.89,
    "suggestion": "brainstorm",
    "questions": ["这是一个新功能还是对现有功能的改进？"]
  }
}
```

### MCP API (v0.8+)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/v1/mcp/servers` | GET | 列出 MCP Servers |
| `/api/v1/mcp/servers` | POST | 注册 MCP Server |
| `/api/v1/mcp/servers/:id` | DELETE | 注销 MCP Server |
| `/api/v1/mcp/tools` | GET | 列出 MCP 工具 |
| `/api/v1/mcp/call` | POST | 调用 MCP 工具 |

### Skill 分发 API (v0.8+) ❌ 已废弃

> **废弃时间**：2026-04-22
> **废弃端点**：7 个 API 已删除

| 接口 | 方法 | 功能 | 状态 |
|------|------|------|:----:|
| `/api/v1/skill-repositories` | GET | 列出 Skill 仓库 | ❌ |
| `/api/v1/skill-repositories` | POST | 添加 Skill 仓库 | ❌ |
| `/api/v1/skill-repositories/:id` | DELETE | 删除 Skill 仓库 | ❌ |
| `/api/v1/skill-repositories/:id/sync` | POST | 同步仓库 | ❌ |
| `/api/v1/skill-repositories/sync-all` | POST | 同步所有仓库 | ❌ |
| `/api/v1/skill-repositories/:id/skills` | GET | 列出远程 Skills | ❌ |
| `/api/v1/skill-repositories/:id/import` | POST | 导入 Skill | ❌ |
| `/api/v1/meta-skills/check` | POST | 检查相关技能 | ❌ |

### 命令 API (v0.8+)

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/v1/commands` | POST | 处理自定义命令 |

**支持的命令**：
| 命令 | 功能 |
|------|------|
| `!do <需求>` | 智能执行（匹配 Skill） |
| `!init <skill-id>` | 初始化 Skill |
| `!status [id]` | 查看执行状态 |
| `!create-skill <描述>` | AI 辅助创建 Skill |
| `!list-skills` | 列出所有 Skill |
| `!list-workflows` | 列出所有 Workflow |
| `!delete-skill <id>` | 删除 Skill |

## CLI & Server

| 模块 | 文件 | 功能 |
|------|------|------|
| CLI | cli.ts | 命令行入口 |
| Server | server.ts | HTTP/WebSocket 服务 |
| 启动脚本 | start-server.ts | 服务启动入口 |

---

## 变更日志

| 日期 | 变更内容 | 更新者 |
|------|---------|--------|
| 2026-04-22 | **Skills 层废弃清理**：删除 5 个 skill 文件 + 12 个 API 端点 + SkillExecutor，简化能力系统 | titi |
| 2026-04-22 | **能力系统简化**：新增 capability-analyze.ts（利用 Prometheus 指标），废弃角色自主创建 Workflow | titi |
| 2026-04-17 | **FailureHandler 重构**：使用 harness ErrorClassifier/FailureRecorder，统一错误分类 | titi |
| 2026-04-17 | **PerformanceMonitor 重构**：使用 harness PerformanceCollector/Analyzer，文件存储 | titi |
| 2026-04-16 | **新增 Phase 4 编排模块**：AuditChain（审计链）、EconomyAdapter（经济适配器） | titi |
| 2026-04-16 | **新增 Phase 1 GateChecker**：6 种门禁检查、三层配置合并、批量检查报告 | titi |
| 2026-04-16 | **新增 Phase 3 编排模块**：CompanySkillLibrary（技能库）、CompanyMCPPool（MCP池）、SpecConstraintLayer（Spec约束层） | titi |
| 2026-04-16 | **新增 Phase 2 编排模块**：DiscussionDriver（讨论驱动器）、TaskSplitter（任务拆分器） | titi |
| 2026-04-16 | **新增 Phase 0 编排模块**：ContextBridge、MeetingStateMachine、StateListener、FailureHandler、PerformanceMonitor、SkillExecutor | titi |
| 2026-04-22 | **新增 Phase 6 编排模块**：TaskQueue + TaskWorker + TaskOutput + WorkflowBlocker（并发控制 + 跨 Task 上下文 + 阻塞恢复）| titi |
| 2026-04-22 | **新增 Phase 6 核心模块**：messages-prompt-builder + baseline-validator + risk-assessor（Agent 共享 + 偏离检测 + 风险评估）| titi |
| 2026-04-22 | **新增 Git pre-commit hook**：偏离检测触发 SpecReview + git stash 管理 | titi |
| 2026-04-14 | 新增编排层模块、约束级别、渐进式披露 | titi |
| 2026-04-12 | 新增 Skill/MCP/复杂度/分发模块和 API（v0.8） | titi |
| 2026-04-10 | 新增拦截器模块、拦截器 API（v0.7） | titi |
| 2026-04-09 | 新增 HTTP API 部分，历史记录分页 (AR-011) | titi |
| 2026-04-05 | 新增监控模块（Prometheus 指标） | titi |
| 2026-04-04 | 初始创建 | titi |

---

## Phase 6 功能汇总（2026-04-22）

### 三层控制架构

```
层 1：Task 并发控制
  ├─ maxConcurrency: 2（全局）
  ├─ perTypeConcurrency: 1（Agent 类型）
  └─ 依赖顺序执行

层 2：Workflow Agent 共享
  ├─ agentMode: shared
  ├─ passHistory: true
  ├─ messages 传递（分层压缩）
  └─ Token 控制（maxHistoryTokens）

层 3：跨 Task 上下文
  ├─ baselineDecision（Contract）
  ├─ specification（Contract）
  └─ dependentOutputs（Redis）
```

### Checkpoint + SpecReview 集成

```
Git pre-commit hook → 检测偏离 → SpecReview → Workflow 阻塞
  ├─ approved → git stash pop → 恢复 → 继续执行
  └─ rejected → git stash drop → 终止 → 创建新 Task
```

### 风险评估算法

```
RiskScore = Severity × Impact - Reversibility + Urgency

范围：0-18
映射：0-2→L1, 3-5→L2, 6-10→L3, 11-18→L4

权重配置：
  Severity: 1-4（偏离类型）
  Impact: 1-4（影响范围）
  Reversibility: 0-3（可逆性）
  Urgency: 0-2（紧急程度）
```

