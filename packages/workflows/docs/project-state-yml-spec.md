# project-state.yml 规范
# ============================================================================
# 项目生命周期状态管理
# ============================================================================

# 项目信息
project:
  name: my-app
  version: 1.0.0
  phase: development  # planning | development | testing | production | maintenance
  created_at: 2026-04-01T00:00:00Z
  updated_at: 2026-04-02T21:00:00Z

# 最近的执行记录
last_run:
  workflow: wf-full
  execution_id: exec-001
  status: completed
  completed_at: 2026-04-02T20:00:00Z
  duration: 3600  # 秒

# 工作流历史
workflows:
  - workflow: wf-planning
    execution_id: exec-000
    status: completed
    completed_at: 2026-04-01T12:00:00Z
    
  - workflow: wf-full
    execution_id: exec-001
    status: completed
    completed_at: 2026-04-02T20:00:00Z

# 待处理任务
pending:
  - type: bugfix
    priority: high
    backlog_id: BUG-001
    title: "登录页面报 500 错误"
    
  - type: feature
    priority: medium
    backlog_id: FEAT-001
    title: "用户导出功能"

# 统计
stats:
  total_executions: 15
  total_tokens: 150000
  by_workflow:
    wf-full: 1
    wf-iterate: 8
    wf-bugfix: 6

# ============================================================================
# 状态定义
# ============================================================================

phases:
  - planning      # 规划阶段，生成 tasks.yml
  - development   # 开发阶段，执行 tasks.yml
  - testing       # 测试阶段，验证功能
  - production    # 生产阶段，已部署
  - maintenance   # 维护阶段，修复 bug、优化

# ============================================================================
# 状态流转
# ============================================================================

transitions:
  planning:
    next: development
    workflows: [wf-planning]
    
  development:
    next: testing
    workflows: [wf-continue, wf-iterate]
    
  testing:
    next: production
    workflows: [wf-test]
    
  production:
    next: maintenance
    trigger: deployment
    
  maintenance:
    workflows: [wf-bugfix, wf-iterate, wf-patch]

# ============================================================================
# 自动决策规则
# ============================================================================

decision_rules:
  # 有未完成的 tasks.yml → 继续执行
  - condition: "has_pending_tasks_yml"
    action: "wf-continue"
    
  # 有待处理 Bug → Bug 修复
  - condition: "has_open_bugs"
    action: "wf-bugfix"
    priority: "bug priority"
    
  # 有新功能需求 → 迭代开发
  - condition: "has_feature_requests"
    action: "wf-iterate"
    
  # 有配置修改 → 快速修改
  - condition: "has_patch_requests"
    action: "wf-patch"
    
  # 默认：询问用户
  - condition: "default"
    action: "ask_user"
