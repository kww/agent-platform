#!/bin/bash
# 批量为 Tool YAML 文件添加 stage 字段

TOOLS_DIR="/root/projects/agent-platform/packages/workflows/tools/std"

# 目录 → Stage 映射
declare -A DIR_STAGE_MAP=(
  ["analysis"]="plan"
  ["design"]="plan"
  ["planning"]="plan"
  ["backlog"]="plan"
  ["development"]="develop"
  ["bugfix"]="fix"
  ["patch"]="fix"
  ["verification"]="verify"
  ["quality"]="verify"
  ["deploy"]="deploy"
  ["governance"]="govern"
  ["evolution"]="govern"
  ["constraint"]="govern"
  ["project"]="plan"
  ["quick"]="develop"
)

# 特殊文件映射（覆盖目录默认）
declare -A FILE_STAGE_MAP=(
  ["project/load-state"]="plan"
  ["project/save-state"]="plan"
  ["project/decide-next-workflow"]="plan"
  ["file/read"]="develop"
  ["file/write"]="develop"
  ["file/copy"]="develop"
)

total_count=0
success_count=0

for dir in "$TOOLS_DIR"/*/; do
  dirname=$(basename "$dir")
  
  # 获取目录默认 stage
  default_stage="${DIR_STAGE_MAP[$dirname]}"
  if [[ -z "$default_stage" ]]; then
    default_stage="develop"  # 默认值
  fi
  
  for file in "$dir"*.yml; do
    if [[ ! -f "$file" ]]; then
      continue
    fi
    
    filename=$(basename "$file" .yml)
    relpath="$dirname/$filename"
    
    total_count=$((total_count + 1))
    
    # 检查特殊文件映射
    stage="${FILE_STAGE_MAP[$relpath]}"
    if [[ -z "$stage" ]]; then
      stage="$default_stage"
    fi
    
    # 检查是否已有 stage 字段
    if grep -q "^stage:" "$file"; then
      echo "⏭️ $relpath 已有 stage"
      success_count=$((success_count + 1))
      continue
    fi
    
    # 在 id 行后插入 stage（如果存在）
    if grep -q "^id:" "$file"; then
      sed -i "/^id:/a stage: $stage" "$file"
      echo "✅ $relpath → $stage"
      success_count=$((success_count + 1))
    elif grep -q "^name:" "$file"; then
      # 无 id 时，在 name 后插入
      sed -i "/^name:/a stage: $stage" "$file"
      echo "✅ $relpath → $stage (无 id)"
      success_count=$((success_count + 1))
    else
      echo "❌ $relpath 无 id/name 字段"
    fi
  done
done

echo ""
echo "统计: $success_count / $total_count"
echo ""
echo "Stage 分布:"
grep "^stage:" "$TOOLS_DIR"/*/*.yml | sed 's/.*stage: //' | sort | uniq -c