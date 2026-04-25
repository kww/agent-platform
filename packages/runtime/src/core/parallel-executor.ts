/**
 * 并行执行器
 * 
 * 提供并发池、失败容错、进度追踪、超时控制能力。
 * 
 * 🔄 复用 scheduler.ts：
 * - getResourceAwareConcurrency: 资源感知并发调整
 * - getSystemMetrics: 系统指标获取
 * - evaluateResourceStatus: 资源状态评估
 * 
 * 🔄 复用 executor.ts：
 * - getMaxConcurrent: 配置优先级链
 * - batchArray: 数组分批
 */

import { getResourceAwareConcurrency } from './scheduler';
import { Step, StepResult } from './types';

// ========== Types ==========

/**
 * 失败策略
 */
export type FailStrategy = 'all' | 'continue' | 'best-effort';

/**
 * 进度状态
 */
export type ProgressStatus = 'start' | 'success' | 'fail';

/**
 * 进度信息
 */
export interface ProgressInfo {
  completed: number;
  total: number;
  running: number;
  failed: number;
  stepId: string;
  status: ProgressStatus;
}

/**
 * 进度回调
 */
export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * 并行执行选项
 */
export interface ParallelOptions {
  maxConcurrent?: number;    // 最大并发数（默认 5）
  failStrategy?: FailStrategy;  // 失败策略（默认 'continue'）
  timeout?: number;          // 单步骤超时（毫秒，默认 300000）
  onProgress?: ProgressCallback;  // 进度回调
}

/**
 * 并行执行结果
 */
export interface ParallelResult {
  results: Map<string, StepResult>;
  successes: string[];
  failures: Array<{ stepId: string; error: Error }>;
  status: 'all_success' | 'partial_success' | 'all_failed';
}

// ========== Constants ==========

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_TIMEOUT = 300000;  // 5 分钟

// ========== Helper Functions ==========

/**
 * 数组分批
 * 
 * 🔄 executor.ts 已有实现，但为私有函数，这里复制一份
 * TODO: 后续修改 executor.ts 导出 batchArray
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

// ========== Parallel Executor ==========

/**
 * 并行执行器
 * 
 * 核心能力：
 * 1. 并发池：限制同时执行的步骤数
 * 2. 失败容错：支持继续执行其他步骤
 * 3. 进度追踪：实时报告完成进度
 * 4. 超时控制：单个步骤超时不影响其他步骤
 * 5. 资源感知：动态调整并发数
 */
export class ParallelExecutor {
  private options: ParallelOptions;
  private results: Map<string, StepResult>;
  private failures: Array<{ stepId: string; error: Error }>;
  private running: number;
  private completed: number;
  
  constructor(options?: ParallelOptions) {
    this.options = {
      maxConcurrent: options?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      failStrategy: options?.failStrategy ?? 'continue',
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      onProgress: options?.onProgress,
    };
    this.results = new Map();
    this.failures = [];
    this.running = 0;
    this.completed = 0;
  }
  
  /**
   * 执行并行步骤
   */
  async execute(
    steps: Step[],
    executorFn: (step: Step) => Promise<StepResult>
  ): Promise<ParallelResult> {
    if (!steps || steps.length === 0) {
      return this.getEmptyResult();
    }
    
    // ✅ 复用：获取并发数（带资源感知）
    const { concurrency, reason } = getResourceAwareConcurrency(this.options.maxConcurrent!);
    
    if (reason) {
      console.warn(`⚠️ 资源感知: ${reason}`);
    }
    
    // ✅ 复用：分批执行
    const batches = batchArray(steps, concurrency);
    
    // 执行每一批
    for (const batch of batches) {
      await this.executeBatch(batch, executorFn);
      
      // 如果 failStrategy === 'all' 且有失败，停止执行
      if (this.failures.length > 0 && this.options.failStrategy === 'all') {
        break;
      }
    }
    
    return this.getResult();
  }
  
  /**
   * 执行一批步骤
   */
  private async executeBatch(
    batch: Step[],
    executorFn: (step: Step) => Promise<StepResult>
  ): Promise<void> {
    this.running = batch.length;
    
    // 并行执行，使用 Promise.allSettled 支持失败容错
    const batchResults = await Promise.allSettled(
      batch.map(async (step) => {
        // 进度通知：开始
        this.notifyProgress(step.id, 'start');
        
        try {
          // 带超时执行
          const result = await this.executeWithTimeout(step, executorFn);
          return { step, result };
        } finally {
          this.running--;
        }
      })
    );
    
    // 处理结果
    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        const { step, result } = settled.value;
        this.results.set(step.id, result);
        this.completed++;
        this.notifyProgress(step.id, 'success');
      } else {
        const step = batch[batchResults.indexOf(settled)];
        const error = settled.reason instanceof Error 
          ? settled.reason 
          : new Error(String(settled.reason));
        this.failures.push({ stepId: step.id, error });
        this.completed++;
        this.notifyProgress(step.id, 'fail');
        
        // failStrategy === 'all' 时，抛出错误停止后续批次
        if (this.options.failStrategy === 'all') {
          throw error;
        }
      }
    }
  }
  
  /**
   * 带超时执行
   */
  private async executeWithTimeout(
    step: Step,
    executorFn: (step: Step) => Promise<StepResult>
  ): Promise<StepResult> {
    const timeout = step.timeout ?? this.options.timeout ?? DEFAULT_TIMEOUT;
    
    return Promise.race([
      executorFn(step),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Step ${step.id} timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  }
  
  /**
   * 进度通知
   */
  private notifyProgress(stepId: string, status: ProgressStatus): void {
    if (!this.options.onProgress) return;
    
    const total = this.results.size + this.failures.length + this.running;
    
    this.options.onProgress({
      completed: this.completed,
      total,
      running: this.running,
      failed: this.failures.length,
      stepId,
      status,
    });
  }
  
  /**
   * 获取最终结果
   */
  private getResult(): ParallelResult {
    const successes = Array.from(this.results.keys());
    const allFailed = successes.length === 0;
    const allSuccess = this.failures.length === 0;
    
    return {
      results: this.results,
      successes,
      failures: this.failures,
      status: allSuccess ? 'all_success' : 
              allFailed ? 'all_failed' : 'partial_success',
    };
  }
  
  /**
   * 空结果
   */
  private getEmptyResult(): ParallelResult {
    return {
      results: new Map(),
      successes: [],
      failures: [],
      status: 'all_success',
    };
  }
}

// ========== Export Convenience Function ==========

/**
 * 并行执行步骤（便捷函数）
 */
export async function executeParallel(
  steps: Step[],
  executorFn: (step: Step) => Promise<StepResult>,
  options?: ParallelOptions
): Promise<ParallelResult> {
  const executor = new ParallelExecutor(options);
  return executor.execute(steps, executorFn);
}