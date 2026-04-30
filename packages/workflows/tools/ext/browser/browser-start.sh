#!/bin/bash
# browser-start.sh - 启动浏览器会话
# ============================================================================
# 功能：启动浏览器并打开指定 URL
# 底层：使用 agent-browser-stealth (abs)
# 用途：为 E2E 测试、浏览器自动化提供会话
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../../../lib/common.sh"

# 参数
URL="${1:-}"
HEADLESS="${2:-true}"
BROWSER="${3:-chromium}"
SESSION_NAME="${SESSION_NAME:-browser-session-$(date +%s)}"

# 显示帮助
show_help() {
  cat << EOF
启动浏览器会话

用法:
  $0 <url> [headless] [browser]

参数:
  url       要打开的 URL
  headless  是否无头模式 (true/false，默认 true)
  browser   浏览器类型 (chromium/firefox/webkit，默认 chromium)

环境变量:
  SESSION_NAME  会话名称（默认自动生成）

输出:
  JSON 格式的会话信息

示例:
  $0 https://example.com
  $0 https://example.com false chromium
  SESSION_NAME=my-session $0 https://example.com
EOF
  exit 0
}

# 检查参数
if [[ "$1" == "-h" || "$1" == "--help" || -z "$URL" ]]; then
  show_help
fi

# 检查 abs 是否安装
if ! command -v abs &> /dev/null; then
  log_error "agent-browser-stealth (abs) 未安装"
  echo '{"success": false, "error": "abs not found"}'
  exit 1
fi

# 构建参数
ARGS="--session-name $SESSION_NAME"

if [[ "$HEADLESS" == "false" ]]; then
  ARGS="$ARGS --visible"
fi

# 启动浏览器
log_info "启动浏览器会话: $SESSION_NAME"
log_info "URL: $URL"
log_info "无头模式: $HEADLESS"

# 调用 abs 打开 URL
if abs open "$URL" $ARGS 2>/dev/null; then
  # 输出 JSON 结果
  cat << EOF
{
  "success": true,
  "session_id": "$SESSION_NAME",
  "page_id": "$SESSION_NAME-page",
  "url": "$URL",
  "headless": $HEADLESS,
  "browser": "$BROWSER"
}
EOF
else
  cat << EOF
{
  "success": false,
  "error": "Failed to start browser"
}
EOF
  exit 1
fi
