#!/bin/bash
# registry.sh - 能力注册表
# ============================================================================
# 功能：统一管理所有能力，支持发现、查询、调用
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../lib/common.sh"

# 项目根目录
PROJECT_ROOT="$(dirname "$(dirname "$0")")"

# 新目录结构（扁平化重构后）
TOOLS_DIR="$PROJECT_ROOT/tools"
PIPELINES_DIR="$PROJECT_ROOT/pipelines"
SKILLS_DIR="$PROJECT_ROOT/skills"

# 解析 YAML 字段
yaml_get() {
  local file="$1"
  local key="$2"
  grep "^$key:" "$file" | head -1 | sed "s/^$key: *//"
}

# 注册表索引文件
REGISTRY_INDEX="$PROJECT_ROOT/registry/index.json"

# ============================================================================
# 工具函数
# ============================================================================

# 生成注册表索引
generate_index() {
  echo "🔄 生成能力索引..."

  require_command jq

  # 收集 tools
  local tools_json="[]"
  while IFS= read -r file; do
    local category=$(basename "$(dirname "$file")")
    local name=$(basename "$file" .yml)
    local description=$(yaml_get "$file" "description")
    tools_json=$(echo "$tools_json" | jq \
      --arg name "$name" --arg cat "$category" --arg desc "$description" --arg path "$file" \
      '. + [{"name": $name, "category": $cat, "type": "tool", "description": $desc, "path": $path}]')
  done < <(find "$TOOLS_DIR" -name "*.yml" 2>/dev/null | sort)

  # 收集 workflows
  local workflows_json="[]"
  while IFS= read -r file; do
    local name=$(basename "$file" .yml)
    local description=$(yaml_get "$file" "description")
    workflows_json=$(echo "$workflows_json" | jq \
      --arg name "$name" --arg desc "$description" --arg path "$file" \
      '. + [{"name": $name, "category": "uncategorized", "type": "workflow", "description": $desc, "path": $path}]')
  done < <(find "$PIPELINES_DIR" -name "*.yml" 2>/dev/null | sort)

  # 收集 skills
  local skills_json="[]"
  for skill_dir in "$SKILLS_DIR"/*; do
    if [ ! -d "$skill_dir" ]; then continue; fi
    local file="$skill_dir/SKILL.md"
    if [ ! -f "$file" ]; then continue; fi
    local name=$(basename "$skill_dir")
    local description=$(awk '/^---/{flag=!flag; next} flag{if (/^description:/) {print substr($0, 12); exit}}' "$file")
    if [ -z "$description" ]; then description="$name"; fi
    skills_json=$(echo "$skills_json" | jq \
      --arg name "$name" --arg desc "$description" --arg path "$file" \
      '. + [{"name": $name, "category": "uncategorized", "type": "skill", "description": $desc, "path": $path}]')
  done

  # 组装最终 JSON
  jq -n \
    --argjson tools "$tools_json" \
    --argjson workflows "$workflows_json" \
    --argjson skills "$skills_json" \
    '{tools: $tools, workflows: $workflows, skills: $skills}' \
    > "$REGISTRY_INDEX"

  echo "✅ 索引生成完成: $REGISTRY_INDEX"
  local count_tools=$(jq '.tools | length' "$REGISTRY_INDEX")
  local count_wfs=$(jq '.workflows | length' "$REGISTRY_INDEX")
  local count_skills=$(jq '.skills | length' "$REGISTRY_INDEX")
  local total=$((count_tools + count_wfs + count_skills))
  echo "📊 总计: $total 个能力"
  echo "   - tools: $count_tools"
  echo "   - workflows: $count_wfs"
  echo "   - skills: $count_skills"
}

# 列出所有能力
list_abilities() {
  if [ ! -f "$REGISTRY_INDEX" ]; then
    echo "⚠️  索引不存在，请先运行: registry generate"
    return 1
  fi
  
  echo "📋 所有能力:"
  echo ""
  
  # 按类型分组显示
  echo "🔧 Tools (工具型能力):"
  cat "$REGISTRY_INDEX" | jq -r '.tools[] | "  - \(.name) [\(.category)] - \(.description)"'
  echo ""
  
  echo "⚡ Workflows (任务型流程):"
  cat "$REGISTRY_INDEX" | jq -r '.workflows[] | "  - \(.name) - \(.description)"'
  echo ""
  
  echo "🎭 Skills (角色技能):"
  cat "$REGISTRY_INDEX" | jq -r '.skills[] | "  - \(.name) - \(.description)"'
  echo ""
  
  local count_tools=$(cat "$REGISTRY_INDEX" | jq '.tools | length')
  local count_wfs=$(cat "$REGISTRY_INDEX" | jq '.workflows | length')
  local count_skills=$(cat "$REGISTRY_INDEX" | jq '.skills | length')
  local total=$((count_tools + count_wfs + count_skills))
  echo "📊 总计: $total 个能力"
  echo "   - tools: $count_tools"
  echo "   - workflows: $count_wfs"
  echo "   - skills: $count_skills"
}

# 查询能力详情
describe_ability() {
  local name="$1"
  
  if [ ! -f "$REGISTRY_INDEX" ]; then
    echo "⚠️  索引不存在，请先运行: registry generate"
    return 1
  fi
  
  # 遍历所有类型
  local found=""
  found=$(cat "$REGISTRY_INDEX" | jq ".tools[] | select(.name == \"$name\")")
  if [ -z "$found" ]; then
    found=$(cat "$REGISTRY_INDEX" | jq ".workflows[] | select(.name == \"$name\")")
  fi
  if [ -z "$found" ]; then
    found=$(cat "$REGISTRY_INDEX" | jq ".skills[] | select(.name == \"$name\")")
  fi
  
  if [ -z "$found" ]; then
    echo "❌ 能力不存在: $name"
    return 1
  fi
  
  echo "📝 能力详情: $name"
  echo ""
  echo "$found" | jq .
}

# 调用能力
call_ability() {
  local name="$1"
  shift
  
  if [ ! -f "$REGISTRY_INDEX" ]; then
    echo "⚠️  索引不存在，请先运行: registry generate"
    return 1
  fi
  
  # 遍历所有类型
  local entry=""
  entry=$(cat "$REGISTRY_INDEX" | jq ".tools[] | select(.name == \"$name\")")
  if [ -z "$entry" ]; then
    entry=$(cat "$REGISTRY_INDEX" | jq ".workflows[] | select(.name == \"$name\")")
  fi
  if [ -z "$entry" ]; then
    entry=$(cat "$REGISTRY_INDEX" | jq ".skills[] | select(.name == \"$name\")")
  fi
  
  if [ -z "$entry" ]; then
    echo "❌ 能力不存在: $name"
    return 1
  fi
  
  local type=$(echo "$entry" | jq -r '.type')
  local path=$(echo "$entry" | jq -r '.path')
  
  echo "🔍 调用能力: $name ($type)"
  echo "   路径: $path"
  echo ""
  
  case "$type" in
    tool)
      # 工具型能力：capability
      "$WORKFLOW_BIN" capability "$name" "$@"
      ;;
    workflow)
      # 任务型能力：run
      "$WORKFLOW_BIN" run "$name" "$@"
      ;;
    skill)
      # 角色技能：role
      "$WORKFLOW_BIN" role "$name" "$@"
      ;;
    *)
      echo "❌ 未知类型: $type"
      return 1
      ;;
  esac
}

# ============================================================================
# 主入口
# ============================================================================

# 保存 workflow 二进制路径
WORKFLOW_BIN="$PROJECT_ROOT/packages/engine/src/core/workflow.sh"

case "${1:-list}" in
  generate)
    generate_index
    ;;
  list)
    list_abilities
    ;;
  describe)
    describe_ability "$2"
    ;;
  call)
    shift
    call_ability "$@"
    ;;
  *)
    echo "用法: $0 <generate|list|describe|call>"
    echo ""
    echo "  generate   - 生成能力索引"
    echo "  list      - 列出所有能力"
    echo "  describe name  - 查询能力详情"
    echo "  call name [args] - 调用能力"
    echo ""
    echo "示例:"
    echo "  $0 generate"
    echo "  $0 list"
    echo "  $0 describe clone"
    echo "  $0 call clone --repo_url https://github.com/openclaw/openclaw"
    ;;
esac
