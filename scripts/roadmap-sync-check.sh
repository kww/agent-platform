#!/bin/bash
# Roadmap 同步检查脚本
# 用途：检查 Phase 2 任务实现状态，同步 roadmap

ROADMAP_FILE="/root/knowledge-base/issues/agent-platform-roadmap.md"
RUNTIME_DIR="/root/projects/agent-platform/packages/runtime/src"
STUDIO_DIR="/root/projects/agent-studio/src"

# Phase 2 任务关键词映射
declare -A TASK_KEYWORDS=(
  ["MR-001"]="WebSocket\|ws"
  ["MR-002"]="locked\|锁定"
  ["MR-003"]="timeout\|超时\|MeetingTimeoutChecker"
  ["MR-016"]="publishMeetingEvent\|event"
  ["DD-001"]="DiscussionDriver\|discussion"
  ["TS-001"]="TaskSplitter\|split"
)

echo "=== Roadmap 同步检查 ==="
echo "时间：$(date)"
echo ""

for task_id in "${!TASK_KEYWORDS[@]}"; do
  keyword="${TASK_KEYWORDS[$task_id]}"
  
  # 搜索 runtime
  runtime_match=$(grep -rE "$keyword" --include="*.ts" "$RUNTIME_DIR" 2>/dev/null | wc -l)
  
  # 搜索 studio
  studio_match=$(grep -rE "$keyword" --include="*.ts" "$STUDIO_DIR" 2>/dev/null | wc -l)
  
  total=$((runtime_match + studio_match))
  
  if [ $total -gt 0 ]; then
    echo "✅ $task_id: 已实现（$total 处代码）"
    echo "   Runtime: $runtime_match, Studio: $studio_match"
  else
    echo "⬜ $task_id: 未实现"
  fi
done

echo ""
echo "=== 建议 ==="
echo "1. ✅ 任务 → 更新 roadmap 状态为已实现"
echo "2. ⬜ 任务 → 确认需要开发"
