/**
 * P2 功能测试
 * 
 * 测试内容：
 * 1. L0/L1 轻量工作流解析
 * 2. Backlog handlers
 * 3. Project State handlers
 * 4. 智能决策逻辑
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ============================================
// 测试工具
// ============================================

let passCount = 0;
let failCount = 0;
let pendingTests = 0;

function test(name, fn) {
  pendingTests++;
  try {
    fn();
    log(`  ✓ ${name}`, 'green');
    passCount++;
    pendingTests--;
  } catch (error) {
    log(`  ✗ ${name}`, 'red');
    log(`    ${error.message}`, 'red');
    failCount++;
    pendingTests--;
  }
}

async function asyncTest(name, fn) {
  pendingTests++;
  try {
    await fn();
    log(`  ✓ ${name}`, 'green');
    passCount++;
    pendingTests--;
  } catch (error) {
    log(`  ✗ ${name}`, 'red');
    log(`    ${error.message}`, 'red');
    failCount++;
    pendingTests--;
  }
}

function testSection(name) {
  log(`\n${colors.yellow}📋 ${name}${colors.reset}`);
}

// ============================================
// 导入模块
// ============================================

const { parseWorkflow } = require('../../dist/core/parser');
const { builtinHandlers } = require('../../dist/core/builtin-handlers');

// ============================================
// 测试开始
// ============================================

log('\n==================================================', 'blue');
log('  P2 功能测试', 'blue');
log('==================================================\n', 'blue');

// ============================================
// Test 1: L0/L1 工作流解析
// ============================================

testSection('Test 1: L0/L1 工作流解析');

test('wf-patch 解析成功', () => {
  const workflow = parseWorkflow('wf-patch');
  assert.ok(workflow, 'Workflow should exist');
  assert.strictEqual(workflow.id, 'wf-patch', 'ID should match');
  assert.strictEqual(workflow.steps.length, 2, 'Should have 2 steps');
  assert.strictEqual(workflow.config?.ironLaws, false, 'Iron Laws should be false');
  assert.strictEqual(workflow.config?.skipTests, true, 'Should skip tests');
});

test('wf-bugfix 解析成功', () => {
  const workflow = parseWorkflow('wf-bugfix');
  assert.ok(workflow, 'Workflow should exist');
  assert.strictEqual(workflow.id, 'wf-bugfix', 'ID should match');
  assert.strictEqual(workflow.steps.length, 4, 'Should have 4 steps');
  assert.ok(workflow.retry, 'Should have retry config');
  assert.strictEqual(workflow.retry.maxAttempts, 2, 'Should have 2 retry attempts');
});

test('wf-quick 解析成功', () => {
  const workflow = parseWorkflow('wf-quick');
  assert.ok(workflow, 'Workflow should exist');
  assert.strictEqual(workflow.id, 'wf-quick', 'ID should match');
  assert.strictEqual(workflow.steps.length, 4, 'Should have 4 steps');
  assert.strictEqual(workflow.config?.ironLaws, true, 'Iron Laws should be true');
});

test('工作流层级正确', () => {
  const patch = parseWorkflow('wf-patch');
  const bugfix = parseWorkflow('wf-bugfix');
  const quick = parseWorkflow('wf-quick');
  
  // L0: 无验证
  assert.strictEqual(patch.config?.skipTests, true, 'L0 should skip tests');
  
  // L1: 轻量验证
  assert.strictEqual(bugfix.config?.runTests, true, 'L1 should run tests');
  assert.strictEqual(quick.config?.runTests, true, 'L1 should run tests');
});

// ============================================
// Test 2: Backlog Handlers
// ============================================

testSection('Test 2: Backlog Handlers');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-test-'));
const projectPath = testDir;

asyncTest('backlog/add 创建待办项', async () => {
  const handler = builtinHandlers['backlog/add'];
  assert.ok(handler, 'Handler should exist');
  
  const result = await handler({
    project_path: projectPath,
    item: {
      type: 'bug',
      title: 'Test bug',
      priority: 'high',
      labels: ['test'],
      description: 'Test description',
    },
  }, { workdir: projectPath });
  
  assert.ok(result.success, 'Should succeed');
  assert.ok(result.item, 'Should return item');
  assert.ok(result.item.id.startsWith('BUG-'), 'ID should start with BUG-');
  assert.strictEqual(result.item.status, 'open', 'Status should be open');
});

asyncTest('backlog/list 列出待办项', async () => {
  const handler = builtinHandlers['backlog/list'];
  
  const result = await handler({
    project_path: projectPath,
  }, { workdir: projectPath });
  
  assert.ok(Array.isArray(result.items), 'Items should be array');
  assert.ok(result.stats, 'Should have stats');
  assert.strictEqual(result.items.length, 1, 'Should have 1 item');
});

asyncTest('backlog/add 添加 feature 类型', async () => {
  const handler = builtinHandlers['backlog/add'];
  
  const result = await handler({
    project_path: projectPath,
    item: {
      type: 'feature',
      title: 'Test feature',
      priority: 'medium',
    },
  }, { workdir: projectPath });
  
  assert.ok(result.item.id.startsWith('FEAT-'), 'ID should start with FEAT-');
});

asyncTest('backlog/update 更新待办项', async () => {
  const handler = builtinHandlers['backlog/update'];
  
  const result = await handler({
    project_path: projectPath,
    item_id: 'BUG-001',
    priority: 'critical',
  }, { workdir: projectPath });
  
  assert.ok(result.success, 'Should succeed');
  assert.strictEqual(result.item.priority, 'critical', 'Priority should be updated');
});

asyncTest('backlog/list 按类型过滤', async () => {
  const handler = builtinHandlers['backlog/list'];
  
  const result = await handler({
    project_path: projectPath,
    type: 'bug',
  }, { workdir: projectPath });
  
  assert.strictEqual(result.items.length, 1, 'Should have 1 bug');
  assert.strictEqual(result.items[0].type, 'bug', 'Type should be bug');
});

asyncTest('backlog/decide 智能决策', async () => {
  const handler = builtinHandlers['backlog/decide'];
  
  const result = await handler({
    project_path: projectPath,
  }, { workdir: projectPath });
  
  assert.ok(result.recommendation, 'Should have recommendation');
  // BUG-001 是 critical priority，应该被推荐
  assert.strictEqual(result.recommendation.id, 'BUG-001', 'Should recommend BUG-001');
  assert.strictEqual(result.suggested_workflow, 'wf-bugfix', 'Should suggest wf-bugfix for bug type');
  assert.ok(result.queue, 'Should have queue');
  assert.ok(result.reason, 'Should have reason');
});

asyncTest('backlog/update 状态更新', async () => {
  const handler = builtinHandlers['backlog/update'];
  
  const result = await handler({
    project_path: projectPath,
    item_id: 'BUG-001',
    status: 'in_progress',
  }, { workdir: projectPath });
  
  assert.ok(result.success, 'Should succeed');
  assert.strictEqual(result.item.status, 'in_progress', 'Status should be updated');
});

asyncTest('backlog/resolve 解决待办项', async () => {
  const handler = builtinHandlers['backlog/resolve'];
  
  const result = await handler({
    project_path: projectPath,
    item_id: 'BUG-001',
    resolution: 'Fixed by test',
    workflow_execution_id: 'test-exec-001',
  }, { workdir: projectPath });
  
  assert.ok(result.success, 'Should succeed');
  assert.strictEqual(result.item.status, 'resolved', 'Status should be resolved');
  assert.ok(result.item.resolved_at, 'Should have resolved_at');
});

// ============================================
// Test 3: Project State Handlers
// ============================================

testSection('Test 3: Project State Handlers');

const stateTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-state-test-'));
const stateProjectPath = stateTestDir;

asyncTest('project/load-state 不存在时返回空', async () => {
  const handler = builtinHandlers['project/load-state'];
  
  const result = await handler({
    project_path: stateProjectPath,
  }, { workdir: stateProjectPath });
  
  assert.strictEqual(result.exists, false, 'Should not exist');
  assert.strictEqual(result.state, null, 'State should be null');
});

asyncTest('project/save-state 保存状态', async () => {
  const handler = builtinHandlers['project/save-state'];
  
  const result = await handler({
    project_path: stateProjectPath,
    state: {
      project: {
        name: 'test-project',
        phase: 'development',
      },
      last_run: {
        workflow: 'wf-full',
        execution_id: 'exec-001',
        status: 'completed',
        completed_at: new Date().toISOString(),
      },
    },
  }, { workdir: stateProjectPath });
  
  assert.ok(result.success, 'Should succeed');
  assert.strictEqual(result.state.project.name, 'test-project', 'Name should match');
  assert.strictEqual(result.state.stats.total_executions, 1, 'Should have 1 execution');
});

asyncTest('project/load-state 加载已保存状态', async () => {
  const handler = builtinHandlers['project/load-state'];
  
  const result = await handler({
    project_path: stateProjectPath,
  }, { workdir: stateProjectPath });
  
  assert.strictEqual(result.exists, true, 'Should exist');
  assert.strictEqual(result.state.project.name, 'test-project', 'Name should match');
});

asyncTest('project/save-state 更新状态', async () => {
  const handler = builtinHandlers['project/save-state'];
  
  const result = await handler({
    project_path: stateProjectPath,
    state: {
      project: {
        phase: 'testing',
      },
      last_run: {
        workflow: 'wf-test',
        execution_id: 'exec-002',
        status: 'completed',
        completed_at: new Date().toISOString(),
      },
    },
  }, { workdir: stateProjectPath });
  
  assert.strictEqual(result.state.project.phase, 'testing', 'Phase should be updated');
  assert.strictEqual(result.state.stats.total_executions, 2, 'Should have 2 executions');
  assert.strictEqual(result.state.stats.by_workflow['wf-test'], 1, 'Should have wf-test count');
});

// ============================================
// Test 4: 决策逻辑
// ============================================

testSection('Test 4: 智能决策逻辑');

asyncTest('decide-next-workflow 无任务时返回 ask_user', async () => {
  const handler = builtinHandlers['decide-next-workflow'];
  
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decide-empty-'));
  
  const result = await handler({
    project_path: emptyDir,
  }, { workdir: emptyDir });
  
  assert.strictEqual(result.decision, 'ask_user', 'Should ask user');
  assert.ok(result.suggestions, 'Should have suggestions');
  
  fs.rmSync(emptyDir, { recursive: true });
});

asyncTest('decide-next-workflow 有 tasks.yml 时返回 wf-continue', async () => {
  const handler = builtinHandlers['decide-next-workflow'];
  
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decide-task-'));
  
  // 创建 tasks.yml
  const tasksYml = `
project: test
tasks:
  - id: task-1
    name: Task 1
    status: pending
`;
  fs.writeFileSync(path.join(taskDir, 'tasks.yml'), tasksYml);
  
  const result = await handler({
    project_path: taskDir,
  }, { workdir: taskDir });
  
  assert.strictEqual(result.decision, 'wf-continue', 'Should suggest wf-continue');
  assert.ok(result.reason.includes('pending tasks'), 'Reason should mention pending tasks');
  
  fs.rmSync(taskDir, { recursive: true });
});

asyncTest('decide-next-workflow 有 backlog bug 时返回 wf-bugfix', async () => {
  const handler = builtinHandlers['decide-next-workflow'];
  
  const backlogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decide-backlog-'));
  
  // 创建 backlog.yml
  const backlogYml = `
project:
  name: test
items:
  - id: BUG-001
    type: bug
    title: Critical bug
    priority: critical
    status: open
`;
  fs.mkdirSync(path.join(backlogDir, '.agent'), { recursive: true });
  fs.writeFileSync(path.join(backlogDir, '.agent', 'backlog.yml'), backlogYml);
  
  const result = await handler({
    project_path: backlogDir,
  }, { workdir: backlogDir });
  
  assert.strictEqual(result.decision, 'wf-bugfix', 'Should suggest wf-bugfix');
  assert.ok(result.backlog_item, 'Should have backlog item');
  
  fs.rmSync(backlogDir, { recursive: true });
});

// ============================================
// 清理
// ============================================

testSection('清理测试环境');

test('清理测试目录', () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.rmSync(stateTestDir, { recursive: true, force: true });
  assert.ok(true, 'Cleanup successful');
});

// ============================================
// 测试汇总
// ============================================

function printSummary() {
  // 等待异步测试完成
  if (pendingTests > 0) {
    setTimeout(printSummary, 100);
    return;
  }
  
  log('\n==================================================', 'blue');
  log(`测试结果: ${passCount} 通过, ${failCount} 失败`, 'blue');
  log('==================================================\n', 'blue');

  if (failCount > 0) {
    process.exit(1);
  }
}

// 延迟输出，等待异步测试完成
setTimeout(printSummary, 500);
