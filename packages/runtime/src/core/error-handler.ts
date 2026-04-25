/**
 * 步骤级错误处理引擎
 * 
 * 提供统一的错误处理机制，支持：
 * - 错误分类匹配
 * - 多种处理策略（retry/fallback/skip/abort/notify）
 * - 可复用的错误处理规则
 * - 步骤和工作流级别配置
 */

import { EventEmitter } from './events';
import {
  Step,
  StepErrorHandler,
  ErrorMatchConfig,
  ErrorAction,
  ErrorClassification,
  ExecutionContext,
  FallbackConfig,
  RetryConfig,
  ClassifiedError,
} from './types';
import { classifySpawnError } from '../executors/spawn';

/**
 * 步骤错误类型（用于步骤级错误处理）
 */
export enum StepErrorType {
  TIMEOUT = 'timeout',
  AGENT_FAIL = 'agent_fail',
  VALIDATION_FAIL = 'validation_fail',
  TOOL_FAIL = 'tool_fail',
  BUILTIN_FAIL = 'builtin_fail',
  DEPENDENCY_FAIL = 'dependency_fail',
  NETWORK_FAIL = 'network_fail',
  UNKNOWN = 'unknown',
}

/**
 * 错误匹配结果
 */
export interface ErrorMatchResult {
  matched: boolean;
  matchScore: number;  // 匹配度 0-100
  matchedRule?: StepErrorHandler;
  matchedAction?: ErrorAction;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlerResult {
  action: ErrorAction;
  success: boolean;
  output?: any;
  error?: string;
  retriesAttempted: number;
  fallbackUsed: boolean;
}

/**
 * 默认错误处理规则
 */
export const DEFAULT_ERROR_HANDLERS: StepErrorHandler[] = [
  {
    match: { error_type: StepErrorType.TIMEOUT },
    actions: [{ type: 'retry', config: { maxAttempts: 2, initialDelay: 10000 } }],
  },
  {
    match: { error_type: StepErrorType.NETWORK_FAIL },
    actions: [{ type: 'retry', config: { maxAttempts: 3, initialDelay: 5000 } }],
  },
  {
    match: { error_type: StepErrorType.AGENT_FAIL },
    actions: [
      { type: 'fallback', config: { agent: 'claude-code' } },
      { type: 'abort' },
    ],
  },
];

/**
 * 错误分类器
 */
export function classifyStepError(error: Error | string): ErrorClassification {
  const errorMsg = typeof error === 'string' ? error : error.message;
  
  // 1. 尝试使用 spawn 分类器（如果是 Agent 错误）
  const spawnClassification = classifySpawnError(errorMsg);
  
  if (spawnClassification.type !== 'UNKNOWN') {
    return {
      type: mapErrorTypeToStepError(spawnClassification.type),
      message: errorMsg,
      recoverable: spawnClassification.recoverable,
      suggestion: spawnClassification.suggestion,
    };
  }
  
  // 2. 手动分类
  let type = StepErrorType.UNKNOWN;
  let recoverable = false;
  let suggestion = '';
  
  // Timeout 检测
  if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
    type = StepErrorType.TIMEOUT;
    recoverable = true;
    suggestion = '增加 timeout 时间或检查网络连接';
  }
  // 网络错误
  else if (
    errorMsg.includes('ECONNREFUSED') ||
    errorMsg.includes('ENETUNREACH') ||
    errorMsg.includes('network')
  ) {
    type = StepErrorType.NETWORK_FAIL;
    recoverable = true;
    suggestion = '检查网络连接或使用代理';
  }
  // 验证错误
  else if (
    errorMsg.includes('validation') ||
    errorMsg.includes('invalid') ||
    errorMsg.includes('schema')
  ) {
    type = StepErrorType.VALIDATION_FAIL;
    recoverable = false;
    suggestion = '检查输入数据是否符合规范';
  }
  // 工具错误
  else if (errorMsg.includes('tool') || errorMsg.includes('script')) {
    type = StepErrorType.TOOL_FAIL;
    recoverable = false;
    suggestion = '检查工具配置和脚本路径';
  }
  // 内置处理器错误
  else if (errorMsg.includes('builtin') || errorMsg.includes('handler')) {
    type = StepErrorType.BUILTIN_FAIL;
    recoverable = false;
    suggestion = '检查 handler 注册和参数';
  }
  
  return {
    type,
    message: errorMsg,
    recoverable,
    suggestion,
  };
}

/**
 * 映射 ErrorType 到 StepErrorType
 */
function mapErrorTypeToStepError(errorType: string): StepErrorType {
  switch (errorType) {
    case 'TIMEOUT':
      return StepErrorType.TIMEOUT;
    case 'NETWORK':
      return StepErrorType.NETWORK_FAIL;
    case 'API_ERROR':
      return StepErrorType.AGENT_FAIL;
    case 'RATE_LIMIT':
      return StepErrorType.AGENT_FAIL;
    case 'AUTH_ERROR':
      return StepErrorType.AGENT_FAIL;
    default:
      return StepErrorType.UNKNOWN;
  }
}

/**
 * 错误匹配器
 */
export function matchError(
  error: ErrorClassification,
  handlers: StepErrorHandler[],
  context?: ExecutionContext,
  step?: Step
): ErrorMatchResult {
  let bestMatch: ErrorMatchResult = {
    matched: false,
    matchScore: 0,
  };
  
  for (const handler of handlers) {
    const score = calculateMatchScore(error, handler.match, context, step);
    
    if (score > 0 && score > bestMatch.matchScore) {
      bestMatch = {
        matched: true,
        matchScore: score,
        matchedRule: handler,
        matchedAction: handler.actions[0],  // 取第一个动作
      };
    }
  }
  
  return bestMatch;
}

/**
 * 计算匹配分数
 */
function calculateMatchScore(
  error: ErrorClassification,
  matchConfig: ErrorMatchConfig,
  context?: ExecutionContext,
  step?: Step
): number {
  let score = 0;
  
  // 1. 错误类型匹配
  if (matchConfig.error_type) {
    if (error.type === matchConfig.error_type) {
      score += 50;
    } else {
      return 0;  // 类型不匹配，直接返回 0
    }
  }
  
  // 2. 错误消息正则匹配
  if (matchConfig.error_pattern) {
    const regex = new RegExp(matchConfig.error_pattern, 'i');
    if (regex.test(error.message)) {
      score += 30;
    } else {
      return 0;
    }
  }
  
  // 3. 步骤状态匹配（从 context 获取）
  if (matchConfig.step_status && context) {
    // 从 workflow.steps 中查找当前步骤的状态
    const stepResult = context.steps.find((s: { stepId: string; status: string }) => s.stepId === step?.id);
    if (stepResult && stepResult.status === matchConfig.step_status) {
      score += 20;
    }
  }
  
  // 4. 可恢复性匹配
  if (matchConfig.recoverable !== undefined) {
    if (error.recoverable === matchConfig.recoverable) {
      score += 10;
    }
  }
  
  return score;
}

/**
 * 错误处理器
 */
export class StepErrorHandlerEngine {
  private handlers: StepErrorHandler[] = [];
  private eventEmitter?: EventEmitter;
  
  constructor(config?: {
    handlers?: StepErrorHandler[];
    eventEmitter?: EventEmitter;
  }) {
    this.handlers = config?.handlers || DEFAULT_ERROR_HANDLERS;
    this.eventEmitter = config?.eventEmitter;
  }
  
  /**
   * 添加自定义处理规则
   */
  addHandler(handler: StepErrorHandler): void {
    this.handlers.push(handler);
    // 按优先级排序
    this.handlers.sort((a, b) => (a.priority || 100) - (b.priority || 100));
  }
  
  /**
   * 处理步骤错误
   */
  async handleError(
    error: Error | string,
    step: Step,
    context: ExecutionContext,
    onRetry?: () => Promise<any>,
    onFallback?: (fallbackConfig: FallbackConfig) => Promise<any>
  ): Promise<ErrorHandlerResult> {
    // 1. 分类错误
    const classification = classifyStepError(error);
    
    console.log(`❌ 步骤错误分类: ${classification.type}`);
    console.log(`   消息: ${classification.message.substring(0, 100)}`);
    console.log(`   可恢复: ${classification.recoverable}`);
    if (classification.suggestion) {
      console.log(`   建议: ${classification.suggestion}`);
    }
    
    // 2. 合并处理规则（步骤级 > 工作流级 > 默认）
    const allHandlers = [
      ...(step.error_handlers || []),
      ...(context.workflow.error_handlers || []),
      ...this.handlers,
    ];
    
    // 3. 匹配错误
    const matchResult = matchError(classification, allHandlers, context, step);
    
    if (!matchResult.matched) {
      // 无匹配规则，使用默认行为
      console.log('⚠️ 无匹配错误处理规则，使用默认行为（abort）');
      return {
        action: { type: 'abort' },
        success: false,
        error: classification.message,
        retriesAttempted: 0,
        fallbackUsed: false,
      };
    }
    
    // 4. 执行处理动作
    const action = matchResult.matchedAction!;
    console.log(`🔧 执行错误处理动作: ${action.type}`);
    
    // 发送事件
    this.eventEmitter?.emit('error.handling', {
      stepId: step.id,
      errorType: classification.type,
      action: action.type,
    });
    
    let result: ErrorHandlerResult = {
      action,
      success: false,
      retriesAttempted: 0,
      fallbackUsed: false,
    };
    
    // 执行所有动作链
    for (const act of matchResult.matchedRule!.actions) {
      result = await this.executeAction(
        act,
        classification,
        step,
        context,
        onRetry,
        onFallback
      );
      
      if (result.success) {
        break;  // 成功了，停止执行后续动作
      }
      
      // 继续执行下一个动作
      console.log(`⚠️ 动作 ${act.type} 未成功，尝试下一个动作`);
    }
    
    // 发送结果事件
    this.eventEmitter?.emit('error.handled', {
      stepId: step.id,
      action: action.type,
      success: result.success,
      retriesAttempted: result.retriesAttempted,
      fallbackUsed: result.fallbackUsed,
    });
    
    return result;
  }
  
  /**
   * 执行单个处理动作
   */
  private async executeAction(
    action: ErrorAction,
    classification: ErrorClassification,
    step: Step,
    context: ExecutionContext,
    onRetry?: () => Promise<any>,
    onFallback?: (fallbackConfig: FallbackConfig) => Promise<any>
  ): Promise<ErrorHandlerResult> {
    const result: ErrorHandlerResult = {
      action,
      success: false,
      retriesAttempted: 0,
      fallbackUsed: false,
    };
    
    switch (action.type) {
      case 'retry':
        if (onRetry && action.config) {
          const retryConfig = action.config as RetryConfig;
          const maxAttempts = retryConfig.maxAttempts || 3;
          const delay = retryConfig.initialDelay || 5000;
          
          for (let i = 0; i < maxAttempts; i++) {
            console.log(`🔄 重试 ${i + 1}/${maxAttempts}（延迟 ${delay}ms）`);
            
            await this.sleep(delay);
            
            try {
              const output = await onRetry();
              result.success = true;
              result.output = output;
              result.retriesAttempted = i + 1;
              console.log(`✅ 重试成功`);
              break;
            } catch (e) {
              console.log(`❌ 重试失败: ${(e as Error).message}`);
              result.error = (e as Error).message;
              result.retriesAttempted = i + 1;
            }
          }
        }
        break;
        
      case 'fallback':
        if (onFallback && action.config) {
          const fallbackConfig = action.config as FallbackConfig;
          console.log(`🔄 使用备用 Agent: ${fallbackConfig.agent || 'claude-code'}`);
          
          try {
            const output = await onFallback(fallbackConfig);
            result.success = true;
            result.output = output;
            result.fallbackUsed = true;
            console.log(`✅ 备用 Agent 成功`);
          } catch (e) {
            result.error = (e as Error).message;
            console.log(`❌ 备用 Agent 失败`);
          }
        }
        break;
        
      case 'skip':
        console.log(`⏭️ 跳过步骤 ${step.id}`);
        result.success = true;  // 跳过视为"处理成功"
        this.eventEmitter?.emit('step.skipped', { stepId: step.id });
        break;
        
      case 'abort':
        console.log(`🛑 终止工作流`);
        result.success = false;
        result.error = classification.message;
        break;
        
      case 'notify':
        console.log(`📢 发送错误通知`);
        this.eventEmitter?.emit('error.notify', {
          stepId: step.id,
          errorType: classification.type,
          message: classification.message,
          suggestion: classification.suggestion,
        });
        result.success = true;  // 通知视为"处理成功"，后续动作继续
        break;
        
      case 'continue':
        console.log(`⚠️ 继续执行后续步骤（忽略错误）`);
        result.success = true;
        result.error = classification.message;  // 保留错误信息
        break;
    }
    
    return result;
  }
  
  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建错误处理器实例
 */
export function createErrorHandler(config?: {
  handlers?: StepErrorHandler[];
  eventEmitter?: EventEmitter;
}): StepErrorHandlerEngine {
  return new StepErrorHandlerEngine(config);
}