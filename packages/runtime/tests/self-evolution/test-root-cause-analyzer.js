/**
 * 自我进化机制测试
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// 导入被测模块
const { 
  RootCauseAnalyzer, 
  analyzeRootCause,
  getRootCauseAnalyzer,
} = require('../../dist/core/root-cause-analyzer');

const TEST_DIR = '/tmp/test-root-cause';

// ============================================
// 测试工具函数
// ============================================

function setup() {
  // 创建测试目录
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  // 创建 .agent 目录
  const agentDir = path.join(TEST_DIR, '.agent');
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }
}

function teardown() {
  // 清理测试目录
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ============================================
// 测试用例
// ============================================

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===== RootCauseAnalyzer 构造测试 =====

test('should create analyzer with default rules', () => {
  const analyzer = new RootCauseAnalyzer();
  assert.ok(analyzer);
});

test('should create analyzer with custom workDir', () => {
  const analyzer = new RootCauseAnalyzer({ workDir: TEST_DIR });
  assert.ok(analyzer);
});

// ===== 外部失败归因测试 =====

test('should classify NETWORK error as external_failure', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-1',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'ECONNREFUSED connection failed',
    errorType: 'NETWORK',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'external_failure');
  assert.ok(result.confidence > 0.9);
});

test('should classify RATE_LIMIT error as external_failure', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-2',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'Rate limit exceeded',
    errorType: 'RATE_LIMIT',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'external_failure');
});

// ===== 能力缺失归因测试 =====

test('should classify "我不知道如何" as capability_missing', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-3',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '我不知道如何重构这个模块',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'capability_missing');
  assert.ok(result.gapReport.gap.name.includes('refactor') || result.gapReport.gap.name === 'unspecified_capability');
});

test('should classify "missing capability" as capability_missing', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-4',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'I cannot do this because missing capability refactoring',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'capability_missing');
});

// ===== 上下文不足归因测试 =====

test('should classify "缺少信息" as context_insufficient', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-5',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '缺少用户认证信息，无法完成登录',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'context_insufficient');
});

test('should classify "need more context" as context_insufficient', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-6',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'I need more context to understand the requirements',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'context_insufficient');
});

// ===== Agent 限制归因测试 =====

test('should classify token limit as agent_limitation', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-7',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'token limit exceeded, context too long',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'agent_limitation');
});

test('should classify "超出能力范围" as agent_limitation', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-8',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '这个任务超出了我的能力范围',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'agent_limitation');
});

// ===== 约束过严归因测试 =====

test('should classify L4 + retry > 3 as constraint_too_strict', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-9',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '测试未通过',
    context: {
      constraintLevel: 'L4',
      retryCount: 4,
      testPassed: false,
    },
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'constraint_too_strict');
});

// ===== Gap Report 生成测试 =====

test('should generate valid GapReport', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-10',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '我不知道如何优化这个算法',
    workDir: TEST_DIR,
  });
  
  const report = result.gapReport;
  
  assert.ok(report.id.startsWith('GAP-'));
  assert.ok(report.timestamp > 0);
  assert.strictEqual(report.executionId, 'test-exec-10');
  assert.strictEqual(report.workflowId, 'wf-test');
  assert.strictEqual(report.stepId, 'step-1');
  assert.ok(report.gap.type);
  assert.ok(report.gap.name);
  assert.ok(report.gap.description);
  assert.ok(['low', 'medium', 'high', 'critical'].includes(report.gap.severity));
  assert.ok(Array.isArray(report.suggestions));
  assert.ok(report.suggestions.length > 0);
  assert.strictEqual(report.status, 'open');
});

// ===== 建议生成测试 =====

test('should generate add_capability suggestion for capability_missing', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-11',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '我不知道如何重构代码',
    workDir: TEST_DIR,
  });
  
  const suggestions = result.gapReport.suggestions;
  const addCapability = suggestions.find(s => s.type === 'add_capability');
  
  assert.ok(addCapability);
  assert.ok(addCapability.recommended);
});

test('should generate adjust_constraint suggestion for constraint_too_strict', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-12',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '无法完成任务',
    context: {
      constraintLevel: 'L4',
      retryCount: 5,
      testPassed: false,
    },
    workDir: TEST_DIR,
  });
  
  const suggestions = result.gapReport.suggestions;
  const adjustConstraint = suggestions.find(s => s.type === 'adjust_constraint');
  
  assert.ok(adjustConstraint);
  assert.ok(adjustConstraint.recommended);
});

// ===== 严重性推断测试 =====

test('should set high severity for capability_missing', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-13',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: '我不知道如何做',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.gapReport.gap.severity, 'high');
});

test('should set low severity for external_failure', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-14',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'Network timeout',
    errorType: 'NETWORK',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.gapReport.gap.severity, 'low');
});

// ===== 未知原因测试 =====

test('should classify unknown error as unknown', () => {
  const result = analyzeRootCause({
    executionId: 'test-exec-15',
    workflowId: 'wf-test',
    stepId: 'step-1',
    errorMessage: 'Something went wrong but I am not sure what',
    workDir: TEST_DIR,
  });
  
  assert.strictEqual(result.rootCause, 'unknown');
  assert.ok(result.confidence < 0.5);
});

// ============================================
// 运行测试
// ============================================

async function runTests() {
  console.log('🧪 Root Cause Analyzer Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const { name, fn } of tests) {
    try {
      setup();
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    } finally {
      teardown();
    }
  }
  
  console.log(`\n📊 Results: ${passed}/${tests.length} passed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
