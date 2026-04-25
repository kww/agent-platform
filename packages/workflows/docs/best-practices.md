# 最佳实践文档

> 版本: 1.0.0 | 更新: 2026-04-07

## 目录

1. [选择工作流](#选择工作流)
2. [任务拆分策略](#任务拆分策略)
3. [Backlog 管理](#backlog-管理)
4. [约束检查](#约束检查)
5. [错误处理](#错误处理)
6. [性能优化](#性能优化)
7. [常见问题](#常见问题)

---

## 选择工作流

### 层级对照表

| 复杂度 | 文件数 | 工作流 | 耗时 |
|:------:|:------:|--------|:----:|
| L0 | 0-1 | wf-patch | < 1 分钟 |
| L1 | 1-3 | wf-quick, wf-bugfix | < 5 分钟 |
| L2 | 3-10 | wf-dev, wf-solo | < 10 分钟 |
| L3 | 10+ | wf-full, wf-iterate | < 30 分钟 |
| L4 | - | wf-release | < 10 分钟 |

### 决策流程

```
任务类型？
    │
    ├─ 文案/配置修改 → wf-patch
    │
    ├─ Bug 修复 → wf-bugfix
    │
    ├─ 新功能
    │     │
    │     ├─ 小功能（1-3 文件）→ wf-quick
    │     │
    │     ├─ 中等功能（3-10 文件）
    │     │     │
    │     │     ├─ 有 API 契约 → wf-dev
    │     │     │
    │     │     └─ 个人开发 → wf-solo
    │     │
    │     └─ 大型功能（10+ 文件）
    │           │
    │           ├─ 从零开始 → wf-full
    │           │
    │           └─ 渐进迭代 → wf-iterate
    │
    └─ 发布上线 → wf-release
```

### 快速选择指南

| 任务 | 推荐工作流 |
|------|-----------|
| 修改 README.md | wf-patch |
| 添加一个 API 端点 | wf-quick |
| 修复一个 Bug | wf-bugfix |
| 开发用户认证系统（前后端） | wf-dev |
| 个人项目新功能 | wf-solo |
| 从零开发完整项目 | wf-full |
| 发布新版本 | wf-release |

---

## 任务拆分策略

### 拆分原则

1. **粒度适中** - 每个任务 1-3 个文件
2. **独立可测** - 任务完成后可独立验证
3. **依赖明确** - 标注任务间依赖关系
4. **预估时间** - 每个任务标注预估时间

### 拆分模式

#### 1. 基础设施优先

```
├─ 1. 数据库 Schema（30 分钟）
├─ 2. 基础模型层（30 分钟）
│     └─ 依赖：1
├─ 3. API 端点（45 分钟）
│     └─ 依赖：2
├─ 4. 前端组件（30 分钟）
│     └─ 依赖：3
└─ 5. 集成测试（20 分钟）
      └─ 依赖：4
```

#### 2. 用户价值优先

```
├─ 1. 核心流程（60 分钟）
│     └─ 用户能完成主要操作
├─ 2. 辅助功能（30 分钟）
│     └─ 依赖：1
├─ 3. 错误处理（20 分钟）
│     └─ 依赖：1, 2
└─ 4. 性能优化（15 分钟）
      └─ 依赖：3
```

#### 3. MVP 优先

```
├─ 1. 最小可用版本（45 分钟）
│     └─ 能完成核心功能
├─ 2. 必要完善（30 分钟）
│     └─ 依赖：1
├─ 3. 扩展功能（按需添加）
│     └─ 依赖：2
```

### 预设策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `infrastructure_first` | 基础设施优先 | 技术复杂项目 |
| `user_value_first` | 用户价值优先 | 产品导向项目 |
| `mvp_first` | MVP 优先 | 快速验证 |
| `frontend_first` | 前端优先 | UI 驱动项目 |
| `backend_first` | 后端优先 | API 驱动项目 |
| `balanced` | 平衡分配 | 一般项目 |

---

## Backlog 管理

### Backlog 结构

```yaml
# backlog.yml
project: my-project
version: 1.0.0
updated: 2026-04-07

items:
  # Feature
  - id: FEAT-001
    type: feature
    title: 用户认证系统
    status: open | in_progress | completed | blocked
    priority: high | medium | low
    description: |
      实现用户登录、注册、权限管理
      
    # 关联任务
    tasks: [TASK-001, TASK-002, TASK-003]
    
    # 时间信息
    created: 2026-04-01
    updated: 2026-04-07
    
  # Bug
  - id: BUG-001
    type: bug
    title: 登录页面报错
    status: open
    priority: critical
    description: |
      点击登录按钮后页面白屏
      
    # 错误日志
    error_log: |
      Error: Cannot read property 'token' of undefined
      
    # GitHub 关联
    github_issue: 42
```

### Backlog 操作

| 操作 | 工作流/步骤 |
|------|-----------|
| 添加 Feature | `/wf-planning --mode new_project` |
| 添加 Bug | `backlog/add` |
| 查看列表 | `backlog/list` |
| 更新状态 | `backlog/update` |
| 解决 Bug | `/wf-bugfix --bug_id BUG-001` |
| 开发 Feature | `/wf-dev --feature_id FEAT-001` |

### 状态流转

```
Feature 状态流转：
    │
    ├─ open（初始）
    │     └─ 规划后 → in_progress
    │
    ├─ in_progress
    │     └─ 完成后 → completed
    │     └─ 阻塞时 → blocked
    │
    ├─ blocked
    │     └─ 解除阻塞 → in_progress
    │
    └─ completed（终态）

Bug 状态流转：
    │
    ├─ open → in_progress → resolved
    │
    └─ resolved 后自动关闭 GitHub Issue
```

### GitHub 同步

| 场景 | 操作 |
|------|------|
| 本地新增 Bug | 自动创建 GitHub Issue |
| GitHub 新 Issue | 自动同步到 backlog.yml |
| Bug resolved | 自动关闭 GitHub Issue |
| Issue closed | 自动更新 backlog.yml |

---

## 约束检查

### Iron Laws

**必须满足的约束**：

| Iron Law | 说明 | 检查时机 |
|----------|------|----------|
| 无裸奔代码 | 所有代码有测试覆盖 | 每次提交 |
| 无硬编码 | 配置外置，无魔法值 | 每次提交 |
| 无大函数 | 函数 < 50 行 | 每次提交 |
| 无死代码 | 无未使用的代码 | 每次提交 |
| 无循环依赖 | 模块单向依赖 | 每次提交 |

### 约束级别

| 级别 | 检查内容 | 适用场景 |
|------|----------|----------|
| `strict` | 全部 Iron Laws + 项目约束 | 发布前 |
| `normal` | Iron Laws | 标准开发 |
| `loose` | 关键 Iron Laws | 原型开发 |
| `off` | 无检查 | wf-patch |

### 约束工作流

```yaml
# 调用约束检查
/wf-constraint --constraint_level strict

# 或在工作流中集成
- id: constraint-check
  execute:
    type: workflow
    workflow: wf-constraint
  input:
    constraint_level: strict
```

### 约束报告

```yaml
# constraint_report.yml
project: my-project
checked: 2026-04-07 12:00
level: strict

results:
  feature_list:
    status: pass
    details: Feature 列表完整
  
  decomposition:
    status: pass
    details: 任务拆分合理
  
  progress:
    status: warn
    details:
      - "TASK-003 未完成"
      - "建议：检查阻塞原因"
  
  iron_laws:
    status: pass
    details:
      - "测试覆盖率: 85%"
      - "无硬编码"
      - "无大函数"

summary:
  passed: 3
  warnings: 1
  failed: 0
```

---

## 错误处理

### 步骤级错误处理

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `retry` | 重试 3 次 | 网络、Agent 错误 |
| `skip` | 跳过当前步骤 | 非关键步骤 |
| `fail` | 立即失败 | 验证、权限错误 |
| `fallback` | 执行回退步骤 | 关键步骤 |

### 错误类型与处理

| 错误类型 | 推荐处理 |
|----------|----------|
| `timeout` | retry + 增加超时 |
| `network_fail` | retry + backoff |
| `agent_fail` | retry 或 fallback |
| `validation_fail` | fail（修复输入） |
| `resource_limit` | skip 或 fail |
| `config_error` | fail（修复配置） |
| `permission_denied` | fail（检查权限） |

### 工作流级错误处理

```yaml
# 工作流配置
config:
  # 全局错误策略
  onError: fail
  
  # 步骤级覆盖
  steps:
    - id: risky-step
      on_fail:
        strategy: fallback
        fallback:
          step: backup-plan
```

---

## 性能优化

### 步骤缓存

```yaml
# 启用缓存
step:
  id: analyze
  cache:
    enabled: true
    key: "{{project_path}}:{{git_hash}}"
    ttl: 3600  # 1 小时
```

### 并行执行

```yaml
# 前后端并行开发
- id: parallel-dev
  parallel:
    - id: frontend
      ...
    - id: backend
      ...
```

### 批量处理

```yaml
# 批量测试
- id: batch-test
  loop:
    items: "{{test_files}}"
    parallel: 5  # 并行 5 个
    step: test/single
```

### 大文件处理

```yaml
# 分块读取
- id: read-large-file
  execute:
    type: builtin
    handler: file/read-chunks
  input:
    file: "{{large_file}}"
    chunk_size: 10000
```

---

## 常见问题

### Q1: 选择哪个工作流？

**A**: 参考决策流程：

- 文案修改 → wf-patch
- Bug 修复 → wf-bugfix
- 小功能 → wf-quick
- 大功能 → wf-full

### Q2: 任务拆分太细/太粗？

**A**: 调整策略：

- 太细 → 使用 `balanced` 或 `user_value_first`
- 太粗 → 使用 `infrastructure_first`

### Q3: 约束检查失败？

**A**: 查看报告：

```yaml
# 查看 constraint_report.yml
# 修复具体问题
# 重新运行约束检查
```

### Q4: 工作流执行中断？

**A**: 使用 wf-continue：

```bash
/wf-continue --project_path /path/to/project
```

### Q5: Agent 执行超时？

**A**: 调整超时配置：

```yaml
config:
  timeout: 600000  # 增加到 10 分钟
```

### Q6: GitHub Issue 同步失败？

**A**: 检查配置：

```yaml
# 检查 GitHub Token 配置
# 检查仓库权限
# 查看 github-sync.yml 日志
```

---

## 参考资源

- [步骤开发指南](./step-development-guide.md)
- [工作流开发指南](./workflow-development-guide.md)
- [Backlog 规范](./backlog-yml-spec.md)
- [Tasks 规范](./tasks-yml-spec.md)
- [约束检查规范](./project-constraints.md)