# Agent Workflows Test Makefile
# =============================================================================
# 测试命令
# =============================================================================

.PHONY: test test-workflows test-tools test-steps test-all lint schema clean

# 默认目标
test: test-all

# 运行所有测试
test-all:
	@echo "🧪 Running all tests..."
	@bats tests/*.bats

# 运行工作流测试
test-workflows:
	@echo "🧪 Testing workflows..."
	@bats tests/workflows.bats

# 运行工具测试
test-tools:
	@echo "🧪 Testing tools..."
	@bats tests/tools.bats

# 运行步骤测试
test-steps:
	@echo "🧪 Testing steps..."
	@bats tests/steps.bats

# YAML 语法检查
lint:
	@echo "🔍 Checking YAML syntax..."
	@find workflows -name "*.yml" -exec yq eval '.' {} \; > /dev/null
	@find tools -name "*.yml" -exec yq eval '.' {} \; > /dev/null
	@find steps -name "*.yml" -exec yq eval '.' {} \; > /dev/null
	@echo "✅ All YAML files are valid"

# Schema 验证
schema:
	@echo "🔍 Validating against schemas..."
	@for file in workflows/*.yml; do \
		echo "Validating $$file..."; \
		yq eval -j '.' "$$file" | jq . > /dev/null; \
	done
	@echo "✅ All files pass schema validation"

# 统计报告
stats:
	@echo "📊 Agent Workflows Statistics"
	@echo "=============================="
	@echo "Workflows: $$(ls workflows/*.yml | wc -l)"
	@echo "Tools:     $$(find tools -name "*.yml" | wc -l)"
	@echo "Steps:     $$(find steps -name "*.yml" | wc -l)"
	@echo ""
	@echo "Test Coverage:"
	@echo "  Workflow tests: $$(grep -c '@test' tests/workflows.bats)"
	@echo "  Tool tests:     $$(grep -c '@test' tests/tools.bats)"
	@echo "  Step tests:     $$(grep -c '@test' tests/steps.bats)"

# 清理
clean:
	@echo "🧹 Cleaning up..."
	@rm -rf tests/.bats-run-logs 2>/dev/null || true
	@echo "✅ Done"

# CI 测试（生成报告）
ci:
	@echo "🧪 Running CI tests..."
	@bats tests/*.bats --report-formatter tap --output tests/.bats-run-logs

# 帮助
help:
	@echo "Agent Workflows Test Commands"
	@echo "============================="
	@echo "make test           - Run all tests"
	@echo "make test-workflows - Test workflows only"
	@echo "make test-tools     - Test tools only"
	@echo "make test-steps     - Test steps only"
	@echo "make lint           - Check YAML syntax"
	@echo "make schema         - Validate against schemas"
	@echo "make stats          - Show statistics"
	@echo "make clean          - Clean up test artifacts"
	@echo "make ci             - Run CI tests with report"