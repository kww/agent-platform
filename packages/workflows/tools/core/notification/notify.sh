#!/bin/bash
# notify.sh - 发送通知
# ============================================================================
# 功能：发送通知到指定渠道
# 渠道：discord, queue (降级方案)
# 用途：工作流完成通知、审核结果通知、状态更新
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../../lib/common.sh"

# 参数
CHANNEL="${1:-discord}"
MESSAGE="${2:-}"
TITLE="${3:-}"

# 通知队列目录
NOTIFICATION_DIR="${NOTIFICATION_DIR:-/tmp/agent-notifications}"

# 显示帮助
show_help() {
  cat << EOF
发送通知

用法:
  $0 <channel> <message> [title]

参数:
  channel  通知渠道 (discord/queue)
  message  通知内容
  title    通知标题（可选）

渠道说明:
  discord  尝试发送到 Discord（需要 sessions_send）
  queue    写入通知队列文件（降级方案）

环境变量:
  NOTIFICATION_DIR  通知队列目录（默认 /tmp/agent-notifications）

输出:
  JSON 格式的发送结果

示例:
  $0 discord "测试完成" "通知标题"
  $0 queue "审核完成" "审核结果"
EOF
  exit 0
}

# 检查参数
if [[ "$1" == "-h" || "$1" == "--help" || -z "$MESSAGE" ]]; then
  show_help
fi

# 检查依赖
require_command jq

# 验证渠道
if [[ "$CHANNEL" != "discord" && "$CHANNEL" != "queue" ]]; then
  log_error "不支持的通知渠道: $CHANNEL"
  cat << EOF
{
  "success": false,
  "error": "Unsupported channel: $CHANNEL",
  "supported_channels": ["discord", "queue"]
}
EOF
  exit 1
fi

# 生成消息 ID
MESSAGE_ID="notify-$(date +%s)-$$"

# 构建通知内容
if [[ -n "$TITLE" ]]; then
  FULL_MESSAGE="**$TITLE**\n$MESSAGE"
else
  FULL_MESSAGE="$MESSAGE"
fi

# 写入通知队列（discord 和 queue 共用相同逻辑）
mkdir -p "$NOTIFICATION_DIR"
NOTIFICATION_FILE="$NOTIFICATION_DIR/${MESSAGE_ID}.json"

jq -n \
  --arg id "$MESSAGE_ID" \
  --arg channel "$CHANNEL" \
  --arg title "$TITLE" \
  --arg content "$MESSAGE" \
  --arg ts "$(date -Iseconds)" \
  '{id: $id, channel: $channel, title: $title, content: $content, timestamp: $ts, status: "pending"}' \
  > "$NOTIFICATION_FILE"

log_info "通知已写入队列: $NOTIFICATION_FILE"

cat << EOF
{
  "success": true,
  "message_id": "$MESSAGE_ID",
  "channel": "$CHANNEL",
  "status": "queued",
  "file": "$NOTIFICATION_FILE"
}
EOF
