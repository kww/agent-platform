/**
 * Tool 执行器
 * SEC-006: 集成命令黑名单（使用 @dommaker/harness CommandGate）
 */

import { parseTool } from '../core/parser';
import { ExecutionContext, Tool } from '../core/types';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandGate, createCommandGate } from '@dommaker/harness';

const execAsync = promisify(exec);

// 使用 harness CommandGate
const commandGate = createCommandGate();

/**
 * 执行 Tool
 */
export async function executeTool(
  name: string,
  input: Record<string, any>,
  context: ExecutionContext
): Promise<any> {
  const tool = parseTool(name);
  
  context.eventEmitter.emit('tool.started', {
    name,
    input
  });
  
  try {
    let result: any;
    
    // 内置工具
    if (isBuiltinTool(name)) {
      result = await executeBuiltinTool(tool, input, context);
    } else {
      // 外部脚本
      result = await executeScript(tool, input, context);
    }
    
    context.eventEmitter.emit('tool.completed', {
      name,
      result
    });
    
    return result;
    
  } catch (error) {
    context.eventEmitter.emit('tool.failed', {
      name,
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * 判断是否为内置工具
 */
function isBuiltinTool(name: string): boolean {
  const builtins = [
    'spawn-codex',
    'file-read',
    'file-write',
    'file-copy',
    'git-clone',
    'git-branch',
    'git-checkout',
    'git-status',
    'git-commit',
    'git-push',
    'npm-install',
    'npm-run',
    'docker-build',
    'docker-run',
  ];
  return builtins.includes(name);
}

/**
 * 执行内置工具
 */
async function executeBuiltinTool(
  tool: Tool,
  input: Record<string, any>,
  context: ExecutionContext
): Promise<any> {
  const name = tool.name;
  
  switch (name) {
    case 'spawn-codex':
      return await executeSpawnCodex(input, context);
    
    case 'file-read':
      return await executeFileRead(input, context);
    
    case 'file-write':
      return await executeFileWrite(input, context);
    
    case 'file-copy':
      return await executeFileCopy(input, context);
    
    case 'git-clone':
      return await executeGitClone(input, context);
    
    case 'git-branch':
      return await executeGitBranch(input, context);
    
    case 'git-checkout':
      return await executeGitCheckout(input, context);
    
    case 'git-status':
      return await executeGitStatus(input, context);
    
    case 'git-commit':
      return await executeGitCommit(input, context);
    
    case 'git-push':
      return await executeGitPush(input, context);
    
    case 'npm-install':
      return await executeNpmInstall(input, context);
    
    case 'npm-run':
      return await executeNpmRun(input, context);
    
    default:
      throw new Error(`Unknown builtin tool: ${name}`);
  }
}

/**
 * 执行外部脚本
 * SEC-006: 使用 harness CommandGate 检查命令黑名单
 */
async function executeScript(
  tool: Tool,
  input: Record<string, any>,
  context: ExecutionContext
): Promise<any> {
  if (!tool.script) {
    throw new Error(`Tool ${tool.name} has no script`);
  }
  
  // 替换脚本中的变量
  let script = tool.script;
  for (const [key, value] of Object.entries(input)) {
    script = script.replace(new RegExp(`\\$${key}`, 'g'), String(value));
  }
  
  // SEC-006: 使用 harness CommandGate 检查命令
  const gateResult = await commandGate.check(script);
  
  if (!gateResult.passed) {
    context.eventEmitter.emit('tool.blocked', {
      name: tool.name,
      script,
      blocked: gateResult.details?.blocked,
    });
    throw new Error(`命令被黑名单拦截:\n${gateResult.message}`);
  }
  
  // 记录警告和审计
  if (gateResult.details && gateResult.details.warnings?.length > 0) {
    context.eventEmitter.emit('tool.warning', {
      name: tool.name,
      script,
      warnings: gateResult.details.warnings,
    });
  }
  
  if (gateResult.details && gateResult.details.audits?.length > 0) {
    context.eventEmitter.emit('tool.audit', {
      name: tool.name,
      script,
      audits: gateResult.details.audits,
    });
  }
  
  const { stdout, stderr } = await execAsync(script, {
    cwd: context.workdir,
    timeout: tool.timeout || 60000,
  });
  
  return {
    stdout,
    stderr,
    success: !stderr
  };
}

// ========== 内置工具实现 ==========

async function executeSpawnCodex(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const { spawnCodex } = await import('./spawn');
  return await spawnCodex({
    prompt: input.prompt,
    workdir: input.workdir || context.workdir,
    timeout: input.timeout,
  });
}

async function executeFileRead(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const fs = await import('fs');
  const path = await import('path');
  
  const filePath = path.resolve(context.workdir, input.path);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  return { content, path: filePath };
}

async function executeFileWrite(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const fs = await import('fs');
  const path = await import('path');
  
  const filePath = path.resolve(context.workdir, input.path);
  fs.writeFileSync(filePath, input.content, 'utf-8');
  
  return { success: true, path: filePath };
}

async function executeFileCopy(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const fs = await import('fs');
  const path = await import('path');
  
  const src = path.resolve(context.workdir, input.src);
  const dest = path.resolve(context.workdir, input.dest);
  
  fs.copyFileSync(src, dest);
  
  return { success: true, src, dest };
}

async function executeGitClone(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const url = input.url;
  const dir = input.dir || '';
  
  const cmd = dir ? `git clone ${url} ${dir}` : `git clone ${url}`;
  const { stdout, stderr } = await execAsync(cmd, { cwd: context.workdir });
  
  return { stdout, stderr, success: !stderr };
}

async function executeGitCommit(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const message = input.message;
  
  await execAsync('git add -A', { cwd: context.workdir });
  const { stdout, stderr } = await execAsync(`git commit -m "${message}"`, { cwd: context.workdir });
  
  return { stdout, stderr, success: true };
}

async function executeGitPush(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const remote = input.remote || 'origin';
  const branch = input.branch || 'master';
  
  const { stdout, stderr } = await execAsync(`git push ${remote} ${branch}`, { cwd: context.workdir });
  
  return { stdout, stderr, success: true };
}

async function executeNpmInstall(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const { stdout, stderr } = await execAsync('npm install', { cwd: context.workdir });
  return { stdout, stderr, success: true };
}

async function executeNpmRun(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const script = input.script;
  const { stdout, stderr } = await execAsync(`npm run ${script}`, { cwd: context.workdir });
  return { stdout, stderr, success: true };
}

async function executeGitBranch(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const branchName = input.branch_name;
  const fromBranch = input.from || 'main';
  
  // 创建新分支并切换到该分支
  const cmd = `git checkout -b ${branchName} ${fromBranch}`;
  const { stdout, stderr } = await execAsync(cmd, { cwd: context.workdir });
  
  return { stdout, stderr, success: !stderr, branch: branchName };
}

async function executeGitCheckout(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const branch = input.branch;
  
  const { stdout, stderr } = await execAsync(`git checkout ${branch}`, { cwd: context.workdir });
  
  return { stdout, stderr, success: !stderr, branch };
}

async function executeGitStatus(input: Record<string, any>, context: ExecutionContext): Promise<any> {
  const { stdout, stderr } = await execAsync('git status --porcelain', { cwd: context.workdir });
  
  // 解析状态输出
  const lines = stdout.trim().split('\n').filter(Boolean);
  const files = lines.map(line => ({
    status: line.substring(0, 2).trim(),
    path: line.substring(3).trim()
  }));
  
  return { 
    stdout, 
    stderr, 
    success: true, 
    isClean: files.length === 0,
    files 
  };
}
