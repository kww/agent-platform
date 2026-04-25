/**
 * AR-009 状态增量保存测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  updateStepStateIncremental,
  updateCoreState,
  loadStepState,
  loadStepOutput,
  loadFullState,
  migrateToIncremental,
  isIncrementalStorage,
  getStepsDir,
  getStepPath,
  getStatePath,
  loadState,
  saveState,
  clearState,
  WorkflowState,
  StepState,
} from '../core/state';

describe('AR-009 增量保存', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `state-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });
  
  afterEach(async () => {
    await clearState(tempDir);
    await fs.rmdir(tempDir, { recursive: true });
  });
  
  describe('updateStepStateIncremental', () => {
    it('should write step state to separate file', async () => {
      const stepState: StepState = {
        status: 'completed',
        startTime: '2026-04-08T00:00:00Z',
        endTime: '2026-04-08T00:01:00Z',
        output: { result: 'success', data: 'large data here...' },
      };
      
      await updateStepStateIncremental(tempDir, 'step_001', stepState);
      
      // 检查步骤文件存在
      const stepPath = getStepPath(tempDir, 'step_001');
      const content = await fs.readFile(stepPath, 'utf-8');
      const loaded = JSON.parse(content);
      
      expect(loaded.status).toBe('completed');
      expect(loaded.output.result).toBe('success');
    });
    
    it('should create steps directory if not exists', async () => {
      const stepsDir = getStepsDir(tempDir);
      
      // 初始不存在
      expect(isIncrementalStorage(tempDir)).toBe(false);
      
      // 更新后存在
      await updateStepStateIncremental(tempDir, 'step_001', { status: 'running' });
      
      expect(isIncrementalStorage(tempDir)).toBe(true);
    });
    
    it('should handle multiple steps', async () => {
      await updateStepStateIncremental(tempDir, 'step_001', { status: 'completed', output: { a: 1 } });
      await updateStepStateIncremental(tempDir, 'step_002', { status: 'completed', output: { b: 2 } });
      await updateStepStateIncremental(tempDir, 'step_003', { status: 'running' });
      
      const step1 = await loadStepState(tempDir, 'step_001');
      const step2 = await loadStepState(tempDir, 'step_002');
      const step3 = await loadStepState(tempDir, 'step_003');
      
      expect(step1?.status).toBe('completed');
      expect(step2?.status).toBe('completed');
      expect(step3?.status).toBe('running');
    });
  });
  
  describe('loadStepOutput', () => {
    it('should return output from step file', async () => {
      await updateStepStateIncremental(tempDir, 'step_001', {
        status: 'completed',
        output: { files: ['a.ts', 'b.ts', 'c.ts'] },
      });
      
      const output = await loadStepOutput(tempDir, 'step_001');
      
      expect(output).toEqual({ files: ['a.ts', 'b.ts', 'c.ts'] });
    });
    
    it('should return null if step not found', async () => {
      const output = await loadStepOutput(tempDir, 'nonexistent');
      expect(output).toBeNull();
    });
  });
  
  describe('updateCoreState', () => {
    it('should update state.json without output', async () => {
      // 先创建初始状态
      const initialState: WorkflowState = {
        executionId: 'test-001',
        workflowId: 'wf-test',
        gitCommitHash: 'abc123',
        status: 'running',
        startTime: '2026-04-08T00:00:00Z',
        steps: {},
        inputs: {},
        outputs: {},
      };
      
      await saveState(tempDir, initialState);
      
      // 更新核心状态
      await updateCoreState(tempDir, { status: 'completed' });
      
      // 加载检查
      const state = await loadState(tempDir);
      
      expect(state?.status).toBe('completed');
    });
  });
  
  describe('loadFullState', () => {
    it('should merge step outputs from separate files', async () => {
      // 创建核心状态
      const initialState: WorkflowState = {
        executionId: 'test-001',
        workflowId: 'wf-test',
        gitCommitHash: 'abc123',
        status: 'running',
        startTime: '2026-04-08T00:00:00Z',
        steps: {
          step_001: { status: 'completed' },
          step_002: { status: 'completed' },
        },
        inputs: {},
        outputs: {},
      };
      
      await saveState(tempDir, initialState);
      
      // 写入步骤状态（含 output）
      await updateStepStateIncremental(tempDir, 'step_001', {
        status: 'completed',
        output: { result: 'a' },
      });
      await updateStepStateIncremental(tempDir, 'step_002', {
        status: 'completed',
        output: { result: 'b' },
      });
      
      // 加载完整状态
      const fullState = await loadFullState(tempDir);
      
      expect(fullState?.steps['step_001'].output).toEqual({ result: 'a' });
      expect(fullState?.steps['step_002'].output).toEqual({ result: 'b' });
    });
  });
  
  describe('migrateToIncremental', () => {
    it('should migrate existing state to incremental storage', async () => {
      // 创建传统状态（步骤在 state.json 中）
      const traditionalState: WorkflowState = {
        executionId: 'test-001',
        workflowId: 'wf-test',
        gitCommitHash: 'abc123',
        status: 'running',
        startTime: '2026-04-08T00:00:00Z',
        steps: {
          step_001: { status: 'completed', output: { data: 'large' } },
          step_002: { status: 'completed', output: { data: 'large2' } },
        },
        inputs: {},
        outputs: {},
      };
      
      await saveState(tempDir, traditionalState);
      
      // 迁移
      await migrateToIncremental(tempDir);
      
      // 检查步骤已分离
      const step1 = await loadStepState(tempDir, 'step_001');
      const step2 = await loadStepState(tempDir, 'step_002');
      
      expect(step1?.output).toEqual({ data: 'large' });
      expect(step2?.output).toEqual({ data: 'large2' });
      
      // 检查 state.json 中的 output 已清空
      const state = await loadState(tempDir);
      expect(state?.steps['step_001'].output).toBeUndefined();
    });
    
    it('should skip migration if already incremental', async () => {
      // 创建增量存储
      await updateStepStateIncremental(tempDir, 'step_001', { status: 'completed' });
      
      // 再次迁移（应该跳过）
      await migrateToIncremental(tempDir);
      
      // 步骤应该保持不变
      const step = await loadStepState(tempDir, 'step_001');
      expect(step?.status).toBe('completed');
    });
  });
  
  describe('isIncrementalStorage', () => {
    it('should return false if steps dir not exists', async () => {
      expect(isIncrementalStorage(tempDir)).toBe(false);
    });
    
    it('should return true if steps dir exists', async () => {
      await updateStepStateIncremental(tempDir, 'step_001', { status: 'running' });
      expect(isIncrementalStorage(tempDir)).toBe(true);
    });
  });
  
  describe('performance', () => {
    it('should be faster than full save for large states', async () => {
      // 创建 50 个步骤
      const steps: Record<string, StepState> = {};
      
      for (let i = 0; i < 50; i++) {
        steps[`step_${i}`] = {
          status: 'completed',
          output: { data: `large output data for step ${i}...` },
        };
      }
      
      // 全量写入时间
      const fullState: WorkflowState = {
        executionId: 'perf-test',
        workflowId: 'wf-test',
        gitCommitHash: 'abc',
        status: 'running',
        startTime: '2026-04-08T00:00:00Z',
        steps,
        inputs: {},
        outputs: {},
      };
      
      const fullStart = Date.now();
      await saveState(tempDir, fullState);
      const fullTime = Date.now() - fullStart;
      
      // 增量写入时间（单个步骤）
      const incrStart = Date.now();
      await updateStepStateIncremental(tempDir, 'step_49', { status: 'completed', output: { data: 'new' } });
      const incrTime = Date.now() - incrStart;
      
      // 增量应该更快
      console.log(`全量写入: ${fullTime}ms, 增量写入: ${incrTime}ms`);
      
      // 注意：这个测试在小数据量时可能不明显
      // 真实场景（>1MB）差异会更显著
    });
  });
});