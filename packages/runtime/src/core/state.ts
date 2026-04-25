/**
 * 执行状态管理
 * 
 * 功能：
 * 1. 记录工作流执行状态
 * 2. 支持断点续传
 * 3. 增量执行
 * 4. 🆕 AR-009 增量保存（分离存储 + 惰性加载）
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import type { ExecutionResult, StepResult } from '../core/types';

const STATE_DIR = '.agent-runtime';
const STATE_FILE = 'state.json';
const STEPS_DIR = 'steps';

/**
 * 获取状态文件路径
 */
export function getStatePath(workdir: string): string {
  return path.join(workdir, STATE_DIR, STATE_FILE);
}

/**
 * 获取步骤目录路径
 */
export function getStepsDir(workdir: string): string {
  return path.join(workdir, STATE_DIR, STEPS_DIR);
}

/**
 * 获取单个步骤文件路径
 */
export function getStepPath(workdir: string, stepId: string): string {
  return path.join(getStepsDir(workdir), `${stepId}.json`);
}

export interface WorkflowState {
  executionId: string;
  workflowId: string;
  gitCommitHash: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  steps: Record<string, StepState>;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error?: string;
}

export interface StepState {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: string;
  endTime?: string;
  output?: any;
  error?: string;
  cacheKey?: string;
}

// ========== 基础 API（现有） ==========

/**
 * 加载工作流状态
 */
export async function loadState(workdir: string): Promise<WorkflowState | null> {
  const statePath = getStatePath(workdir);
  
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 保存工作流状态（全量）
 */
export async function saveState(workdir: string, state: WorkflowState): Promise<void> {
  const statePath = getStatePath(workdir);
  const stateDir = path.dirname(statePath);
  
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * 创建初始状态
 */
export async function createInitialState(
  workdir: string,
  executionId: string,
  workflowId: string,
  inputs: Record<string, any>
): Promise<WorkflowState> {
  const gitCommitHash = await getGitCommitHash(workdir);
  
  return {
    executionId,
    workflowId,
    gitCommitHash,
    status: 'running',
    startTime: new Date().toISOString(),
    steps: {},
    inputs,
    outputs: {}
  };
}

/**
 * 更新步骤状态（全量写入）
 */
export async function updateStepState(
  workdir: string,
  state: WorkflowState,
  stepId: string,
  stepResult: Partial<StepState>
): Promise<WorkflowState> {
  state.steps[stepId] = {
    ...state.steps[stepId],
    ...stepResult
  };
  
  await saveState(workdir, state);
  return state;
}

// ========== 🆕 AR-009 增量保存 API ==========

/**
 * 增量更新步骤状态（只写入单个步骤）
 * 
 * 将步骤状态分离到独立文件，避免全量写入。
 * 
 * @param workdir 工作目录
 * @param stepId 步骤 ID
 * @param stepState 步骤状态
 */
export async function updateStepStateIncremental(
  workdir: string,
  stepId: string,
  stepState: StepState
): Promise<void> {
  const stepPath = getStepPath(workdir, stepId);
  
  // 🔧 修复：确保文件路径的完整父目录存在（处理 stepId 包含 '/' 的情况）
  const stepDir = path.dirname(stepPath);
  await fs.mkdir(stepDir, { recursive: true });
  
  // 只写入单个步骤文件
  await fs.writeFile(stepPath, JSON.stringify(stepState, null, 2));
}

/**
 * 更新核心状态（不含步骤 output）
 * 
 * 用于更新 state.json，但不包含大字段。
 */
export async function updateCoreState(
  workdir: string,
  updates: Partial<WorkflowState>
): Promise<void> {
  const statePath = getStatePath(workdir);
  
  // 加载现有状态
  let state: WorkflowState;
  try {
    const content = await fs.readFile(statePath, 'utf-8');
    state = JSON.parse(content);
  } catch {
    // 文件不存在，创建默认状态
    state = {
      executionId: '',
      workflowId: '',
      gitCommitHash: '',
      status: 'running',
      startTime: new Date().toISOString(),
      steps: {},
      inputs: {},
      outputs: {}
    };
  }
  
  // 合并更新
  state = { ...state, ...updates };
  
  // 清空 steps 中的 output（分离存储）
  for (const stepId of Object.keys(state.steps)) {
    delete state.steps[stepId].output;
  }
  
  // 写入核心状态（轻量）
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

/**
 * 加载单个步骤状态（含 output）
 * 
 * 惰性加载，按需从分离文件读取。
 */
export async function loadStepState(workdir: string, stepId: string): Promise<StepState | null> {
  const stepPath = getStepPath(workdir, stepId);
  
  try {
    const content = await fs.readFile(stepPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 加载步骤 output（惰性加载）
 */
export async function loadStepOutput(workdir: string, stepId: string): Promise<any> {
  const stepState = await loadStepState(workdir, stepId);
  return stepState?.output ?? null;
}

/**
 * 加载所有步骤状态（含 output）
 * 
 * 从分离文件加载所有步骤，合并完整状态。
 */
export async function loadFullState(workdir: string): Promise<WorkflowState | null> {
  const state = await loadState(workdir);
  
  if (!state) return null;
  
  // 惰性加载每个步骤的 output
  const stepsDir = getStepsDir(workdir);
  
  try {
    const files = await fs.readdir(stepsDir);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const stepId = file.replace('.json', '');
      const stepState = await loadStepState(workdir, stepId);
      
      if (stepState) {
        state.steps[stepId] = stepState;
      }
    }
  } catch {
    // steps 目录不存在，忽略
  }
  
  return state;
}

/**
 * 判断是否使用增量存储
 * 
 * 检查 steps 目录是否存在。
 */
export function isIncrementalStorage(workdir: string): boolean {
  const stepsDir = getStepsDir(workdir);
  return fsSync.existsSync(stepsDir);
}

/**
 * 迁移到增量存储
 * 
 * 将现有 state.json 中的步骤分离到独立文件。
 */
export async function migrateToIncremental(workdir: string): Promise<void> {
  const state = await loadState(workdir);
  
  if (!state || isIncrementalStorage(workdir)) return;
  
  const stepsDir = getStepsDir(workdir);
  await fs.mkdir(stepsDir, { recursive: true });
  
  // 分离每个步骤
  for (const [stepId, stepState] of Object.entries(state.steps)) {
    const stepPath = getStepPath(workdir, stepId);
    await fs.writeFile(stepPath, JSON.stringify(stepState, null, 2));
  }
  
  // 更新 state.json，移除 output
  for (const stepId of Object.keys(state.steps)) {
    delete state.steps[stepId].output;
  }
  
  await saveState(workdir, state);
  
  console.log(`📦 已迁移到增量存储: ${Object.keys(state.steps).length} 步骤`);
}

// ========== 其他 API（现有） ==========

/**
 * 标记工作流完成
 */
export async function completeState(
  workdir: string,
  state: WorkflowState,
  outputs: Record<string, any>,
  status: 'completed' | 'failed' | 'cancelled' = 'completed',
  error?: string
): Promise<WorkflowState> {
  state.status = status;
  state.endTime = new Date().toISOString();
  state.outputs = outputs;
  if (error) {
    state.error = error;
  }
  
  await saveState(workdir, state);
  return state;
}

/**
 * 检查是否可以恢复
 */
export async function canResume(
  workdir: string,
  workflowId: string
): Promise<{ canResume: boolean; completedSteps: string[]; state?: WorkflowState }> {
  // 🆕 使用 loadFullState 加载完整状态
  const state = await loadFullState(workdir);
  
  if (!state) {
    return { canResume: false, completedSteps: [] };
  }
  
  // 检查 workflow 是否匹配
  if (state.workflowId !== workflowId) {
    return { canResume: false, completedSteps: [] };
  }
  
  // 检查状态是否为 running 或 failed
  if (state.status !== 'running' && state.status !== 'failed') {
    return { canResume: false, completedSteps: [] };
  }
  
  // 检查 git commit 是否变化
  const currentHash = await getGitCommitHash(workdir);
  if (state.gitCommitHash !== currentHash) {
    console.log('⚠️ Git commit changed, cannot resume');
    return { canResume: false, completedSteps: [] };
  }
  
  // 获取已完成的步骤
  const completedSteps = Object.entries(state.steps)
    .filter(([_, step]) => step.status === 'completed')
    .map(([id]) => id);
  
  return {
    canResume: true,
    completedSteps,
    state
  };
}

/**
 * 获取 git commit hash
 */
async function getGitCommitHash(workdir: string): Promise<string> {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: workdir });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * 清理状态
 */
export async function clearState(workdir: string): Promise<void> {
  const statePath = getStatePath(workdir);
  const stepsDir = getStepsDir(workdir);
  
  try {
    await fs.unlink(statePath);
  } catch {
    // 文件不存在，忽略
  }
  
  // 🆕 清理步骤目录
  try {
    const files = await fs.readdir(stepsDir);
    for (const file of files) {
      await fs.unlink(path.join(stepsDir, file));
    }
    await fs.rmdir(stepsDir);
  } catch {
    // 目录不存在，忽略
  }
}
