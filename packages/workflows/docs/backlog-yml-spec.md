# backlog.yml 规范
# ============================================================================
# 项目待办事项统一管理
# ============================================================================

# 项目信息
project:
  name: my-app
  version: 1.0.0

# 待办事项列表
items:
  # Bug 类型
  - id: BUG-001
    type: bug
    title: "登录页面报 500 错误"
    priority: high          # critical | high | medium | low
    status: open            # open | in_progress | resolved | closed
    labels: [auth, api]
    created_at: 2026-04-02T10:00:00Z
    updated_at: 2026-04-02T10:00:00Z
    description: |
      用户登录时返回 500 错误
      错误日志：Error: Database connection failed
    error_log: |
      Error: Database connection failed
        at loginHandler (auth.js:42)
    # GitHub 同步字段（可选）
    github_issue_number: null  # 同步后填充 GitHub Issue 编号
    # 修复后填充
    resolved_by: null       # 工作流执行 ID
    resolved_at: null

  # Feature 类型
  - id: FEAT-001
    type: feature
    title: "用户导出功能"
    priority: medium
    status: open
    labels: [export, user]
    business_value: "运营需要定期导出用户数据"
    estimated_effort: medium  # small | medium | large
    created_at: 2026-04-02T11:00:00Z

  # Enhancement 类型
  - id: ENH-001
    type: enhancement
    title: "优化列表页加载速度"
    priority: high
    status: open
    labels: [performance, ui]
    description: "当前列表页加载需要 3 秒，目标 < 1 秒"
    metrics:
      current: 3s
      target: 1s
    created_at: 2026-04-02T12:00:00Z

  # Tech Debt 类型
  - id: DEBT-001
    type: tech-debt
    title: "升级 React 18"
    priority: low
    status: open
    labels: [dependencies, upgrade]
    description: "React 17 即将 EOL，需要升级到 18"
    impact: medium
    created_at: 2026-04-02T13:00:00Z

# 统计信息（自动生成）
stats:
  total: 4
  by_type:
    bug: 1
    feature: 1
    enhancement: 1
    tech-debt: 1
  by_status:
    open: 4
    in_progress: 0
    resolved: 0
    closed: 0
  by_priority:
    critical: 0
    high: 2
    medium: 1
    low: 1

# ============================================================================
# 类型定义
# ============================================================================

types:
  # 待办类型
  - bug           # Bug 修复 → wf-bugfix
  - feature       # 新功能 → wf-iterate
  - enhancement   # 优化 → wf-iterate
  - performance   # 性能优化 → wf-iterate
  - tech-debt     # 技术债 → wf-iterate
  - patch         # 极简修改 → wf-patch

  # 优先级
  - critical      # 紧急，立即处理
  - high          # 高优先级，尽快处理
  - medium        # 中等，正常排期
  - low           # 低优先级，有空再处理

  # 状态流转
  # open → in_progress → resolved → closed
  #                    ↘ failed → open (重试)

# ============================================================================
# 类型→工作流映射
# ============================================================================
# 更新：2026-04-06 - wf-iterate 已合并到 wf-dev

workflow_mapping:
  bug: wf-bugfix
  feature: wf-dev          # wf-iterate → wf-dev（2026-04-06 合并）
  enhancement: wf-dev      # wf-iterate → wf-dev
  performance: wf-dev      # wf-iterate → wf-dev
  tech-debt: wf-dev        # wf-iterate → wf-dev
  patch: wf-patch
  full: wf-full            # 新增：大型项目完整流程

# ============================================================================
# 自动化规则
# ============================================================================

automation:
  # 自动分配优先级
  auto_priority:
    - condition: "type == 'bug' && labels contains 'auth'"
      priority: critical
    - condition: "type == 'bug' && labels contains 'api'"
      priority: high
    - condition: "type == 'performance' && metrics.current > 5s"
      priority: high

  # 自动添加标签
  auto_labels:
    - condition: "title contains '登录' || title contains 'auth'"
      labels: [auth]
    - condition: "title contains 'API' || title contains 'api'"
      labels: [api]

  # 自动通知
  notifications:
    - event: item_created
      when: "priority == 'critical'"
      notify: [discord, email]
    - event: item_resolved
      notify: [discord]

# ============================================================================
# GitHub Issues 同步（可选）
# ============================================================================
# 更新：2026-04-07 - AW-015 实现

github_sync:
  enabled: false
  repo: owner/repo
  
  # 同步方向
  sync_direction: bidirectional  # to_github | from_github | bidirectional
  
  # 标签映射
  label_mapping:
    bug: bug
    feature: enhancement
    enhancement: enhancement
    tech-debt: tech-debt
    critical: critical
    high: high-priority
    medium: medium
    low: low-priority
  
  # 状态映射
  status_mapping:
    open: open
    in_progress: open
    resolved: closed
    closed: closed
  
  # 冲突处理策略
  # ============================================================================
  # 可选策略：
  #   - github_wins: GitHub 优先（团队协作推荐）
  #   - backlog_wins: backlog.yml 优先（个人项目推荐）
  #   - timestamp_wins: 时间戳优先
  #   - human_confirm: 人工确认（关键项目推荐）
  #   - ai_merge: AI 智能合并
  #   - layered: 分层策略（不同字段不同策略，推荐）
  # ============================================================================
  conflict_strategy: layered
  
  # 分层策略配置（仅 layered 模式）
  layered_config:
    # 状态：GitHub 优先（团队协作）
    status: github_wins
    
    # 标题：AI 智能合并
    title: ai_merge
    
    # 优先级：时间戳优先
    priority: timestamp_wins
    
    # 标签：直接合并（无冲突）
    labels: merge
    
    # 描述：人工确认（重要内容）
    description: human_confirm
    
    # 错误日志：backlog.yml 优先（本地记录）
    error_log: backlog_wins
  
  # ID 映射字段
  # 用于关联 backlog item 和 GitHub Issue
  id_mapping_field: github_issue_number  # backlog.yml 中存储的字段
  
  # 同步触发条件
  sync_trigger:
    on_workflow_start: false  # 工作流开始时自动同步
    on_workflow_end: false    # 工作流结束时自动同步
    on_item_created: false    # 新建 item 时自动同步
    on_item_resolved: true    # item 解决时自动同步到 GitHub

# ============================================================================
# 冲突策略详细说明
# ============================================================================
#
# github_wins:
#   - 冲突时以 GitHub 状态为准
#   - 适用：团队协作，GitHub 是权威来源
#   - 优点：尊重团队其他人的修改
#   - 缺点：本地修改可能丢失
#
# backlog_wins:
#   - 冲突时以 backlog.yml 为准
#   - 适用：个人项目，本地主导
#   - 优点：保护本地工作流状态
#   - 缺点：可能覆盖团队修改
#
# timestamp_wins:
#   - 冲突时以最后更新时间为准
#   - 适用：有准确时间戳的场景
#   - 优点：自动选择最新修改
#   - 缺点：时间戳必须准确同步
#
# human_confirm:
#   - 冲突时暂停，等待人工决策
#   - 适用：关键项目、重要变更
#   - 优点：精确控制、不丢失数据
#   - 缺点：交互打断流程
#
# ai_merge:
#   - AI 分析差异，智能合并
#   - 适用：复杂字段差异
#   - 优点：保留双方修改
#   - 缺点：AI 可能判断错误
#
# merge:
#   - 直接合并（适用于标签等无冲突字段）
#   - 双方的值都保留
#   - 适用：标签、列表类字段
#
# layered:
#   - 不同字段不同策略
#   - 最灵活，推荐使用
#   - 通过 layered_config 配置各字段策略
#
# ============================================================================
