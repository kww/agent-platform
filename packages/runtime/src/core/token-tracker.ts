/**
 * Token 使用追踪服务 (P1)
 * 
 * 功能：
 * - 统计每步输出的 token 数
 * - 追踪当前累计 token vs 模型限制
 * - 超限预警（>80% 时通知）
 * - 支持多种模型的 token 限制
 */

import { EventEmitter } from './events';

/**
 * 模型 Token 限制配置
 */
export const MODEL_TOKEN_LIMITS: Record<string, number> = {
  // OpenAI
  'gpt-4': 8192,
  'gpt-4-32k': 32768,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  
  // Anthropic
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-code': 200000,
  
  // 其他
  'codex': 8192,
  'default': 128000,
};

/**
 * Token 使用记录
 */
export interface TokenUsage {
  stepId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: Date;
}

/**
 * Token 状态
 */
export interface TokenState {
  executionId: string;
  model: string;
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  stepUsages: TokenUsage[];
  warningThreshold: number;
  warningSent: boolean;
}

/**
 * Token 追踪器配置
 */
export interface TokenTrackerOptions {
  executionId: string;
  model?: string;
  warningThreshold?: number;  // 默认 80%
  eventEmitter?: EventEmitter;
}

/**
 * Token 追踪器
 */
export class TokenTracker {
  private state: TokenState;
  private eventEmitter?: EventEmitter;
  
  constructor(options: TokenTrackerOptions) {
    const model = options.model || 'default';
    const limit = MODEL_TOKEN_LIMITS[model] || MODEL_TOKEN_LIMITS['default'];
    
    this.state = {
      executionId: options.executionId,
      model,
      limit,
      used: 0,
      remaining: limit,
      percentage: 0,
      stepUsages: [],
      warningThreshold: options.warningThreshold || 80,
      warningSent: false,
    };
    
    this.eventEmitter = options.eventEmitter;
  }
  
  /**
   * 估算文本的 token 数
   * 简单估算：平均 4 字符 = 1 token
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // 中文约 1.5 字符/token，英文约 4 字符/token
    // 取折中值 2.5
    const charCount = text.length;
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = charCount - chineseChars;
    
    return Math.ceil(chineseChars / 1.5 + englishChars / 4);
  }
  
  /**
   * 记录步骤 token 使用
   */
  recordUsage(stepId: string, input: string, output: string): TokenUsage {
    const inputTokens = this.estimateTokens(input);
    const outputTokens = this.estimateTokens(output);
    const totalTokens = inputTokens + outputTokens;
    
    const usage: TokenUsage = {
      stepId,
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp: new Date(),
    };
    
    this.state.stepUsages.push(usage);
    this.state.used += totalTokens;
    this.state.remaining = Math.max(0, this.state.limit - this.state.used);
    this.state.percentage = Math.round((this.state.used / this.state.limit) * 100);
    
    // 检查预警
    this.checkWarning();
    
    return usage;
  }
  
  /**
   * 获取当前状态
   */
  getState(): TokenState {
    return { ...this.state };
  }
  
  /**
   * 获取使用统计
   */
  getStats(): {
    totalUsed: number;
    remaining: number;
    percentage: number;
    stepCount: number;
    avgPerStep: number;
  } {
    const stepCount = this.state.stepUsages.length;
    const avgPerStep = stepCount > 0 
      ? Math.round(this.state.used / stepCount) 
      : 0;
    
    return {
      totalUsed: this.state.used,
      remaining: this.state.remaining,
      percentage: this.state.percentage,
      stepCount,
      avgPerStep,
    };
  }
  
  /**
   * 检查是否接近限制
   */
  isNearLimit(threshold?: number): boolean {
    const pct = threshold || this.state.warningThreshold;
    return this.state.percentage >= pct;
  }
  
  /**
   * 检查是否超限
   */
  isOverLimit(): boolean {
    return this.state.used >= this.state.limit;
  }
  
  /**
   * 获取预估剩余步骤数
   */
  estimateRemainingSteps(): number {
    const stats = this.getStats();
    if (stats.avgPerStep === 0) return Infinity;
    return Math.floor(this.state.remaining / stats.avgPerStep);
  }
  
  /**
   * 检查并发送预警
   */
  private checkWarning(): void {
    if (this.state.warningSent) return;
    
    if (this.isNearLimit()) {
      this.state.warningSent = true;
      
      this.eventEmitter?.emit('token.warning', {
        executionId: this.state.executionId,
        used: this.state.used,
        limit: this.state.limit,
        percentage: this.state.percentage,
        remaining: this.state.remaining,
        message: `Token 使用已达 ${this.state.percentage}%，接近模型限制`,
      });
    }
  }
  
  /**
   * 重置预警状态（用于压缩后）
   */
  resetWarning(): void {
    this.state.warningSent = false;
    this.checkWarning();
  }
  
  /**
   * 压缩后更新使用量
   */
  updateAfterCompression(newUsed: number): void {
    const saved = this.state.used - newUsed;
    this.state.used = newUsed;
    this.state.remaining = Math.max(0, this.state.limit - newUsed);
    this.state.percentage = Math.round((newUsed / this.state.limit) * 100);
    
    console.log(`📉 Token 压缩: 节省 ${saved} tokens，当前 ${this.state.percentage}%`);
    
    // 重置预警
    this.state.warningSent = false;
    this.checkWarning();
  }
  
  /**
   * 生成使用报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const remainingSteps = this.estimateRemainingSteps();
    
    const lines = [
      `## 📊 Token 使用报告`,
      ``,
      `**模型**: ${this.state.model}`,
      `**限制**: ${this.state.limit.toLocaleString()} tokens`,
      `**已用**: ${stats.totalUsed.toLocaleString()} tokens (${stats.percentage}%)`,
      `**剩余**: ${stats.remaining.toLocaleString()} tokens`,
      ``,
      `**步骤数**: ${stats.stepCount}`,
      `**平均每步**: ${stats.avgPerStep.toLocaleString()} tokens`,
      `**预估剩余步骤**: ${remainingSteps === Infinity ? '未知' : remainingSteps}`,
      ``,
    ];
    
    if (this.state.stepUsages.length > 0) {
      lines.push(`### 步骤详情`);
      lines.push(``);
      
      for (const usage of this.state.stepUsages.slice(-10)) {
        lines.push(`- ${usage.stepId}: ${usage.totalTokens.toLocaleString()} tokens (输入: ${usage.inputTokens}, 输出: ${usage.outputTokens})`);
      }
      
      if (this.state.stepUsages.length > 10) {
        lines.push(`- ... 还有 ${this.state.stepUsages.length - 10} 个步骤`);
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * 获取简短状态
   */
  getShortStatus(): string {
    return `Token: ${this.state.percentage}% (${this.state.used.toLocaleString()}/${this.state.limit.toLocaleString()})`;
  }
}

// 全局实例管理
const tokenTrackers = new Map<string, TokenTracker>();

export function createTokenTracker(options: TokenTrackerOptions): TokenTracker {
  const tracker = new TokenTracker(options);
  tokenTrackers.set(options.executionId, tracker);
  return tracker;
}

export function getTokenTracker(executionId: string): TokenTracker | undefined {
  return tokenTrackers.get(executionId);
}

export function removeTokenTracker(executionId: string): void {
  tokenTrackers.delete(executionId);
}
