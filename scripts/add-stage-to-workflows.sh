#!/bin/bash
# 批量为 Workflow YAML 文件添加 stage 字段

WORKFLOWS_DIR="/root/projects/agent-platform/packages/workflows/workflows"

# Workflow → Stage 映射
declare -A STAGE_MAP=(
  ["wf-planning"]="plan"
  ["wf-architecture-review"]="plan"
  ["wf-spec-review"]="plan"
  ["wf-dev"]="develop"
  ["wf-iterate"]="develop"
  ["wf-backend"]="develop"
  ["wf-frontend"]="develop"
  ["wf-test"]="verify"
  ["wf-review"]="verify"
  ["wf-e2e-test"]="verify"
  ["wf-release"]="deploy"
  ["wf-deploy"]="deploy"
  ["wf-bugfix"]="fix"
  ["wf-patch"]="fix"
  ["wf-evolution"]="govern"
  ["wf-audit"]="govern"
  ["wf-constraint"]="govern"
  ["wf-continue"]="develop"
  # 测试文件默认 develop
  ["test-"]="develop"
)

for file in "$WORKFLOWS_DIR"/*.yml; do
  filename=$(basename "$file" .yml)
  
  # 确定 stage
  stage=""
  for key in "${!STAGE_MAP[@]}"; do
    if [[ "$filename" == "$key" ]] || [[ "$filename" =~ ^"$key" ]]; then
      stage="${STAGE_MAP[$key]}"
      break
    fi
  done
  
  # 默认 stage
  if [[ -z "$stage" ]]; then
    if [[ "$filename" =~ test ]]; then
      stage="verify"
    elif [[ "$filename" =~ bugfix|fix|patch ]]; then
      stage="fix"
    else
      stage="develop"
    fi
  fi
  
  # 检查是否已有 stage 字段
  if grep -q "^stage:" "$file"; then
    echo "⏭️ $filename 已有 stage 字段"
    continue
  fi
  
  # 在 id 行后插入 stage
  if grep -q "^id:" "$file"; then
    sed -i "/^id:/a stage: $stage" "$file"
    echo "✅ $filename → $stage"
  else
    echo "❌ $filename 无 id 字段"
  fi
done

echo ""
echo "完成！验证："
grep "^stage:" "$WORKFLOWS_DIR"/*.yml | head -20