#!/usr/bin/env node
/**
 * Golden Master CLI
 * 
 * 用法:
 *   npm run golden:list          - 列出所有 Golden Masters
 *   npm run golden:record <id>   - 录制指定工作流
 *   npm run golden:verify <id>   - 验证指定工作流
 *   npm run golden:verify-all    - 验证所有工作流
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const GOLDEN_MASTERS_DIR = path.join(__dirname, '../../golden-masters');
const WORKFLOWS_DIR = path.join(__dirname, '../../../agent-workflows/workflows');

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function listGoldenMasters() {
  log('blue', '=== Golden Masters ===');
  
  if (!fs.existsSync(GOLDEN_MASTERS_DIR)) {
    log('yellow', 'No golden masters recorded yet.');
    return;
  }

  const masters = fs.readdirSync(GOLDEN_MASTERS_DIR)
    .filter(name => {
      const dir = path.join(GOLDEN_MASTERS_DIR, name);
      return fs.statSync(dir).isDirectory() && 
             fs.existsSync(path.join(dir, 'output.json'));
    });

  if (masters.length === 0) {
    log('yellow', 'No golden masters found.');
    return;
  }

  masters.forEach(master => {
    const metadataPath = path.join(GOLDEN_MASTERS_DIR, master, 'metadata.json');
    let recordedAt = 'unknown';
    
    if (fs.existsSync(metadataPath)) {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      recordedAt = new Date(metadata.recordedAt).toLocaleString();
    }
    
    console.log(`  ${colors.green}✓${colors.reset} ${master} (recorded: ${recordedAt})`);
  });

  console.log('');
  log('blue', `Total: ${masters.length} golden masters`);
}

function recordGoldenMaster(workflowId: string) {
  log('blue', `=== Recording Golden Master: ${workflowId} ===`);
  
  // 检查工作流是否存在
  const workflowPath = path.join(WORKFLOWS_DIR, `${workflowId}.yml`);
  if (!fs.existsSync(workflowPath)) {
    log('red', `Workflow not found: ${workflowId}`);
    log('yellow', `Available workflows:`);
    
    if (fs.existsSync(WORKFLOWS_DIR)) {
      const workflows = fs.readdirSync(WORKFLOWS_DIR)
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''));
      workflows.forEach(w => console.log(`  - ${w}`));
    }
    process.exit(1);
  }

  // 执行录制
  log('yellow', 'Starting workflow execution...');
  
  try {
    // 使用 ts-node 执行测试
    const testCmd = `npx ts-node -e "
      const { recordGoldenMaster } = require('./src/monitoring/golden-master');
      const { executeWorkflow } = require('./src/core/executor');
      
      (async () => {
        const input = { project_path: '/tmp/golden-test-' + Date.now() };
        await recordGoldenMaster('${workflowId}', input, executeWorkflow);
        console.log('Recording completed!');
      })().catch(console.error);
    "`;
    
    execSync(testCmd, { stdio: 'inherit' });
    log('green', `✓ Golden Master recorded: ${workflowId}`);
  } catch (error) {
    log('red', `Failed to record: ${error}`);
    process.exit(1);
  }
}

function verifyGoldenMaster(workflowId: string) {
  log('blue', `=== Verifying Golden Master: ${workflowId} ===`);
  
  const masterPath = path.join(GOLDEN_MASTERS_DIR, workflowId);
  
  if (!fs.existsSync(masterPath)) {
    log('red', `Golden Master not found: ${workflowId}`);
    log('yellow', 'Run `npm run golden:record ' + workflowId + '` first.');
    process.exit(1);
  }

  try {
    // 执行验证
    const testCmd = `npx jest --testNamePattern="Golden Master" --testPathPattern="golden-master"`;
    execSync(testCmd, { stdio: 'inherit' });
    log('green', `✓ Verification passed: ${workflowId}`);
  } catch (error) {
    log('red', `✗ Verification failed: ${workflowId}`);
    process.exit(1);
  }
}

function verifyAllGoldenMasters() {
  log('blue', '=== Verifying All Golden Masters ===');
  
  if (!fs.existsSync(GOLDEN_MASTERS_DIR)) {
    log('yellow', 'No golden masters to verify.');
    return;
  }

  const masters = fs.readdirSync(GOLDEN_MASTERS_DIR)
    .filter(name => {
      const dir = path.join(GOLDEN_MASTERS_DIR, name);
      return fs.statSync(dir).isDirectory() && 
             fs.existsSync(path.join(dir, 'output.json'));
    });

  if (masters.length === 0) {
    log('yellow', 'No golden masters found.');
    return;
  }

  let passed = 0;
  let failed = 0;

  for (const master of masters) {
    try {
      verifyGoldenMaster(master);
      passed++;
    } catch {
      failed++;
    }
  }

  console.log('');
  log('blue', `=== Summary ===`);
  log('green', `Passed: ${passed}`);
  if (failed > 0) {
    log('red', `Failed: ${failed}`);
    process.exit(1);
  }
}

// CLI 入口
const args = process.argv.slice(2);
const command = args[0];
const target = args[1];

switch (command) {
  case 'list':
    listGoldenMasters();
    break;
  case 'record':
    if (!target) {
      log('red', 'Usage: npm run golden:record <workflow-id>');
      process.exit(1);
    }
    recordGoldenMaster(target);
    break;
  case 'verify':
    if (!target) {
      log('red', 'Usage: npm run golden:verify <workflow-id>');
      process.exit(1);
    }
    verifyGoldenMaster(target);
    break;
  case 'verify-all':
    verifyAllGoldenMasters();
    break;
  default:
    console.log('Golden Master CLI');
    console.log('');
    console.log('Usage:');
    console.log('  npm run golden:list          List all golden masters');
    console.log('  npm run golden:record <id>   Record a workflow');
    console.log('  npm run golden:verify <id>   Verify a workflow');
    console.log('  npm run golden:verify-all    Verify all workflows');
}