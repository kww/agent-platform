#!/bin/bash
# common.sh - Shell 脚本公共库
# ============================================================================
# 功能：提供颜色输出、日志函数、依赖检查等通用工具
# 用法：source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
# ============================================================================

# 颜色输出
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export BLUE='\033[0;34m'
export NC='\033[0m'

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_debug() { echo -e "${BLUE}[DEBUG]${NC} $1"; }

# 依赖检查
require_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "必需的命令 '$1' 未找到，请先安装。"
    exit 1
  fi
}
