/**
 * Agent 回退机制 (P1)
 * 
 * 功能：
 * - 支持主 Agent 失败时切换备用 Agent
 * - 配置 fallback 映射（如 codex → claude-code）
 * - 支持基于错误类型的条件回退
 * - 记录回退历史
 */

import { EventEmitter } from './events';
import {
  AgentFallbackConfig,
  AgentFallbackMapping,
  FallbackCondition,
  FallbackState,
  FallbackEvent,
  ErrorType,
  ClassifiedError,
} from './types';

/**
 * 默认回退映射
 */
const DEFAULT_FALLBACK_MAPPINGS: AgentFallbackMapping[] = [
  { primary: 'codex', fallback: 'claude-code', maxRetries: 2 },
  { primary: 'claude-code', fallback: 'codex', maxRetries: 2 },
  { primary: 'pi', fallback: 'claude-code', maxRetries: 2 },
];

/**
 * Agent 回退管理器
 */
export class AgentFallbackManager {
  private config: AgentFallbackConfig;
  private eventEmitter?: EventEmitter;
  private states: Map<string, FallbackState> = new Map();
  
  constructor(config: Partial<AgentFallbackConfig>, eventEmitter?: EventEmitter) {
    this.config = {
      enabled: config.enabled ?? true,
      fallbacks: config.fallbacks || DEFAULT_FALLBACK_MAPPINGS,
      retryWithFallback: config.retryWithFallback ?? true,
      notifyOnFallback: config.notifyOnFallback ?? true,
    };
    
    this.eventEmitter = eventEmitter;
  }
  
  /**
   * 初始化执行回退状态
   */
  initExecution(executionId: string, originalAgent: string): FallbackState {
    const state: FallbackState = {
      originalAgent,
      currentAgent: originalAgent,
      fallbackCount: 0,
      fallbackHistory: [],
    };
    
    this.states.set(executionId, state);
    return state;
  }
  
  /**
   * 获取执行状态
   */
  getState(executionId: string): FallbackState | undefined {
    return this.states.get(executionId);
  }
  
  /**
   * 检查是否应该回退
   */
  shouldFallback(
    executionId: string,
    error: ClassifiedError,
    attemptNumber: number
  ): boolean {
    if (!this.config.enabled) return false;
    
    const state = this.states.get(executionId);
    if (!state) return false;
    
    // 查找回退映射
    const mapping = this.findMapping(state.currentAgent);
    if (!mapping) return false;
    
    // 检查条件
    if (mapping.condition) {
      return this.checkCondition(mapping.condition, error, attemptNumber);
    }
    
    // 检查最大重试次数
    if (mapping.maxRetries && attemptNumber < mapping.maxRetries) {
      return false;
    }
    
    return true;
  }
  
  /**
   * 执行回退
   */
  executeFallback(
    executionId: string,
    error: ClassifiedError,
    attemptNumber: number
  ): string | null {
    const state = this.states.get(executionId);
    if (!state) return null;
    
    const mapping = this.findMapping(state.currentAgent);
    if (!mapping) return null;
    
    const fallbackAgent = mapping.fallback;
    
    // 记录回退事件
    const event: FallbackEvent = {
      from: state.currentAgent,
      to: fallbackAgent,
      reason: `${error.type}: ${error.originalError.substring(0, 100)}`,
      timestamp: new Date(),
      attemptNumber,
    };
    
    state.fallbackHistory.push(event);
    state.currentAgent = fallbackAgent;
    state.fallbackCount++;
    
    // 发送事件
    this.eventEmitter?.emit('agent.fallback', {
      executionId,
      from: event.from,
      to: event.to,
      reason: event.reason,
      fallbackCount: state.fallbackCount,
    });
    
    console.log(`🔄 Agent 回退: ${event.from} → ${event.to} (原因: ${error.type})`);
    
    return fallbackAgent;
  }
  
  /**
   * 获取当前 Agent
   */
  getCurrentAgent(executionId: string): string | undefined {
    return this.states.get(executionId)?.currentAgent;
  }
  
  /**
   * 检查是否已回退
   */
  hasFallback(executionId: string): boolean {
    const state = this.states.get(executionId);
    return state ? state.fallbackCount > 0 : false;
  }
  
  /**
   * 获取回退历史
   */
  getFallbackHistory(executionId: string): FallbackEvent[] {
    return this.states.get(executionId)?.fallbackHistory || [];
  }
  
  /**
   * 清理执行状态
   */
  cleanup(executionId: string): void {
    this.states.delete(executionId);
  }
  
  /**
   * 查找回退映射
   */
  private findMapping(agent: string): AgentFallbackMapping | undefined {
    return this.config.fallbacks.find(m => m.primary === agent);
  }
  
  /**
   * 检查回退条件
   */
  private checkCondition(
    condition: FallbackCondition,
    error: ClassifiedError,
    attemptNumber: number
  ): boolean {
    // 检查错误类型
    if (condition.errorTypes && condition.errorTypes.length > 0) {
      if (!condition.errorTypes.includes(error.type)) {
        return false;
      }
    }
    
    // 检查连续失败次数
    if (condition.consecutiveFailures) {
      if (attemptNumber < condition.consecutiveFailures) {
        return false;
      }
    }
    
    return true;
  }
}

/**
 * 创建回退管理器
 */
export function createFallbackManager(
  config?: Partial<AgentFallbackConfig>,
  eventEmitter?: EventEmitter
): AgentFallbackManager {
  return new AgentFallbackManager(config || {}, eventEmitter);
}

// 全局实例
let defaultManager: AgentFallbackManager | undefined;

export function getDefaultFallbackManager(): AgentFallbackManager {
  if (!defaultManager) {
    defaultManager = createFallbackManager();
  }
  return defaultManager;
}

export function setDefaultFallbackManager(manager: AgentFallbackManager): void {
  defaultManager = manager;
}
