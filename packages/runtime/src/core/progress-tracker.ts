/**
 * 进度追踪服务 (P0)
 * 
 * 功能：
 * - 实时追踪工作流执行状态
 * - 计算进度百分比和预估剩余时间
 * - 提供状态查询接口
 * - 生成进度报告
 */

import { EventEmitter } from './events';
import {
  ProgressState,
  StepProgress,
  ProgressWarning,
  ProgressError,
  ErrorType,
  ClassifiedError,
} from './types';

export interface ProgressTrackerOptions {
  executionId: string;
  workflowId: string;
  workflowName?: string;
  totalSteps: number;
  eventEmitter?: EventEmitter;
}

/**
 * 错误分类器
 */
export function classifyError(error: string): ClassifiedError {
  const lowerError = error.toLowerCase();
  
  // 网络错误
  if (
    lowerError.includes('econnrefused') ||
    lowerError.includes('enotfound') ||
    lowerError.includes('etimedout') ||
    lowerError.includes('network') ||
    lowerError.includes('socket hang up')
  ) {
    return {
      type: 'NETWORK',
      originalError: error,
      recoverable: true,
      retryDelay: 5000,  // 5 秒后重试
      suggestion: '网络连接失败，将自动重试',
    };
  }
  
  // API 限制
  if (
    lowerError.includes('rate limit') ||
    lowerError.includes('429') ||
    lowerError.includes('too many requests')
  ) {
    return {
      type: 'RATE_LIMIT',
      originalError: error,
      recoverable: true,
      retryDelay: 60000,  // 1 分钟后重试
      suggestion: 'API 请求频率限制，等待后重试',
    };
  }
  
  // 超时
  if (
    lowerError.includes('timeout') ||
    lowerError.includes('timed out') ||
    lowerError.includes('etimedout')
  ) {
    return {
      type: 'TIMEOUT',
      originalError: error,
      recoverable: true,
      retryDelay: 10000,
      suggestion: '执行超时，可尝试增加超时时间',
    };
  }
  
  // API 错误
  if (
    lowerError.includes('api key') ||
    lowerError.includes('invalid api') ||
    lowerError.includes('authentication') ||
    lowerError.includes('unauthorized') ||
    lowerError.includes('401') ||
    lowerError.includes('403')
  ) {
    return {
      type: 'API_ERROR',
      originalError: error,
      recoverable: false,
      suggestion: 'API 配置错误，请检查 API Key 配置',
    };
  }
  
  // 权限错误
  if (
    lowerError.includes('permission') ||
    lowerError.includes('access denied') ||
    lowerError.includes('forbidden')
  ) {
    return {
      type: 'PERMISSION',
      originalError: error,
      recoverable: false,
      suggestion: '权限不足，请检查文件或命令权限',
    };
  }
  
  // 验证失败
  if (
    lowerError.includes('validation') ||
    lowerError.includes('invalid') ||
    lowerError.includes('required')
  ) {
    return {
      type: 'VALIDATION',
      originalError: error,
      recoverable: false,
      suggestion: '输入验证失败，请检查参数格式',
    };
  }
  
  // 默认未知错误
  return {
    type: 'UNKNOWN',
    originalError: error,
    recoverable: false,
    suggestion: '未知错误，请查看详细日志',
  };
}

/**
 * 进度追踪器
 */
export class ProgressTracker {
  private state: ProgressState;
  private eventEmitter?: EventEmitter;
  private stepStartTime?: Date;
  private stepDurations: number[] = [];  // 历史步骤耗时，用于预估

  constructor(options: ProgressTrackerOptions) {
    this.eventEmitter = options.eventEmitter;
    this.state = {
      executionId: options.executionId,
      workflowId: options.workflowId,
      workflowName: options.workflowName,
      status: 'pending',
      totalSteps: options.totalSteps,
      completedSteps: 0,
      failedSteps: 0,
      steps: [],
      startedAt: new Date(),
      lastUpdated: new Date(),
      warnings: [],
      errors: [],
    };
  }

  /**
   * 获取当前状态
   */
  getState(): ProgressState {
    return { ...this.state };
  }

  /**
   * 获取进度百分比
   */
  getProgress(): number {
    if (this.state.totalSteps === 0) return 0;
    return Math.round((this.state.completedSteps / this.state.totalSteps) * 100);
  }

  /**
   * 预估剩余时间（秒）
   */
  estimateRemaining(): number | undefined {
    if (this.stepDurations.length === 0) return undefined;
    
    const remainingSteps = this.state.totalSteps - this.state.completedSteps;
    if (remainingSteps === 0) return 0;
    
    // 使用最近 5 个步骤的平均耗时
    const recentDurations = this.stepDurations.slice(-5);
    const avgDuration = recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length;
    
    return Math.round((avgDuration * remainingSteps) / 1000);
  }

  /**
   * 开始工作流
   */
  startWorkflow(): void {
    this.state.status = 'running';
    this.state.startedAt = new Date();
    this.state.lastUpdated = new Date();
    
    this.emit('workflow.started', {
      executionId: this.state.executionId,
      workflowId: this.state.workflowId,
      workflowName: this.state.workflowName,
      totalSteps: this.state.totalSteps,
    });
  }

  /**
   * 开始步骤
   */
  startStep(stepId: string, stepName?: string, phaseId?: string, phaseName?: string): void {
    this.stepStartTime = new Date();
    
    const stepProgress: StepProgress = {
      stepId,
      stepName,
      phaseId,
      phaseName,
      status: 'running',
      startedAt: this.stepStartTime,
      progress: 0,
    };
    
    // 更新或添加步骤
    const existingIndex = this.state.steps.findIndex(s => s.stepId === stepId);
    if (existingIndex >= 0) {
      this.state.steps[existingIndex] = stepProgress;
    } else {
      this.state.steps.push(stepProgress);
    }
    
    this.state.currentStep = stepProgress;
    this.state.status = 'running';
    this.state.lastUpdated = new Date();
    
    this.emit('step.started', {
      executionId: this.state.executionId,
      stepId,
      stepName,
      progress: this.getProgress(),
    });
  }

  /**
   * 更新步骤进度
   */
  updateStepProgress(stepId: string, progress: number, message?: string): void {
    const step = this.state.steps.find(s => s.stepId === stepId);
    if (step) {
      step.progress = Math.min(100, Math.max(0, progress));
      step.message = message;
      this.state.lastUpdated = new Date();
    }
  }

  /**
   * 完成步骤
   */
  completeStep(stepId: string, output?: any): void {
    const step = this.state.steps.find(s => s.stepId === stepId);
    if (!step) return;
    
    const now = new Date();
    step.status = 'completed';
    step.completedAt = now;
    step.progress = 100;
    step.output = output;
    
    if (step.startedAt) {
      step.duration = now.getTime() - step.startedAt.getTime();
      this.stepDurations.push(step.duration);
    }
    
    this.state.completedSteps++;
    this.state.lastUpdated = now;
    this.state.estimatedRemaining = this.estimateRemaining();
    
    // 更新预估结束时间
    if (this.state.estimatedRemaining) {
      this.state.estimatedEndTime = new Date(now.getTime() + this.state.estimatedRemaining * 1000);
    }
    
    this.emit('step.completed', {
      executionId: this.state.executionId,
      stepId,
      stepName: step.stepName,
      duration: step.duration,
      progress: this.getProgress(),
    });
  }

  /**
   * 步骤失败
   */
  failStep(stepId: string, error: string): ClassifiedError {
    const step = this.state.steps.find(s => s.stepId === stepId);
    if (!step) {
      return classifyError(error);
    }
    
    const now = new Date();
    step.status = 'failed';
    step.completedAt = now;
    step.error = error;
    
    if (step.startedAt) {
      step.duration = now.getTime() - step.startedAt.getTime();
    }
    
    this.state.failedSteps++;
    this.state.lastUpdated = now;
    
    const classified = classifyError(error);
    
    // 记录错误
    this.state.errors.push({
      stepId,
      error,
      type: classified.type,
      recoverable: classified.recoverable,
      suggestion: classified.suggestion,
      timestamp: now,
    });
    
    this.emit('step.failed', {
      executionId: this.state.executionId,
      stepId,
      stepName: step.stepName,
      error,
      errorType: classified.type,
      recoverable: classified.recoverable,
      suggestion: classified.suggestion,
    });
    
    return classified;
  }

  /**
   * 跳过步骤
   */
  skipStep(stepId: string, reason?: string): void {
    const step = this.state.steps.find(s => s.stepId === stepId);
    if (!step) return;
    
    step.status = 'skipped';
    step.completedAt = new Date();
    step.message = reason || 'Skipped';
    
    this.state.completedSteps++;
    this.state.lastUpdated = new Date();
    
    this.emit('step.skipped', {
      executionId: this.state.executionId,
      stepId,
      reason,
    });
  }

  /**
   * 添加警告
   */
  addWarning(stepId: string, message: string): void {
    this.state.warnings.push({
      stepId,
      message,
      timestamp: new Date(),
    });
    this.state.lastUpdated = new Date();
    
    this.emit('warning.occurred', {
      executionId: this.state.executionId,
      stepId,
      message,
    });
  }

  /**
   * 完成工作流
   */
  completeWorkflow(outputs?: any): void {
    const now = new Date();
    this.state.status = 'completed';
    this.state.lastUpdated = now;
    this.state.estimatedRemaining = 0;
    
    this.emit('workflow.completed', {
      executionId: this.state.executionId,
      workflowId: this.state.workflowId,
      workflowName: this.state.workflowName,
      totalSteps: this.state.totalSteps,
      completedSteps: this.state.completedSteps,
      failedSteps: this.state.failedSteps,
      duration: now.getTime() - this.state.startedAt.getTime(),
      outputs,
    });
  }

  /**
   * 工作流失败
   */
  failWorkflow(error: string): void {
    const now = new Date();
    this.state.status = 'failed';
    this.state.lastUpdated = now;
    
    this.emit('workflow.failed', {
      executionId: this.state.executionId,
      workflowId: this.state.workflowId,
      workflowName: this.state.workflowName,
      error,
      completedSteps: this.state.completedSteps,
      failedSteps: this.state.failedSteps,
      duration: now.getTime() - this.state.startedAt.getTime(),
    });
  }

  /**
   * 取消工作流
   */
  cancelWorkflow(reason?: string): void {
    const now = new Date();
    this.state.status = 'cancelled';
    this.state.lastUpdated = now;
    
    this.emit('workflow.cancelled', {
      executionId: this.state.executionId,
      workflowId: this.state.workflowId,
      reason,
    });
  }

  /**
   * 生成进度报告
   */
  generateReport(): string {
    const lines: string[] = [
      `## 📊 工作流执行报告`,
      ``,
      `**工作流**: ${this.state.workflowName || this.state.workflowId}`,
      `**执行ID**: ${this.state.executionId}`,
      `**状态**: ${this.getStatusEmoji()} ${this.state.status}`,
      `**进度**: ${this.getProgress()}% (${this.state.completedSteps}/${this.state.totalSteps})`,
      ``,
    ];
    
    // 时间信息
    const duration = Math.round((Date.now() - this.state.startedAt.getTime()) / 1000);
    lines.push(`**已运行**: ${this.formatDuration(duration)}`);
    
    if (this.state.estimatedRemaining) {
      lines.push(`**预计剩余**: ${this.formatDuration(this.state.estimatedRemaining)}`);
    }
    lines.push(``);
    
    // 步骤列表
    if (this.state.steps.length > 0) {
      lines.push(`### 步骤详情`);
      lines.push(``);
      for (const step of this.state.steps) {
        const statusEmoji = this.getStepStatusEmoji(step.status);
        const durationStr = step.duration ? ` (${this.formatDuration(Math.round(step.duration / 1000))})` : '';
        lines.push(`- ${statusEmoji} ${step.stepName || step.stepId}${durationStr}`);
        if (step.error) {
          lines.push(`  - ❌ 错误: ${step.error.substring(0, 100)}`);
        }
      }
      lines.push(``);
    }
    
    // 错误和警告
    if (this.state.errors.length > 0) {
      lines.push(`### ❌ 错误 (${this.state.errors.length})`);
      lines.push(``);
      for (const err of this.state.errors) {
        lines.push(`- [${err.type}] ${err.error.substring(0, 100)}`);
        if (err.suggestion) {
          lines.push(`  - 💡 建议: ${err.suggestion}`);
        }
      }
      lines.push(``);
    }
    
    if (this.state.warnings.length > 0) {
      lines.push(`### ⚠️ 警告 (${this.state.warnings.length})`);
      lines.push(``);
      for (const warn of this.state.warnings) {
        lines.push(`- ${warn.message}`);
      }
      lines.push(``);
    }
    
    return lines.join('\n');
  }

  /**
   * 生成简短状态
   */
  getShortStatus(): string {
    const emoji = this.getStatusEmoji();
    const progress = this.getProgress();
    const current = this.state.currentStep?.stepName || '准备中';
    const duration = Math.round((Date.now() - this.state.startedAt.getTime()) / 1000);
    
    let status = `${emoji} ${this.state.workflowName || this.state.workflowId} - ${progress}%`;
    status += `\n📍 当前: ${current}`;
    status += `\n⏱️ 已运行: ${this.formatDuration(duration)}`;
    
    if (this.state.estimatedRemaining) {
      status += ` | 预计剩余: ${this.formatDuration(this.state.estimatedRemaining)}`;
    }
    
    return status;
  }

  // ===== 私有方法 =====

  private emit(type: string, data: any): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit(type, data);
    }
  }

  private getStatusEmoji(): string {
    switch (this.state.status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'cancelled': return '🚫';
      default: return '📌';
    }
  }

  private getStepStatusEmoji(status: StepProgress['status']): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '📌';
    }
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分`;
  }
}

// ===== 全局追踪器存储 =====

const trackers = new Map<string, ProgressTracker>();

export function getProgressTracker(executionId: string): ProgressTracker | undefined {
  return trackers.get(executionId);
}

export function createProgressTracker(options: ProgressTrackerOptions): ProgressTracker {
  const tracker = new ProgressTracker(options);
  trackers.set(options.executionId, tracker);
  return tracker;
}

export function removeProgressTracker(executionId: string): void {
  trackers.delete(executionId);
}

export function getAllProgressTrackers(): ProgressTracker[] {
  return Array.from(trackers.values());
}
