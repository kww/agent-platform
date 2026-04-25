/**
 * 角色调度器
 * 
 * 功能：
 * 1. 优先级队列调度
 * 2. 简单依赖支持（waitFor）
 * 3. 并发控制
 * 4. 执行状态追踪
 * 
 * 复用：
 * - ParallelExecutor: 并发执行
 * - getResourceAwareConcurrency: 资源感知
 */

import { ParallelExecutor, batchArray } from '../core/parallel-executor';
import { getResourceAwareConcurrency } from '../core/scheduler';
import { EventEmitter } from '../core/events';

/**
 * 角色优先级
 */
export enum RolePriority {
  CRITICAL = 100, // 关键角色（如：生产修复）
  HIGH = 50,      // 高优先级（如：架构师）
  NORMAL = 10,    // 普通优先级（如：开发）
  LOW = 1,        // 低优先级（如：文档）
}

/**
 * 角色任务
 */
export interface RoleTask {
  id: string;
  name: string;
  priority: number;
  waitFor: string[]; // 等待的角色 ID
  skillId?: string;  // 要执行的 Skill
  inputs?: Record<string, any>;
  timeout?: number;
  /**
   * 会议上下文加载阶段（AS-054 渐进式披露）
   * - 1: 仅元数据（~200 Token）
   * - 2: + 决策（~700 Token）
   * - 3: + 摘要（~2700 Token）
   * - 4: + 完整消息（不限）
   * @default 2
   */
  meetingContextStage?: 1 | 2 | 3 | 4;
}

/**
 * 角色执行结果
 */
export interface RoleTaskResult {
  taskId: string;
  status: 'success' | 'failed' | 'skipped' | 'timeout';
  output?: any;
  error?: string;
  duration: number;
}

/**
 * 调度器配置
 */
export interface RoleSchedulerConfig {
  maxConcurrent?: number;
  eventEmitter?: EventEmitter;
  onTaskStart?: (task: RoleTask) => void;
  onTaskComplete?: (task: RoleTask, result: RoleTaskResult) => void;
  onTaskFail?: (task: RoleTask, error: Error) => void;
}

/**
 * 调度器状态
 */
interface SchedulerState {
  pending: RoleTask[];
  running: Set<string>;
  completed: Set<string>;
  failed: Set<string>;
  results: Map<string, RoleTaskResult>;
}

/**
 * 角色调度器
 */
export class RoleScheduler {
  private config: RoleSchedulerConfig;
  private state: SchedulerState;
  private eventEmitter?: EventEmitter;
  
  constructor(config?: RoleSchedulerConfig) {
    this.config = config ?? {};
    this.eventEmitter = config?.eventEmitter;
    this.state = {
      pending: [],
      running: new Set(),
      completed: new Set(),
      failed: new Set(),
      results: new Map(),
    };
  }
  
  /**
   * 调度执行角色任务
   */
  async schedule(
    tasks: RoleTask[],
    executorFn: (task: RoleTask) => Promise<any>
  ): Promise<Map<string, RoleTaskResult>> {
    // 重置状态
    this.state = {
      pending: [...tasks].sort((a, b) => b.priority - a.priority), // 按优先级排序
      running: new Set(),
      completed: new Set(),
      failed: new Set(),
      results: new Map(),
    };
    
    // 获取并发数（资源感知）
    const maxConcurrent = this.config.maxConcurrent ?? 5;
    const { concurrency, reason } = getResourceAwareConcurrency(maxConcurrent);
    
    if (reason) {
      console.warn(`⚠️ [RoleScheduler] 资源感知: ${reason}`);
    }
    
    // 执行循环
    while (this.state.pending.length > 0 || this.state.running.size > 0) {
      // 获取可执行的任务
      const executable = this.getExecutableTasks(concurrency);
      
      if (executable.length === 0) {
        // 没有可执行的任务，等待运行中的任务完成
        if (this.state.running.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // 没有运行中的任务，检查死锁
        if (this.state.pending.length > 0) {
          console.error('❌ [RoleScheduler] 死锁检测：存在无法执行的任务');
          this.markRemainingAsSkipped();
          break;
        }
      }
      
      // 并行执行
      await this.executeBatch(executable, executorFn);
    }
    
    return this.state.results;
  }
  
  /**
   * 获取可执行的任务
   */
  private getExecutableTasks(maxConcurrent: number): RoleTask[] {
    const executable: RoleTask[] = [];
    const availableSlots = maxConcurrent - this.state.running.size;
    
    for (const task of this.state.pending) {
      // 检查是否达到并发上限
      if (executable.length >= availableSlots) {
        break;
      }
      
      // 检查依赖是否满足
      const depsSatisfied = task.waitFor.every(depId => 
        this.state.completed.has(depId)
      );
      
      if (depsSatisfied) {
        executable.push(task);
      }
    }
    
    // 从待执行列表中移除
    for (const task of executable) {
      const index = this.state.pending.indexOf(task);
      if (index > -1) {
        this.state.pending.splice(index, 1);
      }
    }
    
    return executable;
  }
  
  /**
   * 执行一批任务
   */
  private async executeBatch(
    tasks: RoleTask[],
    executorFn: (task: RoleTask) => Promise<any>
  ): Promise<void> {
    // 标记为运行中
    for (const task of tasks) {
      this.state.running.add(task.id);
    }
    
    // 并行执行
    const results = await Promise.allSettled(
      tasks.map(async task => {
        const startTime = Date.now();
        
        try {
          // 回调：任务开始
          this.config.onTaskStart?.(task);
          this.eventEmitter?.emit('role.started', {
            taskId: task.id,
            taskName: task.name,
          });
          
          // 执行
          const output = await this.executeWithTimeout(task, executorFn);
          const duration = Date.now() - startTime;
          
          const result: RoleTaskResult = {
            taskId: task.id,
            status: 'success',
            output,
            duration,
          };
          
          // 更新状态
          this.state.running.delete(task.id);
          this.state.completed.add(task.id);
          this.state.results.set(task.id, result);
          
          // 回调：任务完成
          this.config.onTaskComplete?.(task, result);
          this.eventEmitter?.emit('role.completed', {
            taskId: task.id,
            taskName: task.name,
            duration,
          });
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          const err = error instanceof Error ? error : new Error(String(error));
          
          const result: RoleTaskResult = {
            taskId: task.id,
            status: err.message.includes('timeout') ? 'timeout' : 'failed',
            error: err.message,
            duration,
          };
          
          // 更新状态
          this.state.running.delete(task.id);
          this.state.failed.add(task.id);
          this.state.results.set(task.id, result);
          
          // 回调：任务失败
          this.config.onTaskFail?.(task, err);
          this.eventEmitter?.emit('role.failed', {
            taskId: task.id,
            taskName: task.name,
            error: err.message,
          });
          
          return result;
        }
      })
    );
  }
  
  /**
   * 带超时执行
   */
  private async executeWithTimeout(
    task: RoleTask,
    executorFn: (task: RoleTask) => Promise<any>
  ): Promise<any> {
    const timeout = task.timeout ?? 300000; // 默认 5 分钟
    
    return Promise.race([
      executorFn(task),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Task ${task.id} timeout after ${timeout}ms`)), timeout)
      ),
    ]);
  }
  
  /**
   * 标记剩余任务为跳过
   */
  private markRemainingAsSkipped(): void {
    for (const task of this.state.pending) {
      const result: RoleTaskResult = {
        taskId: task.id,
        status: 'skipped',
        error: 'Dependency not satisfied or deadlock detected',
        duration: 0,
      };
      
      this.state.results.set(task.id, result);
    }
    
    this.state.pending = [];
  }
  
  /**
   * 获取调度状态
   */
  getStatus(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    return {
      pending: this.state.pending.length,
      running: this.state.running.size,
      completed: this.state.completed.size,
      failed: this.state.failed.size,
    };
  }
  
  /**
   * 获取执行结果
   */
  getResults(): Map<string, RoleTaskResult> {
    return new Map(this.state.results);
  }
}

/**
 * 创建角色调度器（便捷函数）
 */
export function createRoleScheduler(config?: RoleSchedulerConfig): RoleScheduler {
  return new RoleScheduler(config);
}
