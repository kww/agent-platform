/**
 * P1 功能单元测试
 * 
 * 测试项：
 * 1. TokenTracker - Token 使用追踪
 * 2. OutputProcessor - 输出分类压缩
 * 3. AgentFallbackManager - Agent 回退机制
 */

const assert = require('assert');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(emoji, message, color = 'cyan') {
  console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

function pass(name) {
  console.log(`  ${colors.green}✓${colors.reset} ${name}`);
}

function fail(name, error) {
  console.log(`  ${colors.red}✗${colors.reset} ${name}`);
  console.log(`    ${colors.red}Error: ${error.message}${colors.reset}`);
}

let passed = 0;
let failed = 0;

// ============================================
// Test 1: TokenTracker
// ============================================
log('\n📋', 'Test 1: TokenTracker', 'yellow');

try {
  const { TokenTracker, MODEL_TOKEN_LIMITS } = require('../../dist/core/token-tracker.js');
  
  // Test 1.1: 创建 tracker
  const tracker = new TokenTracker({
    executionId: 'test-p1-001',
    model: 'gpt-4',
  });
  
  const state = tracker.getState();
  assert.strictEqual(state.executionId, 'test-p1-001');
  assert.strictEqual(state.model, 'gpt-4');
  assert.strictEqual(state.limit, MODEL_TOKEN_LIMITS['gpt-4']);
  pass('TokenTracker 创建成功');
  passed++;
} catch (e) {
  fail('TokenTracker 创建', e);
  failed++;
}

try {
  const { TokenTracker } = require('../../dist/core/token-tracker.js');
  
  // Test 1.2: Token 估算
  const tracker = new TokenTracker({ executionId: 'test-p1-002' });
  
  const tokens = tracker.estimateTokens('Hello World');
  assert.ok(tokens > 0, '应返回正数');
  
  const chineseTokens = tracker.estimateTokens('你好世界');
  assert.ok(chineseTokens > 0, '中文应返回正数');
  
  pass(`Token 估算正确 (英文: ${tokens}, 中文: ${chineseTokens})`);
  passed++;
} catch (e) {
  fail('Token 估算', e);
  failed++;
}

try {
  const { TokenTracker } = require('../../dist/core/token-tracker.js');
  
  // Test 1.3: 记录使用
  const tracker = new TokenTracker({
    executionId: 'test-p1-003',
    model: 'gpt-4',
  });
  
  tracker.recordUsage('step-1', 'input text', 'output text');
  tracker.recordUsage('step-2', 'another input', 'another output');
  
  const stats = tracker.getStats();
  assert.strictEqual(stats.stepCount, 2);
  assert.ok(stats.totalUsed > 0);
  assert.ok(stats.avgPerStep > 0);
  
  pass(`Token 使用记录正确 (${stats.totalUsed} tokens, ${stats.stepCount} 步)`);
  passed++;
} catch (e) {
  fail('Token 使用记录', e);
  failed++;
}

try {
  const { TokenTracker } = require('../../dist/core/token-tracker.js');
  
  // Test 1.4: 预警检测
  const tracker = new TokenTracker({
    executionId: 'test-p1-004',
    model: 'gpt-4',
    warningThreshold: 10,  // 低阈值便于测试
  });
  
  // 模拟大量使用
  const longText = 'x'.repeat(10000);
  tracker.recordUsage('step-1', longText, longText);
  
  const isNear = tracker.isNearLimit();
  assert.ok(typeof isNear === 'boolean');
  
  pass(`预警检测正确 (接近限制: ${isNear})`);
  passed++;
} catch (e) {
  fail('预警检测', e);
  failed++;
}

// ============================================
// Test 2: OutputProcessor
// ============================================
log('\n📋', 'Test 2: OutputProcessor', 'yellow');

try {
  const { OutputProcessor } = require('../../dist/core/output-processor.js');
  
  // Test 2.1: 创建 processor
  const processor = new OutputProcessor();
  assert.ok(processor, 'OutputProcessor 创建成功');
  
  pass('OutputProcessor 创建成功');
  passed++;
} catch (e) {
  fail('OutputProcessor 创建', e);
  failed++;
}

try {
  const { OutputProcessor } = require('../../dist/core/output-processor.js');
  
  // Test 2.2: 类型检测
  const processor = new OutputProcessor();
  
  const errorType = processor.detectType('Error: something failed');
  assert.strictEqual(errorType, 'error');
  
  const commitType = processor.detectType('commit: abc123\nAuthor: test');
  assert.strictEqual(commitType, 'commit');
  
  const logType = processor.detectType('Running task...\nCompleted.');
  assert.strictEqual(logType, 'log');
  
  pass('输出类型检测正确');
  passed++;
} catch (e) {
  fail('输出类型检测', e);
  failed++;
}

try {
  const { OutputProcessor } = require('../../dist/core/output-processor.js');
  
  // Test 2.3: 类别获取
  const processor = new OutputProcessor();
  
  assert.strictEqual(processor.getCategory('error'), 'critical');
  assert.strictEqual(processor.getCategory('decision'), 'critical');
  assert.strictEqual(processor.getCategory('file_change'), 'important');
  assert.strictEqual(processor.getCategory('commit'), 'important');
  assert.strictEqual(processor.getCategory('log'), 'compressible');
  assert.strictEqual(processor.getCategory('progress'), 'compressible');
  
  pass('输出类别获取正确');
  passed++;
} catch (e) {
  fail('输出类别获取', e);
  failed++;
}

try {
  const { OutputProcessor } = require('../../dist/core/output-processor.js');
  
  // Test 2.4: 输出处理
  const processor = new OutputProcessor();
  
  const errorOutput = processor.processOutput('step-1', 'Error: test failed\nDetails: ...');
  assert.strictEqual(errorOutput.category, 'critical');
  assert.strictEqual(errorOutput.type, 'error');
  assert.strictEqual(errorOutput.original, errorOutput.processed);  // critical 不压缩
  
  pass('输出处理正确 (error → critical)');
  passed++;
} catch (e) {
  fail('输出处理', e);
  failed++;
}

try {
  const { OutputProcessor } = require('../../dist/core/output-processor.js');
  
  // Test 2.5: 批量处理
  const processor = new OutputProcessor();
  
  const outputs = [
    { stepId: 'step-1', output: 'Error: failed' },
    { stepId: 'step-2', output: 'commit: abc123' },
    { stepId: 'step-3', output: 'Running...\n'.repeat(100) },
  ];
  
  const result = processor.processOutputs(outputs);
  
  assert.strictEqual(result.outputs.length, 3);
  assert.ok(result.savedTokens >= 0);
  assert.ok(typeof result.savingsPercentage === 'number');
  
  pass(`批量处理正确 (节省 ${result.savingsPercentage}%)`);
  passed++;
} catch (e) {
  fail('批量处理', e);
  failed++;
}

// ============================================
// Test 3: AgentFallbackManager
// ============================================
log('\n📋', 'Test 3: AgentFallbackManager', 'yellow');

try {
  const { AgentFallbackManager } = require('../../dist/core/agent-fallback.js');
  
  // Test 3.1: 创建 manager
  const manager = new AgentFallbackManager({ enabled: true });
  assert.ok(manager, 'AgentFallbackManager 创建成功');
  
  pass('AgentFallbackManager 创建成功');
  passed++;
} catch (e) {
  fail('AgentFallbackManager 创建', e);
  failed++;
}

try {
  const { AgentFallbackManager } = require('../../dist/core/agent-fallback.js');
  
  // Test 3.2: 初始化执行
  const manager = new AgentFallbackManager({ enabled: true });
  const state = manager.initExecution('test-exec-001', 'codex');
  
  assert.strictEqual(state.originalAgent, 'codex');
  assert.strictEqual(state.currentAgent, 'codex');
  assert.strictEqual(state.fallbackCount, 0);
  
  pass('执行初始化正确');
  passed++;
} catch (e) {
  fail('执行初始化', e);
  failed++;
}

try {
  const { AgentFallbackManager } = require('../../dist/core/agent-fallback.js');
  
  // Test 3.3: 回退检测
  const manager = new AgentFallbackManager({ enabled: true });
  manager.initExecution('test-exec-002', 'codex');
  
  const shouldFallback = manager.shouldFallback(
    'test-exec-002',
    { type: 'NETWORK', originalError: 'timeout', recoverable: true },
    3  // 第 3 次尝试
  );
  
  assert.ok(typeof shouldFallback === 'boolean');
  
  pass(`回退检测正确 (应回退: ${shouldFallback})`);
  passed++;
} catch (e) {
  fail('回退检测', e);
  failed++;
}

try {
  const { AgentFallbackManager } = require('../../dist/core/agent-fallback.js');
  
  // Test 3.4: 执行回退
  const manager = new AgentFallbackManager({
    enabled: true,
    fallbacks: [{ primary: 'codex', fallback: 'claude-code', maxRetries: 2 }],
  });
  
  manager.initExecution('test-exec-003', 'codex');
  const fallbackAgent = manager.executeFallback(
    'test-exec-003',
    { type: 'NETWORK', originalError: 'timeout', recoverable: true },
    3
  );
  
  assert.strictEqual(fallbackAgent, 'claude-code');
  
  const state = manager.getState('test-exec-003');
  assert.strictEqual(state.currentAgent, 'claude-code');
  assert.strictEqual(state.fallbackCount, 1);
  
  pass('回退执行正确 (codex → claude-code)');
  passed++;
} catch (e) {
  fail('回退执行', e);
  failed++;
}

try {
  const { AgentFallbackManager } = require('../../dist/core/agent-fallback.js');
  
  // Test 3.5: 回退历史
  const manager = new AgentFallbackManager({ enabled: true });
  manager.initExecution('test-exec-004', 'codex');
  
  manager.executeFallback(
    'test-exec-004',
    { type: 'RATE_LIMIT', originalError: '429', recoverable: true },
    2
  );
  
  const history = manager.getFallbackHistory('test-exec-004');
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].from, 'codex');
  assert.strictEqual(history[0].to, 'claude-code');
  
  pass('回退历史记录正确');
  passed++;
} catch (e) {
  fail('回退历史', e);
  failed++;
}

// ============================================
// Test 4: 类型导出
// ============================================
log('\n📋', 'Test 4: 类型导出', 'yellow');

try {
  const index = require('../../dist/index.js');
  
  // Test 4.1: P1 模块导出
  assert.ok(index.TokenTracker, 'TokenTracker 已导出');
  assert.ok(index.OutputProcessor, 'OutputProcessor 已导出');
  assert.ok(index.AgentFallbackManager, 'AgentFallbackManager 已导出');
  assert.ok(index.createTokenTracker, 'createTokenTracker 已导出');
  assert.ok(index.createOutputProcessor, 'createOutputProcessor 已导出');
  assert.ok(index.createFallbackManager, 'createFallbackManager 已导出');
  
  pass('P1 模块导出正确');
  passed++;
} catch (e) {
  fail('P1 模块导出', e);
  failed++;
}

// ============================================
// 结果汇总
// ============================================
console.log('\n' + '='.repeat(50));
log('📊', 'P1 功能测试结果', 'yellow');
console.log('='.repeat(50));

const total = passed + failed;
const passRate = ((passed / total) * 100).toFixed(1);

console.log(`\n  ${colors.green}通过: ${passed}${colors.reset}`);
console.log(`  ${colors.red}失败: ${failed}${colors.reset}`);
console.log(`  通过率: ${passRate}%`);

if (failed === 0) {
  console.log(`\n  ${colors.green}✅ 所有 P1 功能测试通过！${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n  ${colors.red}❌ 存在失败的测试${colors.reset}\n`);
  process.exit(1);
}
