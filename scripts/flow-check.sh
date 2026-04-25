#!/bin/bash
# Agent Platform 流程检查脚本
# 用途：Phase 1.5 改造期间强制检查
# 位置：agent-platform/scripts/flow-check.sh
# 范围：仅适用于 agent-platform 项目

ROADMAP="/root/knowledge-base/issues/agent-platform-roadmap.md"
ARCH_DIR="/root/knowledge-base/issues"

echo "================================================"
echo "🔍 Agent Platform 流程检查"
echo "================================================"

TASK_ID="${1:-}"

if [ -z "$TASK_ID" ]; then
    echo "❌ 未提供任务 ID"
    echo "用法: ./scripts/flow-check.sh <任务ID>"
    echo "示例: ./scripts/flow-check.sh ES-001"
    exit 1
fi

echo ""
echo "1️⃣ 检查 roadmap..."
if grep -q "$TASK_ID" "$ROADMAP" 2>/dev/null; then
    echo "✅ roadmap 有任务: $TASK_ID"
else
    echo "❌ roadmap 缺失任务: $TASK_ID"
    echo "→ 需要先补充到 roadmap"
    echo "→ 位置: $ROADMAP"
    exit 1
fi

echo ""
echo "2️⃣ 检查架构文档..."
# agent-platform 项目特定映射
case "$TASK_ID" in
    ES*) ARCH_DOC="01-agent-platform-architecture.md" ;;
    *)   ARCH_DOC="" ;;
esac

if [ -n "$ARCH_DOC" ] && [ -f "$ARCH_DIR/$ARCH_DOC" ]; then
    echo "✅ 架构文档存在: $ARCH_DOC"
elif [ -n "$ARCH_DOC" ]; then
    echo "⚠️ 架构文档缺失: $ARCH_DOC"
    echo "→ 需要先创建架构文档"
fi

echo ""
echo "================================================"
echo "检查完成"
echo "================================================"