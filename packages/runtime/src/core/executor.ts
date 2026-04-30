/**
 * 工作流执行器
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { parseWorkflow } from './parser';
import { EventEmitter, Events, EventHandler } from './events';
import { config } from '../utils/config';
import { Workflow, Step, StepResult, ExecutionResult, ExecutionOptions, ExecutionContext, SessionEntry, DynamicExecution, DynamicTask, ExecutionPlan, FallbackConfig, ErrorClassification, StepErrorHandler } from './types';
import { executeTool } from '../executors/tool';
import { spawnAgent, spawnWithRetry, getAgentTimeout, classifySpawnError } from '../executors/spawn';
import { getStep } from './registry';
import { ParallelExecutor, ParallelResult, FailStrategy, batchArray } from './parallel-executor';
import { OutputManager, createOutputManager, lazyGetOutput } from './output-manager';

// 🆕 AR-001: 引入 harness 约束检查
import { checkConstraints, ConstraintViolationError } from '@dommaker/harness';
// 🆕 AR-003: 引入 harness CheckpointValidator
import {
  CheckpointValidator,
  type Checkpoint,
  type CheckpointCheck,
  type CheckpointContext,
  type CheckpointResult,
} from '@dommaker/harness';
import {
  loadState,
  saveState,
  createInitialState,
  updateStepState,
  completeState,
  canResume,
  clearState,
  WorkflowState,
  // 🆕 AR-009 增量保存
  updateStepStateIncremental,
  updateCoreState,
  loadStepState,
  loadStepOutput,
  loadFullState,
  migrateToIncremental,
  getStepsDir,
  isIncrementalStorage,
} from './state';
import { loadContextFile, detectProjectContext, mergeContexts, buildContextPrompt, ProjectContext } from './context';
import { getDiscordNotifier } from '../utils/discord';
import { StepCache, createStepCache, CacheStats } from './cache';
import { HistoryCompressor, CompressionConfig, createHistoryCompressor } from './history-compressor';
import { extractKeyData, KeyData } from './key-data-extractor';
import {
  createProgressTracker,
  getProgressTracker,
  removeProgressTracker,
  ProgressTracker,
  classifyError,
} from './progress-tracker';
import {
  createErrorHandler,
  StepErrorHandlerEngine,
  StepErrorType,
  classifyStepError,
} from './error-handler';
import {
  createNotificationService,
  getNotificationService,
  removeNotificationService,
  NotificationService,
  DEFAULT_NOTIFICATION_CONFIG,
} from './notification-service';
import {
  NotificationConfig,
  TimeoutConfig,
  DEFAULT_TIMEOUTS,
} from './types';
import type { RoleTask, RoleTaskResult } from '../orchestration/role-scheduler';
import type { ContextSharer } from '../orchestration/context-sharer';
import {
  createTokenTracker,
  getTokenTracker,
  removeTokenTracker,
  TokenTracker,
} from './token-tracker';
import {
  getProjectTokenTracker,
  ProjectTokenTracker,
} from './project-token-tracker';
import {
  analyzeRootCause,
  saveGapReport,
  RootCauseAnalyzer,
} from './root-cause-analyzer';
import {
  ProgressParser,
  ProgressInfo,
  DEFAULT_HEARTBEAT_CONFIG,
} from './progress-parser';
import {
  getResourceAwareConcurrency,
  ResourceScheduler,
  createResourceScheduler,
  ResourceMetrics,
  ResourceThresholds,
  DEFAULT_THRESHOLDS,
} from './scheduler';

// ========== 超时常量 (ms) ==========
const CACHE_CLEANUP_INTERVAL_MS = 60_000;        // 缓存清理间隔 1 分钟
const DEFAULT_TEST_TIMEOUT_MS = 60_000;           // 测试执行超时 1 分钟
const DEFAULT_SCRIPT_EXEC_TIMEOUT_MS = 60_000;    // 脚本执行超时 1 分钟
const PARALLEL_EXECUTION_TIMEOUT_MS = 300_000;    // 并行执行超时 5 分钟
const DEFAULT_ROLE_TASK_TIMEOUT_MS = 300_000;     // 角色任务超时 5 分钟
const DEFAULT_MAX_RETRY_DELAY_MS = 60_000;        // 最大重试延迟 1 分钟

// ========== 🆕 AR-009 P1: 惰性加载输出 ==========

/**
 * 惰性加载输出（处理引用）
 */
function getLazyOutput(context: ExecutionContext, key: string): any {
  const value = context.outputs[key];
  
  // 如果是引用，从文件加载
  if (value && typeof value === 'object' && 'ref' in value) {
    try {
      const content = fs.readFileSync(value.ref, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️ 无法加载输出引用: ${key}`);
      return null;
    }
  }
  
  return value;
}

// ========== 执行状态存储 ==========
const executions = new Map<string, ExecutionResult>();

// 步骤缓存（用于断点续传 + TTL 过期 + LRU 淘汰）- AR-007
const stepCache = createStepCache({
  maxSize: 1000,
  defaultTtl: 3600000,  // 1 小时
  enableGitHash: true,
});

// 定期清理过期缓存（每分钟，unref 防止阻止进程退出）
setInterval(() => {
  const cleared = stepCache.clearExpired();
  if (cleared > 0) {
    console.log(`[Cache] 清理 ${cleared} 个过期缓存`);
  }
}, CACHE_CLEANUP_INTERVAL_MS).unref();

/**
 * 生成步骤缓存 key
 */
function getStepCacheKey(workflowId: string, stepId: string, input: any): string {
  const inputHash = JSON.stringify(input);
  return `${workflowId}:${stepId}:${inputHash}`;
}

/**
 * 生成 Workflow Session 上下文 Prompt
 * 
 * 支持两种模式：
 * 1. 使用 HistoryCompressor（分层注入，Token 优化）
 * 2. 简单模式（直接遍历 sessionHistory）
 */
export function buildSessionPrompt(
  sessionHistory: SessionEntry[],
  currentPrompt: string,
  historyCompressor?: HistoryCompressor
): string {
  // 🆕 有 compressor 时用分层注入
  if (historyCompressor) {
    const contextOutputs = historyCompressor.getOutputsForContext(50000); // 限制 50K tokens
    if (contextOutputs) {
      return [
        '## 📋 前序步骤上下文',
        '',
        contextOutputs,
        '',
        '---',
        '',
        '## 🎯 当前任务',
        '',
        currentPrompt,
      ].join('\n');
    }
    return currentPrompt;
  }
  
  // 🔄 简单模式（向后兼容）
  if (!sessionHistory || sessionHistory.length === 0) {
    return currentPrompt;
  }
  
  const historyLines: string[] = ['## 📋 前序步骤上下文', ''];
  
  for (const entry of sessionHistory) {
    const phaseInfo = entry.phaseName ? `[${entry.phaseName}] ` : '';
    const stepName = entry.stepName || entry.stepId;
    
    historyLines.push(`### ${phaseInfo}${stepName}`);
    
    // 输出摘要（限制长度）
    if (entry.summary) {
      historyLines.push(`摘要: ${entry.summary}`);
    } else if (entry.output) {
      const outputStr = typeof entry.output === 'string' 
        ? entry.output 
        : JSON.stringify(entry.output, null, 2);
      const truncatedOutput = outputStr.length > 500 
        ? outputStr.slice(0, 500) + '...(已截断)' 
        : outputStr;
      historyLines.push(`输出: ${truncatedOutput}`);
    }
    
    historyLines.push('');
  }
  
  historyLines.push('---', '');
  historyLines.push('## 🎯 当前任务', '');
  historyLines.push(currentPrompt);
  
  return historyLines.join('\n');
}

/**
 * 执行工作流
 */
export async function executeWorkflow(
  workflowId: string,
  input: string | Record<string, any>,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  // 解析输入参数
  let resolvedInput: Record<string, any>;
  if (typeof input === 'string') {
    try {
      resolvedInput = JSON.parse(input);
    } catch {
      resolvedInput = { input };
    }
  } else {
    resolvedInput = input;
  }
  
  // 🔧 如果输入包含 project_path，使用它作为 workdir
  const workdir = options.workdir || resolvedInput.project_path || config.workdir;
  let executionId = uuidv4();
  const eventEmitter = new EventEmitter();
  
  // 🆕 设置 Prometheus 指标监听器
  const { setupMetricsListener } = await import('../monitoring');
  setupMetricsListener(eventEmitter);
  
  // 创建工作目录
  if (!fs.existsSync(workdir)) {
    fs.mkdirSync(workdir, { recursive: true });
    console.log(`📁 Created workdir: ${workdir}`);
  }
  
  // 注册事件监听
  if (options.onEvent) {
    eventEmitter.on('*', options.onEvent);
  }
  
  // 解析工作流
  const workflow = parseWorkflow(workflowId);
  
  // 步骤超时默认值
  const stepTimeout = options.stepTimeout || PARALLEL_EXECUTION_TIMEOUT_MS;
  
  // 检查是否可以恢复
  let previousState: WorkflowState | null = null;
  let skipSteps: string[] = [];
  
  if (options.resume && !options.force) {
    const resumeCheck = await canResume(workdir, workflowId);
    if (resumeCheck.canResume && resumeCheck.state) {
      previousState = resumeCheck.state;
      executionId = previousState.executionId;
      skipSteps = resumeCheck.completedSteps;
      
      console.log(`🔄 Resuming workflow from step ${skipSteps.length}/${workflow.steps?.length || 0}`);
      console.log(`   Completed: ${skipSteps.join(', ')}`);
      
      eventEmitter.emit('workflow.resumed', {
        executionId,
        workflowId,
        completedSteps: skipSteps
      });
    }
  } else if (options.force) {
    // 强制重新执行，清理状态
    await clearState(workdir);
  }
  
  // 加载上下文
  let projectContext: ProjectContext | null = null;
  
  // 1. 从 workflow 配置加载
  if (workflow.context) {
    projectContext = await loadContextFile(workflow.context);
    if (projectContext) {
      console.log(`📄 Loaded context: ${workflow.context}`);
    }
  }
  
  // 2. 自动检测项目类型
  const detectedContext = await detectProjectContext(workdir);
  
  // 3. 合并上下文
  if (projectContext || detectedContext) {
    projectContext = mergeContexts(projectContext, detectedContext);
    console.log(`🔍 Detected: ${projectContext?.language || 'unknown'} / ${projectContext?.framework || 'unknown'}`);
  }
  
  // 合并 workflow.inputs 默认值
  const defaultInputs: Record<string, any> = {};
  if (workflow.inputs) {
    for (const inputDef of workflow.inputs) {
      if (inputDef.default !== undefined) {
        defaultInputs[inputDef.name] = inputDef.default;
      }
    }
  }
  
  // 初始化执行结果
  const result: ExecutionResult = {
    executionId,
    workflowId,
    status: 'running',
    inputs: { ...defaultInputs, ...resolvedInput },
    outputs: {},
    steps: [],
    startTime: previousState ? new Date(previousState.startTime) : new Date(),
  };
  
  executions.set(executionId, result);
  
  // 🆕 AR-001: harness 约束检查（执行前）
  try {
    const constraintResult = await checkConstraints({
      operation: 'workflow_execution',
      projectPath: workdir,
      sessionId: executionId,
      taskDescription: workflowId,
    });
    
    // Iron Law 违规会抛出异常，这里记录 Guidelines 警告
    if (constraintResult.warningCount > 0) {
      console.warn(`⚠️ harness Guidelines violations during workflow execution:`);
      constraintResult.guidelines
        .filter(g => !g.satisfied)
        .forEach(g => console.warn(`  - ${g.id}: ${g.message}`));
    }
    
    console.log(`✅ harness constraints passed for workflow ${workflowId}`);
  } catch (e) {
    if (e instanceof ConstraintViolationError) {
      // Iron Law 违规 → 阻止执行
      console.error(`❌ Iron Law violation: ${e.result.message}`);
      result.status = 'failed';
      result.error = `Iron Law violation: ${e.result.id} - ${e.result.message}`;
      return result;
    }
    // 其他 harness 错误（如配置问题）→ 记录日志但不阻止
    console.warn(`⚠️ harness check failed (non-blocking):`, e);
  }
  
  // 🆕 创建历史压缩器（sessionHistory 管理）- 在 context 初始化之前
  const historyCompressorConfig: Partial<CompressionConfig> = {
    windowSize: 5,                // 保留最近 5 步完整输出
    maxTokenLimit: 100000,        // 100K token 限制
    compressionThreshold: 80000,  // 80K token 时触发压缩
    persistFullOutput: true,      // 持久化完整输出到文件
    outputDir: path.join(workdir, '.agent', 'outputs'),
  };
  const historyCompressor = createHistoryCompressor(historyCompressorConfig);
  
  // 初始化执行上下文
  const context: ExecutionContext = {
    executionId,
    workflow,
    inputs: { ...defaultInputs, ...resolvedInput },
    outputs: previousState?.outputs || {},
    steps: [],
    workdir,
    eventEmitter,
    stepCache,
    useCache: options.useCache !== false,
    projectContext: projectContext || undefined,
    sessionHistory: [],  // Workflow Session 支持（保留向后兼容）
    historyCompressor,   // 🆕 历史压缩器
  };
  
  // 更新 result.inputs（因为 context.inputs 可能变了）
  result.inputs = context.inputs;
  
  // 🆕 创建进度追踪器
  const totalSteps = workflow.steps?.length || 0;
  const progressTracker = createProgressTracker({
    executionId,
    workflowId,
    workflowName: workflow.name,
    totalSteps,
    eventEmitter,
  });
  
  // 🆕 创建 Token 追踪器
  const tokenTracker = createTokenTracker({
    executionId,
    model: (workflow as any).model || 'default',
    eventEmitter,
  });
  
  // 🆕 创建通知服务
  const notificationConfig: NotificationConfig = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    ...(workflow as any).notification,  // 允许工作流覆盖配置
  };
  const notificationService = createNotificationService({
    config: notificationConfig,
    executionId,
    workflowId,
    workflowName: workflow.name,
  });
  
  // 创建/更新状态文件
  const state = previousState || await createInitialState(workdir, executionId, workflowId, context.inputs);
  
  // 🆕 AR-009: 检查并迁移到增量存储
  if (!isIncrementalStorage(workdir) && state.steps && Object.keys(state.steps).length > 0) {
    await migrateToIncremental(workdir);
  }
  
  // 状态管理句柄（使用增量保存）
  const stateHandle = {
    updateStep: async (stepId: string, stepState: any) => {
      // 🆕 AR-009: 增量更新步骤状态
      await updateStepStateIncremental(workdir, stepId, stepState);
      
      // 更新内存中的状态索引
      state.steps[stepId] = { ...state.steps[stepId], ...stepState };
      delete state.steps[stepId].output;  // 不在内存中保留大 output
      
      // 更新核心状态（轻量）
      await updateCoreState(workdir, { steps: state.steps });
    },
    complete: async (outputs: any, status?: string, error?: string) => {
      await completeState(workdir, state, outputs, status as any, error);
    }
  };
  
  // 更新 context
  context.skipSteps = skipSteps;
  context.stateHandle = stateHandle;
  
  // 触发开始事件
  if (!previousState) {
    // 🆕 启动进度追踪和通知
    progressTracker.startWorkflow();
    notificationService.startPeriodicNotifications();
    
    eventEmitter.emit(Events.WORKFLOW_STARTED, {
      executionId,
      workflowId,
      inputs: context.inputs
    });
    
    // 发送开始通知（统一通过 NotificationService）
    await notificationService.notify('workflow.started', {});
  }
  
  try {
    // 执行子工作流（如果配置了 sub_workflows）
    if (workflow.sub_workflows && workflow.sub_workflows.length > 0) {
      console.log('\n🔗 Executing sub-workflows...');
      await executeSubWorkflows(workflow.sub_workflows, context);
    }
    
    // 执行步骤（如果没有 sub_workflows 或步骤也存在）
    if (workflow.steps && workflow.steps.length > 0) {
      await executeSteps(workflow.steps, context);
    }
    
    // 🔨 检查 Iron Laws（铁律）
    if (workflow.iron_laws && workflow.iron_laws.length > 0) {
      console.log('\n🔨 Checking Iron Laws...');
      const ironLawCheck = await checkIronLaws(workflow, context);
      
      if (!ironLawCheck.passed) {
        console.error('❌ Iron Laws violated:', ironLawCheck.violations);
        throw new Error(`Iron Laws violated:\n${ironLawCheck.violations.map(v => `  - ${v}`).join('\n')}`);
      }
      
      console.log('✅ All Iron Laws passed');
    }
    
    // 提取输出
    result.outputs = context.outputs;
    result.steps = context.steps;
    result.status = 'completed';
    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    
    // 🆕 完成进度追踪
    progressTracker.completeWorkflow(result.outputs);
    notificationService.stopPeriodicNotifications();
    
    // 🆕 保存 Token 统计
    const tokenStats = tokenTracker.getStats();
    const tokenState = tokenTracker.getState();
    result.tokenUsage = {
      model: tokenState.model,
      limit: tokenState.limit,
      used: tokenStats.totalUsed,
      remaining: tokenStats.remaining,
      percentage: tokenStats.percentage,
      stepCount: tokenStats.stepCount,
      avgPerStep: tokenStats.avgPerStep,
      steps: tokenState.stepUsages.map(u => ({
        stepId: u.stepId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
      })),
    };
    removeTokenTracker(executionId);
    
    // 🆕 记录到项目级别统计
    const projectPath = context.inputs.project_path || workdir;
    try {
      const projectTracker = getProjectTokenTracker(projectPath);
      projectTracker.recordExecution({
        executionId,
        workflowId,
        duration: result.duration || 0,
        tokenUsage: result.tokenUsage,
      });
    } catch (e) {
      console.error('Failed to record project token usage:', e);
    }
    
    // 🆕 部分成功报告
    const failedSteps = context.steps.filter(s => s.status === 'failed');
    if (failedSteps.length > 0 && workflow.continueOnFailure) {
      console.log(`\n⚠️ 部分成功: ${failedSteps.length} 个步骤失败`);
      for (const failed of failedSteps) {
        console.log(`   - ${failed.stepId}: ${failed.error?.substring(0, 100)}`);
      }
      
      // 添加到输出
      result.outputs._partialSuccess = {
        totalSteps: context.steps.length,
        completedSteps: context.steps.filter(s => s.status === 'completed').length,
        failedSteps: failedSteps.length,
        failures: failedSteps.map(s => ({
          stepId: s.stepId,
          error: s.error,
        })),
      };
    }
    
    // 更新状态文件
    await stateHandle.complete(result.outputs, 'completed');
    
    eventEmitter.emit(Events.WORKFLOW_COMPLETED, {
      executionId,
      outputs: result.outputs
    });
    
    // 发送完成通知（统一通过 NotificationService，包含 Token 统计）
    await notificationService.notify('workflow.completed', {
      duration: Math.round((result.duration || 0) / 1000),  // 转换为秒
      tokenUsage: {
        used: tokenStats.totalUsed,
        remaining: tokenStats.remaining,
        percentage: tokenStats.percentage,
        stepCount: tokenStats.stepCount,
        avgPerStep: tokenStats.avgPerStep,
      },
    });
    
    if (options.onComplete) {
      options.onComplete(result);
    }
    
  } catch (error) {
    result.status = 'failed';
    result.error = (error as Error).message;
    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    
    // 🆕 失败进度追踪
    progressTracker.failWorkflow((error as Error).message);
    notificationService.stopPeriodicNotifications();
    await notificationService.notify('workflow.failed', {
      error: result.error,
    });
    
    // 保存 Token 统计（即使失败也要记录）
    const tokenStats = tokenTracker.getStats();
    const tokenState = tokenTracker.getState();
    result.tokenUsage = {
      model: tokenState.model,
      limit: tokenState.limit,
      used: tokenStats.totalUsed,
      remaining: tokenStats.remaining,
      percentage: tokenStats.percentage,
      stepCount: tokenStats.stepCount,
      avgPerStep: tokenStats.avgPerStep,
      steps: tokenState.stepUsages.map(u => ({
        stepId: u.stepId,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
      })),
    };
    removeTokenTracker(executionId);
    
    // 更新状态文件
    await stateHandle.complete(result.outputs, 'failed', result.error);
    
    eventEmitter.emit(Events.WORKFLOW_FAILED, {
      executionId,
      error: result.error
    });
    
    if (options.onError) {
      options.onError(error as Error);
    }
  }
  
  return result;
}

/**
 * 执行步骤列表
 */
async function executeSteps(steps: Step[], context: ExecutionContext): Promise<void> {
  let currentPhaseId: string | undefined;
  
  console.log(`📋 Executing ${steps?.length || 0} steps...`);
  
  // 🔄 检测动态执行配置
  if (context.workflow.dynamic_execution?.enabled) {
    console.log('🔄 Dynamic execution enabled, will process after initial steps');
  }
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`\n📍 Step ${i + 1}/${steps.length}: ${step.id} (type: ${step.type || 'normal'})`);
    
    // 检测阶段变化
    if (step.phaseId && step.phaseId !== currentPhaseId) {
      // 结束上一个阶段
      if (currentPhaseId) {
        context.eventEmitter.emit('phase.completed', {
          phaseId: currentPhaseId,
          executionId: context.executionId
        });
      }
      
      // 开始新阶段
      currentPhaseId = step.phaseId;
      context.eventEmitter.emit('phase.started', {
        phaseId: step.phaseId,
        phaseName: step.phaseName,
        executionId: context.executionId
      });
      console.log(`\n📍 Phase: ${step.phaseName || step.phaseId}`);
    }
    
    // 并行步骤
    if (step.parallel) {
      // 🆕 AR-008 并行执行优化
      const executor = new ParallelExecutor({
        maxConcurrent: getMaxConcurrent(step.max_parallel, context.workflow?.concurrency),
        failStrategy: step.failStrategy ?? 'continue',
        timeout: step.timeout ?? PARALLEL_EXECUTION_TIMEOUT_MS,
        onProgress: (info) => {
          context.eventEmitter.emit('parallel.progress', {
            stepId: info.stepId,
            status: info.status,
            completed: info.completed,
            total: info.total,
            running: info.running,
            failed: info.failed,
          });
        },
      });
      
      // 包装 executeStep 返回 StepResult
      const result = await executor.execute(
        step.parallel,
        async (s) => {
          const startIndex = context.steps.length;
          await executeStep(s, context);
          // 从 context.steps 获取刚添加的结果
          const stepResult = context.steps[context.steps.length - 1];
          return stepResult;
        }
      );
      
      // 失败处理
      if (result.failures.length > 0 && step.failStrategy !== 'best-effort') {
        const errors = result.failures.map(f => `Step ${f.stepId}: ${f.error.message}`).join('\n');
        throw new Error(`并行步骤失败:\n${errors}`);
      }
    }
    // 🆕 Batch Iterator - 批次迭代执行
    else if (step.type === 'batch-iterator') {
      try {
        await executeBatchIterator(step, context);
      } catch (error) {
        console.error(`❌ Batch iterator failed: ${(error as Error).message}`);
        console.error(error);
        throw error;
      }
    }
    // 🆕 Loop - 循环执行
    else if (step.type === 'loop') {
      await executeLoop(step, context);
    }
    // 🆕 Aggregator - 结果汇总
    else if (step.type === 'aggregator') {
      await executeAggregator(step, context);
    }
    // 🆕 Notification - 通知
    else if (step.type === 'notification') {
      await executeNotification(step, context);
    }
    // 普通步骤
    else {
      await executeStep(step, context);
    }
    
    // 🔄 检查是否需要执行动态步骤
    // 当步骤输出包含 execution_plan 时，触发动态执行
    if (context.workflow.dynamic_execution?.enabled) {
      const dynamicSource = context.workflow.dynamic_execution.source;
      // 检查 source 是否已解析（例如 ${steps.load-tasks.output} 或 ${steps.load-tasks.execution_plan}）
      const sourceMatch = dynamicSource.match(/\$\{steps\.([\w-]+)\.(output|outputs|[\w-]+)\}/);
      if (sourceMatch) {
        const sourceStepId = sourceMatch[1];
        // 如果当前步骤就是动态执行的数据源
        if (step.id === sourceStepId) {
          // 检查步骤输出是否包含 execution_plan
          const stepOutput = context.steps.find(s => s.stepId === step.id)?.output;
          console.log(`🔍 Checking dynamic execution source: step=${step.id}, hasOutput=${!!stepOutput}`);
          if (stepOutputHasExecutionPlan(stepOutput)) {
            console.log('🔄 Triggering dynamic execution after step:', step.id);
            await executeDynamicSteps(context.workflow.dynamic_execution, context);
            console.log('✅ Dynamic execution completed, continuing to next steps...');
          }
        }
      }
    }
    
    // 检查点验证
    if (step.checkpoint) {
      console.log(`🔍 Verifying checkpoint for step: ${step.id}`);
      const passed = await verifyCheckpoint(step.checkpoint, context);
      console.log(`🔍 Checkpoint result: ${passed}`);
      if (!passed) {
        const action = step.checkpoint.on_fail || 'abort';
        if (action === 'abort') {
          // 生成更清晰的错误消息
          const verifyDetail = step.checkpoint.verify || `file: ${step.checkpoint.path || 'unknown'}`;
          throw new Error(`Checkpoint failed for step "${step.id}": ${verifyDetail}`);
        } else if (action === 'retry') {
          // 重试当前步骤
          await executeStep(step, context);
        }
        // 'skip' - 继续
      }
    }
  }
  
  console.log(`✅ All ${steps.length} steps processed`);
  
  // 结束最后一个阶段
  if (currentPhaseId) {
    context.eventEmitter.emit('phase.completed', {
      phaseId: currentPhaseId,
      executionId: context.executionId
    });
  }
}

/**
 * 检查步骤结果是否包含执行计划
 */
function stepOutputHasExecutionPlan(output: any): boolean {
  if (!output) return false;
  
  // 检查是否有 execution_plan 字段
  if (output.execution_plan && Array.isArray(output.execution_plan)) {
    return true;
  }
  
  // 检查是否是 tasks.yml 格式
  if (output.tasks && Array.isArray(output.tasks)) {
    return true;
  }
  
  return false;
}

/**
 * 执行动态步骤
 */
async function executeDynamicSteps(
  dynamicConfig: DynamicExecution,
  context: ExecutionContext
): Promise<void> {
  console.log('🔄 Starting dynamic execution...');
  
  // 解析数据源
  const source = dynamicConfig.source;
  let tasksPlan: any = null;
  
  // 解析 ${steps.xxx.output} 或 ${steps.xxx.field} 格式
  const sourceMatch = source.match(/\$\{steps\.([\w-]+)\.(output|outputs|[\w-]+)(?:\.([\w-]+))?\}/);
  if (sourceMatch) {
    const stepId = sourceMatch[1];
    const fieldOrOutput = sourceMatch[2];
    const subField = sourceMatch[3];
    
    const stepResult = context.steps.find(s => s.stepId === stepId);
    if (!stepResult || !stepResult.output) {
      throw new Error(`Dynamic execution source not found: ${source}`);
    }
    
    if (subField) {
      // ${steps.xxx.output.field}
      tasksPlan = stepResult.output[fieldOrOutput]?.[subField];
    } else if (fieldOrOutput === 'output' || fieldOrOutput === 'outputs') {
      // ${steps.xxx.output}
      tasksPlan = stepResult.output;
    } else {
      // ${steps.xxx.field}
      tasksPlan = stepResult.output[fieldOrOutput];
    }
  } else {
    // 直接使用 source 作为 key
    tasksPlan = context.outputs[source];
  }
  
  if (!tasksPlan) {
    console.warn('⚠️ No tasks plan found for dynamic execution');
    return;
  }
  
  // 获取执行计划和任务列表
  const executionPlan: ExecutionPlan[] = tasksPlan.execution_plan || [];
  const tasksMap: Map<string, DynamicTask> = new Map();
  
  // 构建任务映射
  if (tasksPlan.infrastructure) {
    for (const task of tasksPlan.infrastructure) {
      tasksMap.set(task.id, task);
    }
  }
  if (tasksPlan.tasks) {
    for (const task of tasksPlan.tasks) {
      tasksMap.set(task.id, task);
    }
  }
  
  if (executionPlan.length === 0 && tasksMap.size > 0) {
    // 如果没有 execution_plan，自动生成（所有任务并行）
    executionPlan.push({
      phase: 'all',
      parallel: true,
      tasks: Array.from(tasksMap.keys())
    });
  }
  
  console.log(`📋 Found ${tasksMap.size} tasks in ${executionPlan.length} phases`);
  
  // 按阶段执行
  for (const phase of executionPlan) {
    context.eventEmitter.emit('dynamic_phase.started', {
      phaseId: phase.phase,
      taskCount: phase.tasks.length,
      parallel: phase.parallel,
      executionId: context.executionId
    });
    
    console.log(`\n📍 Dynamic Phase: ${phase.phase} (${phase.tasks.length} tasks, parallel: ${phase.parallel})`);
    
    // 🆕 优先级队列：按 priority 排序任务
    let phaseTasks = phase.tasks;
    if (context.workflow.concurrency?.priority_queue) {
      phaseTasks = [...phase.tasks].sort((a, b) => {
        const taskA = tasksMap.get(a);
        const taskB = tasksMap.get(b);
        return (taskA?.priority || 99) - (taskB?.priority || 99);
      });
      console.log(`   📊 优先级队列已启用，任务已按 priority 排序`);
    }
    
    if (phase.parallel) {
      // 并行执行 - 使用配置优先级链 + 资源感知调整
      const baseConcurrency = getMaxConcurrent(
        dynamicConfig.max_parallel,
        context.workflow.concurrency
      );
      
      // 🆕 资源感知调整
      const { concurrency: maxParallel, metrics, status, reason } = getResourceAwareConcurrency(baseConcurrency);
      
      // 资源紧张时输出警告
      if (status !== 'normal') {
        console.warn(`⚠️ 资源感知: ${reason}`);
        console.warn(`   并发数调整: ${baseConcurrency} → ${maxParallel}`);
      }
      
      const taskBatches = batchArray(phaseTasks, maxParallel);
      
      // 🆕 AR-009 P1: 分批写入输出
      const phaseOutputsDir = path.join(context.workdir, '.agent-runtime', 'phase_outputs', phase.phase);
      
      for (const batch of taskBatches) {
        const batchResults = await Promise.all(
          batch.map(taskId => executeDynamicTask(taskId, tasksMap, context, dynamicConfig))
        );
        
        // 🆕 AR-009 P1: 批量写入输出到临时文件
        await fsPromises.mkdir(phaseOutputsDir, { recursive: true });
        
        for (const taskId of batch) {
          const taskOutputKey = `task_${taskId}_result`;
          const taskOutput = context.outputs[taskOutputKey];
          
          // 大数据写入文件，只保留引用
          if (taskOutput && typeof taskOutput === 'object') {
            const outputSize = JSON.stringify(taskOutput).length;
            if (outputSize > 1024) {  // > 1KB
              const outputPath = path.join(phaseOutputsDir, `${taskId}.json`);
              await fsPromises.writeFile(outputPath, JSON.stringify(taskOutput, null, 2));
              
              // 替换为引用
              context.outputs[taskOutputKey] = { ref: outputPath };
              console.log(`📦 输出已写入磁盘: ${taskOutputKey} (${outputSize} bytes)`);
            }
          }
        }
      }
    } else {
      // 串行执行
      for (const taskId of phaseTasks) {
        await executeDynamicTask(taskId, tasksMap, context, dynamicConfig);
      }
    }
    
    context.eventEmitter.emit('dynamic_phase.completed', {
      phaseId: phase.phase,
      executionId: context.executionId
    });
  }
  
  console.log('✅ Dynamic execution completed');
}

/**
 * 执行单个动态任务
 */
async function executeDynamicTask(
  taskId: string,
  tasksMap: Map<string, DynamicTask>,
  context: ExecutionContext,
  dynamicConfig: DynamicExecution
): Promise<void> {
  const task = tasksMap.get(taskId);
  if (!task) {
    console.warn(`⚠️ Task not found: ${taskId}`);
    return;
  }
  
  console.log(`  📌 Executing task: ${task.name || taskId}`);
  
  const stepTemplate = dynamicConfig.step_template;
  
  // 构建 task_info 字符串
  const taskInfo = buildTaskInfo(task);
  
  // 构建 project_info 字符串
  const projectContext = stepTemplate.input?.project_context || context.outputs.project;
  const projectInfo = buildProjectInfo(projectContext);
  
  // 构建动态步骤
  const dynamicStep: Step = {
    id: `dynamic-${taskId}`,
    step: stepTemplate.step,
    tool: stepTemplate.tool,
    input: {
      ...stepTemplate.input,
      task: task,
      task_id: taskId,
      task_info: taskInfo,
      project_info: projectInfo,
    },
    output: `task_${taskId}_result`,
    phaseId: 'dynamic',
    phaseName: 'Dynamic Tasks'
  };
  
  // 解析模板变量
  if (dynamicStep.input) {
    // 替换 {{task}} 变量
    for (const [key, value] of Object.entries(dynamicStep.input)) {
      if (typeof value === 'string') {
        dynamicStep.input[key] = value.replace('{{task}}', JSON.stringify(task));
      }
    }
  }
  
  try {
    await executeStep(dynamicStep, context);
    
    // 记录到 session history
    const taskOutput = getLazyOutput(context, `task_${taskId}_result`);
    
    // 🆕 AR-010: 统一使用 HistoryCompressor
    if (context.historyCompressor && taskOutput) {
      context.historyCompressor.addEntry({
        stepId: taskId,
        stepName: task.name || taskId,
        status: 'completed',
        output: typeof taskOutput === 'string' ? taskOutput : JSON.stringify(taskOutput),
        keyData: extractKeyData(taskOutput),
      });
    }
    
    // 🔄 向后兼容：同步更新 sessionHistory
    if (context.sessionHistory) {
      context.sessionHistory.push({
        stepId: taskId,
        stepName: task.name,
        phaseId: 'dynamic',
        phaseName: 'Dynamic Tasks',
        output: taskOutput,
        timestamp: new Date()
      });
    }
  } catch (error) {
    if (!dynamicConfig.continue_on_error) {
      throw error;
    }
    console.warn(`⚠️ Task ${taskId} failed but continuing: ${(error as Error).message}`);
  }
}

/**
 * 构建任务信息字符串
 */
function buildTaskInfo(task: DynamicTask): string {
  const lines: string[] = [];
  
  lines.push(`- **ID**: ${task.id || 'unknown'}`);
  lines.push(`- **名称**: ${task.name || '未命名任务'}`);
  
  if (task.spec) {
    lines.push(`- **规格**: ${task.spec}`);
  }
  
  if (task.acceptance && Array.isArray(task.acceptance)) {
    lines.push(`- **验收标准**:`);
    for (const criteria of task.acceptance) {
      lines.push(`  - ${criteria}`);
    }
  }
  
  if (task.files && Array.isArray(task.files)) {
    lines.push(`- **相关文件**:`);
    for (const file of task.files) {
      lines.push(`  - ${file.path || file} (${file.type || 'source'})`);
    }
  }
  
  if (task.dependencies && task.dependencies.length > 0) {
    lines.push(`- **依赖**: ${task.dependencies.join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * 构建项目信息字符串
 */
function buildProjectInfo(project: any): string {
  if (!project) {
    return '- 无项目上下文';
  }
  
  const lines: string[] = [];
  
  lines.push(`- **项目名称**: ${project.name || 'unknown'}`);
  
  if (project.description) {
    lines.push(`- **描述**: ${project.description}`);
  }
  
  if (project.tech_stack) {
    const techStr = typeof project.tech_stack === 'object' 
      ? Object.entries(project.tech_stack).map(([k, v]) => `${k}: ${v}`).join(', ')
      : String(project.tech_stack);
    lines.push(`- **技术栈**: ${techStr}`);
  }
  
  if (project.type) {
    lines.push(`- **项目类型**: ${project.type}`);
  }
  
  return lines.join('\n');
}

/**
 * 获取最大并发数（导出用于测试）
 * 
 * 配置优先级链：
 * 1. 步骤 max_parallel（最高优先级）
 * 2. 工作流 concurrency.max_parallel_tasks
 * 3. 全局 config.maxConcurrent
 * 4. 默认值 5
 */
export function getMaxConcurrent(
  stepMaxParallel?: number,
  workflowConcurrency?: { max_parallel_tasks?: number }
): number {
  // 优先级链
  if (stepMaxParallel !== undefined && stepMaxParallel > 0) {
    return stepMaxParallel;
  }
  if (workflowConcurrency?.max_parallel_tasks !== undefined && workflowConcurrency.max_parallel_tasks > 0) {
    return workflowConcurrency.max_parallel_tasks;
  }
  if (config.maxConcurrent > 0) {
    return config.maxConcurrent;
  }
  return 5;  // 默认值
}

/**
 * 数组分批
 */
/**
 * 检查 Iron Laws（铁律）
 * 
 * enforce_at 规则：
 * - "*": 始终检查
 * - 步骤 ID（如 "run-tests"）: 只在该步骤执行后检查
 * - 阶段名称（如 "develop-phases"）: 只在该阶段检查（需要阶段命名约定）
 */
async function checkIronLaws(
  workflow: Workflow,
  context: ExecutionContext
): Promise<{ passed: boolean; violations: string[] }> {
  const violations: string[] = [];
  
  if (!workflow.iron_laws || workflow.iron_laws.length === 0) {
    return { passed: true, violations: [] };
  }
  
  // 获取已执行的步骤 ID 列表
  const executedStepIds = context.steps
    .filter(s => s.status === 'completed' || s.status === 'failed')
    .map(s => s.stepId);
  
  // 检查是否有开发阶段的步骤
  const hasDevelopmentPhase = executedStepIds.some(id => 
    id.includes('develop') || id.includes('implement') || id.includes('task')
  );
  
  for (const law of workflow.iron_laws) {
    const enforceAt = law.enforce_at || '*';
    let shouldCheck = false;
    
    // 判断是否应该检查此铁律
    if (enforceAt === '*') {
      // 始终检查
      shouldCheck = true;
    } else if (enforceAt === 'develop-phases' || enforceAt === 'development') {
      // 开发阶段检查：只有执行了开发相关步骤才检查
      shouldCheck = hasDevelopmentPhase;
    } else if (enforceAt === 'run-tests') {
      // 测试检查：只有执行了测试步骤才检查
      shouldCheck = executedStepIds.includes('run-tests') || 
                    executedStepIds.some(id => id.includes('test'));
    } else {
      // 具体步骤 ID：只有该步骤执行了才检查
      shouldCheck = executedStepIds.includes(enforceAt);
    }
    
    // 跳过不需要检查的铁律
    if (!shouldCheck) {
      console.log(`⏭️ Skipping iron law "${law.id}" (enforce_at: ${enforceAt})`);
      continue;
    }
    
    const passed = await verifyIronLaw(law, context);
    if (!passed) {
      violations.push(law.message || law.id);
      
      context.eventEmitter.emit('iron_law.violated', {
        lawId: law.id,
        message: law.message,
        enforceAt: law.enforce_at,
        executionId: context.executionId
      });
    }
  }
  
  return {
    passed: violations.length === 0,
    violations
  };
}

/**
 * 验证单个铁律
 */
async function verifyIronLaw(law: import('./types').IronLaw, context: ExecutionContext): Promise<boolean> {
  switch (law.id) {
    case 'no_code_without_test':
      // 检查是否有测试文件
      return await checkTestsExist(context);
    
    case 'no_completion_without_verification':
      // 检查测试是否通过
      return await checkTestsPassed(context);
    
    case 'root_cause_first':
      // 检查是否有根本原因分析
      return checkRootCauseAnalysis(context);
    
    default:
      // 自定义铁律，默认通过
      console.warn(`⚠️ Unknown iron law: ${law.id}`);
      return true;
  }
}

/**
 * 检查测试文件是否存在
 * 
 * 智能检查：
 * 1. 如果项目没有源代码文件，返回 true（不需要测试）
 * 2. 如果有源代码但没有测试文件，返回 false
 */
async function checkTestsExist(context: ExecutionContext): Promise<boolean> {
  // 使用项目路径而非 workdir（workdir 可能是 outputs 目录）
  const projectPath = context.inputs.project_path || context.workdir;
  
  // 检查项目目录是否存在
  if (!fs.existsSync(projectPath)) {
    // 项目目录不存在，不需要测试
    return true;
  }
  
  // 检查是否有源代码文件
  const sourceExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go'];
  const excludeDirs = ['node_modules', 'dist', 'build', '.git', '__pycache__'];
  
  let hasSourceFiles = false;
  let hasTestFiles = false;
  
  // 递归检查目录
  function scanDirectory(dir: string, depth: number = 0): void {
    if (depth > 5) return; // 限制深度
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!excludeDirs.includes(entry.name)) {
            scanDirectory(path.join(dir, entry.name), depth + 1);
          }
        } else if (entry.isFile()) {
          const fileName = entry.name;
          const ext = path.extname(fileName);
          
          // 检查是否是测试文件
          if (fileName.includes('.test.') || fileName.includes('.spec.') || 
              fileName.startsWith('test_') || fileName.startsWith('test.') ||
              fileName.endsWith('_test.py')) {
            hasTestFiles = true;
          }
          // 检查是否是源代码文件（排除配置文件）
          else if (sourceExtensions.includes(ext) && 
                   !fileName.includes('.config.') && 
                   !fileName.startsWith('.') &&
                   !fileName.includes('.d.ts')) {
            hasSourceFiles = true;
          }
        }
      }
    } catch (e) {
      // 忽略权限错误
    }
  }
  
  scanDirectory(projectPath);
  
  // 如果没有源代码文件，不需要测试
  if (!hasSourceFiles) {
    console.log('📋 No source files found, skipping test check');
    return true;
  }
  
  // 有源代码文件，检查是否有测试文件
  return hasTestFiles;
}

/**
 * 检查测试是否通过
 */
async function checkTestsPassed(context: ExecutionContext): Promise<boolean> {
  // 检查步骤结果中是否有测试结果
  for (const step of context.steps) {
    if (step.stepId.includes('test') && step.output) {
      if (typeof step.output === 'object' && step.output.passed !== undefined) {
        return step.output.passed;
      }
      // 检查 run-tests 步骤的输出
      if (typeof step.output === 'object' && step.output.passed_count !== undefined) {
        return step.output.failed_count === 0;
      }
    }
  }
  
  // 使用项目路径而非 workdir
  const projectPath = context.inputs.project_path || context.workdir;
  
  // 如果没有测试步骤，尝试运行测试
  try {
    execSync('npm test -- --passWithNoTests', {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: DEFAULT_TEST_TIMEOUT_MS
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 检查根本原因分析
 */
function checkRootCauseAnalysis(context: ExecutionContext): boolean {
  // 检查是否有失败或错误需要调试
  let hasFailure = false;
  
  for (const step of context.steps) {
    if (step.status === 'failed' || (step.output && typeof step.output === 'object' && step.output.passed === false)) {
      hasFailure = true;
      break;
    }
  }
  
  // 如果没有失败，不需要根本原因分析
  if (!hasFailure) {
    return true;
  }
  
  // 有失败时，检查 session history 中是否有根本原因分析
  if (context.sessionHistory) {
    for (const entry of context.sessionHistory) {
      if (entry.output && typeof entry.output === 'string') {
        if (entry.output.includes('根本原因') || 
            entry.output.includes('root cause') ||
            entry.output.includes('Root Cause')) {
          return true;
        }
      }
    }
  }
  
  return false;
}

/**
 * 验证检查点 (AR-003: 使用 harness CheckpointValidator)
 *
 * 支持 13 种检查类型：
 * - file_exists, file_not_empty, file_contains, file_not_contains
 * - command_success, command_output
 * - output_contains, output_not_contains, output_matches
 * - json_path, http_status, http_body, custom
 *
 * @see harness/src/core/validators/checkpoint.ts
 */
async function verifyCheckpoint(checkpoint: any, context: ExecutionContext): Promise<boolean> {
  const projectPath = context.inputs.project_path || context.workdir;

  // 🆕 如果 checkpoint 是 harness Checkpoint 格式（有 checks 数组）
  if (checkpoint.checks && Array.isArray(checkpoint.checks)) {
    const validator = CheckpointValidator.getInstance();
    const checkpointContext: CheckpointContext = {
      projectPath,
      workdir: projectPath,
      output: context.outputs,
    };

    try {
      const result: CheckpointResult = await validator.validate(
        checkpoint as Checkpoint,
        checkpointContext
      );

      if (!result.passed) {
        console.log(`  ❌ Checkpoint failed: ${result.message}`);
        for (const check of result.checks) {
          if (!check.passed) {
            console.log(`    - ${check.checkId}: ${check.message}`);
          }
        }
      } else {
        console.log(`  ✅ Checkpoint passed: ${result.message}`);
      }

      return result.passed;
    } catch (error) {
      console.error(`  ⚠️ Checkpoint validation error: ${(error as Error).message}`);
      return false;
    }
  }

  // 🔄 向后兼容：旧格式 checkpoint 转换为 harness 格式
  // 支持：checkpoint.verify, checkpoint.check, checkpoint.type
  const validator = CheckpointValidator.getInstance();
  const convertedCheckpoint = convertLegacyCheckpoint(checkpoint);
  const checkpointContext: CheckpointContext = {
    projectPath,
    workdir: projectPath,
    output: context.outputs,
  };

  try {
    const result = await validator.validate(convertedCheckpoint, checkpointContext);
    return result.passed;
  } catch (error) {
    console.error(`  ⚠️ Checkpoint validation error: ${(error as Error).message}`);
    return false;
  }
}

/**
 * 将旧格式 checkpoint 转换为 harness Checkpoint 格式
 */
function convertLegacyCheckpoint(legacy: any): Checkpoint {
  const checks: Checkpoint['checks'] = [];

  // 格式 1: checkpoint.verify = "描述性文本" 或 "文件路径"
  if (legacy.verify) {
    const verifyText = legacy.verify.trim();

    // 检查是否像文件路径
    const isFilePath = verifyText.includes('.') || verifyText.startsWith('/') || verifyText.startsWith('./');

    if (isFilePath) {
      checks.push({
        id: 'legacy-verify',
        type: 'file_exists',
        config: { path: verifyText },
      });
    } else {
      // 描述性文本，创建一个始终通过的 custom check
      console.log(`  📋 Checkpoint (descriptive): ${legacy.verify}`);
      // 直接返回一个通过的 checkpoint
      return {
        id: 'legacy-descriptive',
        checks: [],
      };
    }
  }

  // 格式 2: checkpoint.check = "file_exists", checkpoint.path = "..."
  if (legacy.check === 'file_exists' && legacy.path) {
    checks.push({
      id: 'legacy-file-exists',
      type: 'file_exists',
      config: { path: legacy.path },
    });
  }

  // 格式 3: checkpoint.check = "command_success", checkpoint.command = "..."
  if (legacy.check === 'command_success' && legacy.command) {
    checks.push({
      id: 'legacy-command-success',
      type: 'command_success',
      config: { command: legacy.command },
    });
  }

  // 格式 4: checkpoint.type = "xxx"（另一种旧格式）
  if (legacy.type && !legacy.check) {
    checks.push({
      id: 'legacy-type',
      type: legacy.type as any,
      config: {
        path: legacy.path,
        content: legacy.content,
        expected: legacy.expected,
        command: legacy.command,
        pattern: legacy.pattern,
        url: legacy.url,
        jsonPath: legacy.jsonPath,
      },
    });
  }

  return {
    id: legacy.id || 'converted-checkpoint',
    checks,
  };
}

/**
 * 执行单个步骤
 */
async function executeStep(step: Step, context: ExecutionContext): Promise<void> {
  // 检查条件是否满足
  if (step.condition) {
    const conditionMet = evaluateCondition(step.condition, context);
    if (!conditionMet) {
      console.log(`⏭️ Skipping step: ${step.id} (condition not met: ${step.condition})`);
      
      context.eventEmitter.emit('step.skipped', {
        stepId: step.id,
        reason: 'condition_not_met'
      });
      return;
    }
  }
  
  // 检查是否需要跳过（断点续传）
  if (context.skipSteps?.includes(step.id)) {
    console.log(`⏭️ Skipping completed step: ${step.id}`);
    
    context.eventEmitter.emit('step.skipped', {
      stepId: step.id,
      reason: 'already_completed'
    });
    return;
  }
  
  const startTime = new Date();
  
  const stepResult: StepResult = {
    stepId: step.id,
    status: 'running',
    startTime,
  };
  
  context.steps.push(stepResult);
  
  // 更新状态文件
  if (context.stateHandle) {
    await context.stateHandle.updateStep(step.id, {
      status: 'running',
      startTime: startTime.toISOString()
    });
  }
  
  context.eventEmitter.emit(Events.STEP_STARTED, {
    stepId: step.id,
    step: step.step,
    tool: step.tool
  });
  
  // 🆕 更新进度追踪器
  const tracker = getProgressTracker(context.executionId);
  if (tracker) {
    const stepDefName = step.step ? getStep(step.step)?.name : undefined;
    tracker.startStep(step.id, stepDefName, step.phaseId, step.phaseName);
  }
  
  // 计算输入和缓存 key
  const stepInput = resolveInput(step.input, context);
  const cacheKey = getStepCacheKey(context.workflow.id, step.id, stepInput);
  
  try {
    let output: any;
    
    // 检查缓存
    if (context.useCache && context.stepCache?.has(cacheKey)) {
      output = context.stepCache.get(cacheKey);
      context.eventEmitter.emit('step.cached', {
        stepId: step.id,
        cached: true
      });
    } else {
      // 步骤引用：加载步骤定义并执行
      if (step.step) {
        const stepDef = getStep(step.step);
        
        // 🆕 AW-035: 支持子工作流
        if (!stepDef) {
          // 检查是否是子工作流（在 workflows/ 目录下）
          const subWorkflowPath = path.join(config.workflowsPath, 'workflows', `${step.step}.yml`);
          if (fs.existsSync(subWorkflowPath)) {
            console.log(`🔄 Executing sub-workflow: ${step.step}`);
            
            // 加载子工作流
            const subWorkflow = parseWorkflow(step.step);
            const resolvedInput = resolveInput(step.input, context);
            
            // 创建子上下文
            const subContext: ExecutionContext = {
              ...context,
              workflow: subWorkflow,
              outputs: { ...context.outputs },
            };
            
            // 执行子工作流的步骤
            await executeSteps(subWorkflow.steps || [], subContext);
            
            // 保存输出
            if (step.output) {
              if (Array.isArray(step.output)) {
                for (const field of step.output) {
                  if (subContext.outputs && typeof subContext.outputs === 'object' && field in subContext.outputs) {
                    context.outputs[field] = subContext.outputs[field];
                  }
                }
              } else {
                context.outputs[step.output] = subContext.outputs;
              }
            }
            
            console.log(`✅ Sub-workflow completed: ${step.step}`);
            return;
          }
          
          throw new Error(`Step not found: ${step.step}`);
        }
        
        console.log(`📌 Executing step: ${step.step}`);
        
        // 解析步骤定义中的输入
        // stepDef.inputs 是输入参数定义（数组），step.input 是实际传入的值
        const resolvedInput = resolveInput(step.input, context);
        
        // 执行方式判断
        if (stepDef.prompt) {
          // 新结构：使用 prompt 执行 Agent
          const agentPrompt = stepDef.prompt;
          // 🆕 AR-005: 优先级链 - 步骤指定 > 工作流默认 > 全局默认 > codex
          const agentName = stepDef.agent 
            || context.workflow.defaultAgent 
            || config.defaultAgent 
            || 'codex';
          const temperature = stepDef.temperature ?? 0.3;
          
          // 替换提示词中的变量
          let resolvedPrompt = agentPrompt;
          for (const [key, value] of Object.entries(resolvedInput)) {
            resolvedPrompt = resolvedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
          }
          resolvedPrompt = resolvedPrompt.replace(/{{input}}/g, JSON.stringify(resolvedInput));
          
          // 🔄 注入 Workflow Session 上下文（使用分层注入）
          resolvedPrompt = buildSessionPrompt(
            context.sessionHistory || [],
            resolvedPrompt,
            context.historyCompressor
          );
          
          // 🆕 创建 ProgressParser 解析 Agent 输出
          const progressParser = new ProgressParser({
            heartbeat: {
              interval: 10000,      // 10秒检测一次
              timeout: PARALLEL_EXECUTION_TIMEOUT_MS,
              warningThreshold: DEFAULT_TEST_TIMEOUT_MS,
            },
          });
          
          // 心跳超时事件
          progressParser.on('timeout', (data: any) => {
            console.warn(`⚠️ Agent 输出超时: ${Math.round(data.elapsed / 1000)}秒无输出`);
            context.eventEmitter.emit('agent.timeout', {
              stepId: step.id,
              elapsed: data.elapsed,
              lastProgress: data.lastProgress,
            });
            
            // 通知 ProgressTracker
            const tracker = getProgressTracker(context.executionId);
            if (tracker) {
              tracker.addWarning(step.id, `Agent ${Math.round(data.elapsed / 1000)}秒无输出`);
            }
          });
          
          // 心跳警告事件
          progressParser.on('warning', (data: any) => {
            console.warn(`⚠️ Agent 输出延迟: ${Math.round(data.elapsed / 1000)}秒`);
            context.eventEmitter.emit('agent.warning', {
              stepId: step.id,
              elapsed: data.elapsed,
            });
          });
          
          // 进度事件
          progressParser.on('progress', (info: ProgressInfo) => {
            console.log(`📊 Agent 进度: ${info.percentage}% - ${info.message}`);
            context.eventEmitter.emit('agent.progress.detail', {
              stepId: step.id,
              ...info,
            });
            
            // 更新 ProgressTracker
            const tracker = getProgressTracker(context.executionId);
            if (tracker) {
              tracker.updateStepProgress(step.id, info.percentage, info.message);
            }
          });
          
          // 启动心跳检测
          progressParser.startHeartbeat();
          
          // 调用 Agent - 使用项目路径
          const projectPath = context.inputs.project_path || context.workdir;
          
          // 🆕 获取重试配置
          const retryConfig = step.retry || context.workflow.retry;
          const maxRetries = retryConfig?.maxAttempts || 3;
          const baseDelay = retryConfig?.initialDelay || 5000;
          
          // 🆕 AS-014: 获取 system prompt（角色人设）
          const systemPrompt = context.inputs.personality || context.inputs.systemPrompt;
          
          try {
            // 🆕 使用智能重试
            const result = await spawnWithRetry({
              agent: agentName,
              prompt: resolvedPrompt,
              workdir: projectPath,
              temperature,
              timeout: step.timeout,
              systemPrompt,  // 🆕 AS-014: 传递角色人设
              onProgress: (message) => {
                // 解析进度
                progressParser.parseLine(message);
                
                // 发送原始输出事件
                context.eventEmitter.emit('agent.progress', {
                  stepId: step.id,
                  message
                });
              }
            }, maxRetries, baseDelay);
            
            if (!result.success) {
              // 🆕 保存错误分类信息
              if (result.classifiedError) {
                console.log(`❌ 错误类型: ${result.classifiedError.type}`);
                console.log(`   建议: ${result.classifiedError.suggestion}`);
              }
              throw new Error(result.error || 'Agent execution failed');
            }
            
            output = result.output;
          } finally {
            // 停止心跳检测
            progressParser.stopHeartbeat();
          }
        } else if (stepDef.execute?.type === 'tool' && stepDef.execute.tool) {
          // 旧结构兼容：execute.type = tool
          output = await executeTool(stepDef.execute.tool, resolvedInput, context);
        } else if (stepDef.execute?.type === 'builtin' && stepDef.execute.handler) {
          // 内置处理器：不调用 Agent，直接执行 Node.js 函数
          const { builtinHandlers } = await import('./builtin-handlers');
          const handler = builtinHandlers[stepDef.execute.handler];
          if (!handler) {
            throw new Error(`Unknown builtin handler: ${stepDef.execute.handler}`);
          }
          console.log(`🔧 Executing builtin: ${stepDef.execute.handler}`);
          output = await handler(resolvedInput, context);
        } else if (stepDef.execute?.type === 'script' && stepDef.execute.script) {
          // 🆕 Script 类型：执行 shell 脚本
          console.log(`📜 Executing script: ${step.step}`);
          
                  const script = stepDef.execute.script;
          
          // 替换变量（${inputs.xxx} 格式）
          let processedScript = script;
          for (const [key, value] of Object.entries(resolvedInput)) {
            processedScript = processedScript.replace(new RegExp(`\\$\\{inputs\\.${key}\\}`, 'g'), String(value || ''));
          }
          
          // 确定工作目录（如果不存在则使用 /tmp）
          const workDir = resolvedInput.project_path || context.workdir;
          const effectiveWorkDir = fs.existsSync(workDir) ? workDir : '/tmp';
          
          console.log(`📁 Work directory: ${effectiveWorkDir}`);
          
          // 执行脚本
          const result = execSync(processedScript, {
            cwd: effectiveWorkDir,
            encoding: 'utf-8',
            timeout: DEFAULT_SCRIPT_EXEC_TIMEOUT_MS,
            shell: '/bin/bash',
          });
          
          // 解析输出（格式：key=value）
          output = {};
          for (const line of result.split('\n')) {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
              output[match[1].trim()] = match[2].trim();
            }
          }
          
          console.log(`✅ Script completed:`, output);
        } else {
          throw new Error(`Step ${step.step} must have either 'prompt', 'execute.type: tool', 'execute.type: builtin', or 'execute.type: script'`);
        }
      }
      
      // 直接执行 Tool（step.tool 字段）
      if (step.tool) {
        output = await executeTool(step.tool, stepInput, context);
      }
      
      // 保存到缓存
      if (context.useCache && context.stepCache) {
        context.stepCache.set(cacheKey, output);
      }
    }
    
    // 保存输出
    if (step.output && output !== undefined) {
      if (Array.isArray(step.output)) {
        // 数组格式：output: [project, infrastructure, tasks]
        // 将 output 对象的字段分别保存
        for (const field of step.output) {
          if (output && typeof output === 'object' && field in output) {
            context.outputs[field] = output[field];
          }
        }
      } else {
        // 字符串格式：output: result
        context.outputs[step.output] = output;
        
        // 检查步骤定义是否有文件输出
        const stepDef = step.step ? getStep(step.step) : null;
        if (stepDef?.outputs) {
          const fileOutput = stepDef.outputs.find((o: any) => o.name === step.output && o.type === 'file');
          if (fileOutput && typeof output === 'string') {
            // 写入文件
            const projectPath = context.inputs.project_path || context.workdir;
            const filePath = path.join(projectPath, step.output);
            fs.writeFileSync(filePath, output, 'utf-8');
            console.log(`📝 Written output to file: ${filePath}`);
          }
        }
      }
    }
    
    stepResult.status = 'completed';
    stepResult.output = output;
    stepResult.endTime = new Date();
    stepResult.duration = stepResult.endTime.getTime() - startTime.getTime();
    
    // 🆕 AR-010 P1: 清理大输出
    if (stepResult.output && typeof stepResult.output === 'object') {
      const outputSize = JSON.stringify(stepResult.output).length;
      if (outputSize > 10240) {  // > 10KB
        console.log(`🧹 清理步骤输出: ${step.id} (${outputSize} bytes)`);
        // 输出已写入增量存储，清理内存中的大字段
        // 保留摘要（keyData 已在 historyCompressor 中）
        stepResult.output = { _cleaned: true, _size: outputSize };
      }
    }
    
    // 🆕 更新进度追踪器
    const tracker = getProgressTracker(context.executionId);
    if (tracker) {
      const stepDefName = step.step ? getStep(step.step)?.name : undefined;
      tracker.completeStep(step.id, output);
    }
    
    // 🆕 记录 Token 使用
    const tkTracker = getTokenTracker(context.executionId);
    if (tkTracker && output) {
      const inputText = JSON.stringify(stepInput);
      const outputText = typeof output === 'string' ? output : JSON.stringify(output);
      tkTracker.recordUsage(step.id, inputText, outputText);
    }
    
    // 🔄 记录到 Workflow Session History（使用 HistoryCompressor）
    const stepDefName = step.step ? getStep(step.step)?.name : undefined;
    
    // 🆕 AR-010: 统一使用 HistoryCompressor
    if (context.historyCompressor && output) {
      const stepDef = step.step ? getStep(step.step) : undefined;
      const keyData = extractKeyData(output, stepDef ?? undefined);
      
      context.historyCompressor.addEntry({
        stepId: step.id,
        stepName: stepDefName || step.id,
        status: stepResult.status,
        output: typeof output === 'string' ? output : JSON.stringify(output),
        keyData,
      });
    }
    
    // 🔄 向后兼容：同步更新 sessionHistory
    if (context.sessionHistory) {
      context.sessionHistory.push({
        stepId: step.id,
        stepName: stepDefName,
        phaseId: step.phaseId,
        phaseName: step.phaseName,
        output: typeof output === 'string' ? output.slice(0, 1000) : output,
        timestamp: new Date()
      });
    }
    
    // 更新状态文件
    if (context.stateHandle) {
      await context.stateHandle.updateStep(step.id, {
        status: 'completed',
        endTime: stepResult.endTime.toISOString(),
        output
      });
    }
    
    context.eventEmitter.emit(Events.STEP_COMPLETED, {
      stepId: step.id,
      output,
      cached: context.stepCache?.has(cacheKey)
    });
    
    // 步骤完成通知（通过 NotificationService）
    const notificationService = getNotificationService(context.executionId);
    if (notificationService) {
      const stepIndex = (context.workflow.steps?.findIndex(s => s.id === step.id) ?? -1) + 1;
      const stepDefName = step.step ? getStep(step.step)?.name : step.id;
      await notificationService.notify('step.completed', {
        currentStep: stepDefName,
        completedSteps: stepIndex,
        totalSteps: context.workflow.steps?.length || 0,
        duration: stepResult.duration ? Math.round(stepResult.duration / 1000) : 0,
      });
    }
    
  } catch (error) {
    stepResult.status = 'failed';
    stepResult.error = (error as Error).message;
    stepResult.endTime = new Date();
    stepResult.duration = stepResult.endTime.getTime() - startTime.getTime();
    
    // 🆕 AW-026 步骤级错误处理
    // 检查 step.on_fail 或 error_handlers 配置
    const onFail = step.on_fail;
    const errorHandlers = step.error_handlers || context.workflow.error_handlers;
    
    // 获取步骤定义（用于 fallback）
    let stepDef: any = null;
    if (step.step) {
      stepDef = getStep(step.step);
    }
    
    // 构建 fallback prompt
    let fallbackPrompt: string = '';
    if (stepDef && stepDef.prompt) {
      // 使用步骤定义的 prompt
      const stepInput = resolveInput(step.input, context);
      fallbackPrompt = stepDef.prompt;
      for (const [key, value] of Object.entries(stepInput)) {
        fallbackPrompt = fallbackPrompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      fallbackPrompt = fallbackPrompt.replace(/{{input}}/g, JSON.stringify(stepInput));
    }
    
    if (onFail || (errorHandlers && errorHandlers.length > 0)) {
      console.log(`🔧 [AW-026] 步骤级错误处理激活: ${onFail || 'error_handlers'}`);
      
      // 创建错误处理器
      const errorHandler = createErrorHandler({
        handlers: errorHandlers,
        eventEmitter: context.eventEmitter,
      });
      
      // 分类错误
      const classification = classifyStepError(error as Error);
      
      // 根据配置决定处理方式
      if (onFail === 'skip') {
        console.log(`⏭️ [AW-026] 跳过步骤 ${step.id}`);
        stepResult.status = 'skipped';
        stepResult.error = `Skipped due to error: ${(error as Error).message}`;
        context.eventEmitter.emit('step.skipped', { stepId: step.id });
        
        // 更新状态文件
        if (context.stateHandle) {
          await context.stateHandle.updateStep(step.id, {
            status: 'skipped',
            endTime: stepResult.endTime.toISOString(),
            error: stepResult.error
          });
        }
        return;  // 跳过，不抛出错误
      }
      
      if (onFail === 'continue') {
        console.log(`⚠️ [AW-026] 继续执行后续步骤（忽略错误）`);
        stepResult.status = 'completed_with_error';
        stepResult.error = (error as Error).message;
        
        // 更新状态文件
        if (context.stateHandle) {
          await context.stateHandle.updateStep(step.id, {
            status: 'completed_with_error',
            endTime: stepResult.endTime.toISOString(),
            error: stepResult.error
          });
        }
        return;  // 继续，不抛出错误
      }
      
      if (onFail === 'fallback' && step.fallback) {
        console.log(`🔄 [AW-026] 使用备用方案: ${step.fallback.agent || step.fallback.step}`);
        
        try {
          // 执行备用步骤或 Agent
          let fallbackOutput: any;
          
          if (step.fallback.step) {
            // 备用步骤
            const fallbackStepDef = getStep(step.fallback.step);
            if (!fallbackStepDef) {
              throw new Error(`Fallback step not found: ${step.fallback.step}`);
            }
            
            // 执行备用步骤
            const fallbackAgent = step.fallback.agent 
              || fallbackStepDef.agent 
              || context.workflow.defaultAgent 
              || config.defaultAgent 
              || 'codex';
            const fallbackTemperature = step.fallback.temperature ?? fallbackStepDef.temperature ?? 0.3;
            
            const projectPath = context.inputs.project_path || context.workdir;
            const result = await spawnAgent({
              agent: fallbackAgent,
              prompt: fallbackStepDef.prompt || '',
              workdir: projectPath,
              temperature: fallbackTemperature,
              timeout: step.fallback.timeout || step.timeout,
            });
            
            if (!result.success) {
              throw new Error(result.error || 'Fallback agent execution failed');
            }
            fallbackOutput = result.output;
          } else if (step.fallback.agent) {
            // 备用 Agent（使用构建的 prompt）
            const projectPath = context.inputs.project_path || context.workdir;
            const result = await spawnAgent({
              agent: step.fallback.agent,
              prompt: fallbackPrompt || 'Retry the failed step',
              workdir: projectPath,
              temperature: step.fallback.temperature ?? 0.5,
              timeout: step.fallback.timeout || step.timeout,
            });
            
            if (!result.success) {
              throw new Error(result.error || 'Fallback agent execution failed');
            }
            fallbackOutput = result.output;
          }
          
          // 备用方案成功
          stepResult.status = 'completed';
          stepResult.output = fallbackOutput;
          (stepResult as any).fallbackUsed = true;
          stepResult.endTime = new Date();
          stepResult.duration = stepResult.endTime.getTime() - startTime.getTime();
          
          console.log(`✅ [AW-026] 备用方案成功`);
          
          // 保存输出
          if (step.output && fallbackOutput !== undefined) {
            context.outputs[step.output] = fallbackOutput;
          }
          
          // 更新状态文件
          if (context.stateHandle) {
            await context.stateHandle.updateStep(step.id, {
              status: 'completed',
              endTime: stepResult.endTime.toISOString(),
              output: fallbackOutput,
              fallbackUsed: true,
            });
          }
          
          return;  // 备用方案成功，不抛出错误
          
        } catch (fallbackError) {
          console.log(`❌ [AW-026] 备用方案失败: ${(fallbackError as Error).message}`);
          // 备用方案失败，继续原有流程（abort）
        }
      }
      
      // 使用 error_handlers 规则处理
      if (errorHandlers && errorHandlers.length > 0) {
        const handlerResult = await errorHandler.handleError(
          error as Error,
          step,
          context,
          // onRetry 回调 - 重试原步骤
          async () => {
            console.log(`🔄 [AW-026] 错误处理规则触发重试`);
            // 这里需要重新执行步骤
            // 简化实现：直接抛出让原有重试逻辑处理
            throw error;
          },
          // onFallback 回调 - 使用备用 Agent
          async (fallbackConfig: FallbackConfig) => {
            const projectPath = context.inputs.project_path || context.workdir;
            const result = await spawnAgent({
              agent: fallbackConfig.agent || 'claude-code',
              prompt: fallbackPrompt || 'Retry the failed step',
              workdir: projectPath,
              temperature: fallbackConfig.temperature ?? 0.5,
              timeout: fallbackConfig.timeout || step.timeout,
            });
            
            if (!result.success) {
              throw new Error(result.error || 'Fallback execution failed');
            }
            return result.output;
          }
        );
        
        if (handlerResult.success) {
          // 错误处理成功（跳过/继续/备用成功）
          if (handlerResult.action.type === 'skip') {
            stepResult.status = 'skipped';
            stepResult.error = `Handled by error handler: skipped`;
          } else if (handlerResult.action.type === 'continue') {
            stepResult.status = 'completed_with_error';
            stepResult.error = (error as Error).message;
          } else {
            stepResult.status = 'completed';
            stepResult.output = handlerResult.output;
            (stepResult as any).fallbackUsed = handlerResult.fallbackUsed;
            (stepResult as any).retriesAttempted = handlerResult.retriesAttempted;
          }
          
          // 保存输出
          if (step.output && handlerResult.output !== undefined) {
            context.outputs[step.output] = handlerResult.output;
          }
          
          // 更新状态文件
          if (context.stateHandle) {
            await context.stateHandle.updateStep(step.id, {
              status: stepResult.status,
              endTime: stepResult.endTime.toISOString(),
              output: handlerResult.output,
              fallbackUsed: handlerResult.fallbackUsed,
              retriesAttempted: handlerResult.retriesAttempted,
            });
          }
          
          return;  // 错误处理成功，不抛出错误
        }
      }
    }
    
    // 🆕 更新进度追踪器
    const tracker = getProgressTracker(context.executionId);
    let classifiedError: import('./types').ClassifiedError | undefined;
    if (tracker) {
      classifiedError = tracker.failStep(step.id, (error as Error).message);
      // 可以根据 classified.type 决定重试策略
    }
    
    // 🆕 失败归因分析 - 识别能力缺口
    try {
      const analysisResult = analyzeRootCause({
        executionId: context.executionId,
        workflowId: context.workflow.id,
        stepId: step.id,
        roleId: (step as any).roleId || context.workflow.id,
        errorMessage: stepResult.error || '',
        errorType: classifiedError?.type,
        exitCode: (stepResult as any).exitCode,
        context: {
          constraintLevel: (context as any).constraintLevel,
          retryCount: (stepResult as any).retryHistory?.length || 0,
          testPassed: (stepResult as any).testPassed,
        },
        workDir: context.workdir,
      });
      
      // 保存 Gap Report
      saveGapReport(analysisResult.gapReport, context.workdir);
      
      console.log(`🔍 Root cause analysis: ${analysisResult.rootCause} (confidence: ${Math.round(analysisResult.confidence * 100)}%)`);
      console.log(`📋 Gap Report: ${analysisResult.gapReport.id}`);
      
      // 将分析结果附加到步骤结果
      (stepResult as any).rootCauseAnalysis = {
        rootCause: analysisResult.rootCause,
        confidence: analysisResult.confidence,
        gapReportId: analysisResult.gapReport.id,
      };
    } catch (analysisError) {
      console.warn(`⚠️ Root cause analysis failed: ${(analysisError as Error).message}`);
    }
    
    // 检查是否需要重试
    let retryConfig = step.retry || context.workflow.retry;
    
    // 兼容旧格式：retry: true + max_retries: 3
    if (retryConfig && typeof retryConfig === 'boolean' && retryConfig) {
      // 旧格式：max_retries 在 step 或 workflow 级别
      const maxRetries = (step as any).max_retries || (context.workflow as any).max_retries || 3;
      retryConfig = { maxAttempts: maxRetries };
    }
    // 兼容旧格式：max_retries 变量名 → maxAttempts
    if (retryConfig && (retryConfig as any).max_retries && !retryConfig.maxAttempts) {
      retryConfig.maxAttempts = (retryConfig as any).max_retries;
    }
    
    if (retryConfig && retryConfig.maxAttempts > 1) {
      console.log(`🔄 Step ${step.id} failed, checking retry...`);
      
      // 获取或初始化重试历史
      const retryHistory: import('./types').RetryAttempt[] = (stepResult as any).retryHistory || [];
      const currentAttempt = retryHistory.length + 1;
      
      if (currentAttempt < retryConfig.maxAttempts) {
        console.log(`🔄 Retrying step ${step.id} (attempt ${currentAttempt + 1}/${retryConfig.maxAttempts})`);
        
        // 记录本次失败
        retryHistory.push({
          attempt: currentAttempt,
          error: stepResult.error,
          timestamp: new Date().toISOString()
        });
        (stepResult as any).retryHistory = retryHistory;
        
        // 计算延迟
        const delay = calculateRetryDelay(currentAttempt, retryConfig);
        if (delay > 0) {
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // 重试执行
        stepResult.status = 'running';
        stepResult.error = undefined;
        
        try {
          let output: any;
          
          // 重试：重新加载 step 定义并执行
          if (step.step) {
            const stepDef = getStep(step.step);
            if (!stepDef) {
              throw new Error(`Step not found: ${step.step}`);
            }
            
            if (!stepDef.prompt) {
              throw new Error(`Step ${step.step} missing prompt field`);
            }
            
            const resolvedInput = resolveInput(step.input, context);
            const agentPrompt = stepDef.prompt;
            // 🆕 AR-005: 优先级链 - 步骤指定 > 工作流默认 > 全局默认 > codex
            const agentName = stepDef.agent 
              || context.workflow.defaultAgent 
              || config.defaultAgent 
              || 'codex';
            const temperature = stepDef.temperature ?? 0.3;
            
            let resolvedPrompt: string = agentPrompt;
            for (const [key, value] of Object.entries(resolvedInput)) {
              resolvedPrompt = resolvedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            }
            resolvedPrompt = resolvedPrompt.replace(/{{input}}/g, JSON.stringify(resolvedInput));
            
            // 使用项目路径
            const projectPath = context.inputs.project_path || context.workdir;
            const result = await spawnAgent({
              agent: agentName,
              prompt: resolvedPrompt,
              workdir: projectPath,
              temperature,
              timeout: step.timeout,
            });
            
            if (!result.success) {
              throw new Error(result.error || 'Agent execution failed');
            }
            output = result.output;
          } else if (step.tool) {
            output = await executeTool(step.tool, stepInput, context);
          }
          
          // 重试成功
          stepResult.status = 'completed';
          stepResult.output = output;
          stepResult.endTime = new Date();
          stepResult.duration = stepResult.endTime.getTime() - startTime.getTime();
          
          console.log(`✅ Step ${step.id} retry succeeded`);
          return;
        } catch (retryError) {
          // 重试仍然失败，继续抛出
          stepResult.error = (retryError as Error).message;
        }
      }
    }
    
    // 更新状态文件
    if (context.stateHandle) {
      await context.stateHandle.updateStep(step.id, {
        status: 'failed',
        endTime: stepResult.endTime.toISOString(),
        error: stepResult.error
      });
    }
    
    context.eventEmitter.emit(Events.STEP_FAILED, {
      stepId: step.id,
      error: stepResult.error
    });
    
    // 🆕 检查是否支持部分成功
    const continueOnFailure = context.workflow.continueOnFailure;
    if (continueOnFailure) {
      const config = typeof continueOnFailure === 'boolean' 
        ? { enabled: continueOnFailure, onStepFailure: 'continue' as const }
        : continueOnFailure;
      
      // 检查是否允许此步骤失败
      const isAllowedFailure = !config.failureSteps || config.failureSteps.includes(step.id);
      
      if (config.enabled && isAllowedFailure) {
        console.log(`⚠️ Step ${step.id} failed but continuing (continueOnFailure enabled)`);
        
        // 添加警告
        const tracker = getProgressTracker(context.executionId);
        tracker?.addWarning(step.id, `步骤失败但继续执行: ${stepResult.error}`);
        
        // 根据配置决定行为
        if (config.onStepFailure === 'warn') {
          console.log(`   Warning: Step ${step.id} failed`);
        }
        
        // 不抛出错误，继续执行
        return;
      }
      
      // 检查是否超过最大失败数
      const failedSteps = context.steps.filter(s => s.status === 'failed').length;
      if (config.maxFailures && failedSteps >= config.maxFailures) {
        console.log(`❌ Max failures reached (${failedSteps}/${config.maxFailures}), aborting`);
        throw error;
      }
    }
    
    throw error;
  }
}

/**
 * 计算重试延迟
 */
function calculateRetryDelay(attempt: number, config: import('./types').RetryConfig): number {
  const backoff = config.backoff || 'exponential';
  const initialDelay = config.initialDelay || 1000;
  const maxDelay = config.maxDelay || DEFAULT_MAX_RETRY_DELAY_MS;
  
  if (backoff === 'fixed') {
    return Math.min(initialDelay, maxDelay);
  }
  
  // exponential or smart
  const delay = initialDelay * Math.pow(2, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * 构建智能重试 Prompt
 */
function buildSmartRetryPrompt(originalPrompt: string, error: string): string {
  return `之前的尝试失败了，原因：${error}

请分析失败原因并调整策略，重新完成任务。

原始需求：
${originalPrompt}

请：
1. 分析失败原因
2. 制定新的解决方案
3. 重新实现

注意：不要重复之前的错误。`;
}

/**
 * 解析输入变量
 */
export function resolveInput(input: Record<string, any> | undefined, context: ExecutionContext): Record<string, any> {
  if (!input) return {};
  
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      let resolvedValue = value;
      let isJsonParsed = false;
      
      // 替换 ${steps.xxx.output} 形式的变量 - 步骤 output 直接引用
      resolvedValue = resolvedValue.replace(/\$\{steps\.([\w-]+)\.output\}/g, (_, stepId) => {
        const stepResult = context.steps.find(s => s.stepId === stepId);
        if (!stepResult) {
          console.warn(`⚠️ Step not found: ${stepId}`);
          return '';
        }
        
        const output = stepResult.output;
        if (typeof output === 'string') {
          return output;
        }
        if (typeof output === 'object' && output !== null) {
          isJsonParsed = true;
          return JSON.stringify(output);
        }
        return '';
      });
      
      // 替换 ${steps.xxx.outputs.field} 形式的变量 - 步骤 output 字段引用
      resolvedValue = resolvedValue.replace(/\$\{steps\.([\w-]+)\.outputs\.([\w-]+)\}/g, (_, stepId, field) => {
        const stepResult = context.steps.find(s => s.stepId === stepId);
        if (!stepResult) {
          console.warn(`⚠️ Step not found: ${stepId}`);
          return '';
        }
        
        let fieldValue = stepResult.output?.[field];
        
        // 对于对象和数组，保留原始值而不是 JSON.stringify
        if (typeof fieldValue === 'object' && fieldValue !== null) {
          isJsonParsed = true;
          return JSON.stringify(fieldValue);
        }
        if (typeof fieldValue === 'string') {
          return fieldValue;
        }
        return JSON.stringify(fieldValue) ?? '';
      });
      
      // 如果值是 JSON 字符串，尝试解析
      if (isJsonParsed && (resolvedValue.startsWith('{') || resolvedValue.startsWith('['))) {
        try {
          resolved[key] = JSON.parse(resolvedValue);
          continue;
        } catch {
          // 解析失败，保持原值
        }
      }
      
      // 替换 ${inputs.xxx} 形式的变量 - 输入参数引用
      resolvedValue = resolvedValue.replace(/\$\{inputs\.([\w-]+)\}/g, (_, varName) => {
        return context.inputs[varName] ?? '';
      });
      
      // 替换 {{inputs.xxx}} 形式的变量
      resolvedValue = resolvedValue.replace(/\{\{inputs\.([\w-]+)\}\}/g, (_, varName) => {
        return context.inputs[varName] ?? '';
      });
      
      // 替换 {{outputs.xxx}} 或 {{xxx}} 形式的变量
      resolvedValue = resolvedValue.replace(/\{\{(?:outputs\.)?([\w.-]+)\}\}/g, (_, varName) => {
        return context.outputs[varName] ?? '';
      });
      
      // 替换 ${var} 形式的变量（兼容旧格式，最后处理避免覆盖）
      resolvedValue = resolvedValue.replace(/\$\{([\w-]+)\}/g, (_, varName) => {
        // 优先从 outputs 查找，其次 inputs
        return context.outputs[varName] ?? context.inputs[varName] ?? '';
      });
      
      resolved[key] = resolvedValue;
    } else if (typeof value === 'object' && value !== null) {
      // 递归处理嵌套对象
      resolved[key] = resolveInput(value, context);
    } else {
      resolved[key] = value;
    }
  }
  
  return resolved;
}

/**
 * 查询执行状态
 */
export function getWorkflowStatus(executionId: string): ExecutionResult | null {
  return executions.get(executionId) || null;
}

/**
 * 取消执行
 */
export function cancelWorkflow(executionId: string): boolean {
  const result = executions.get(executionId);
  if (result && result.status === 'running') {
    result.status = 'cancelled';
    result.endTime = new Date();
    return true;
  }
  return false;
}

/**
 * 执行子工作流
 */
async function executeSubWorkflows(
  subWorkflows: import('./types').SubWorkflow[],
  context: ExecutionContext
): Promise<void> {
  for (const subWf of subWorkflows) {
    // 检查条件
    if (subWf.condition) {
      const conditionMet = evaluateCondition(subWf.condition, context);
      if (!conditionMet) {
        console.log(`⏭️ Skipping sub-workflow: ${subWf.id} (condition not met)`);
        continue;
      }
    }
    
    console.log(`\n🔗 Executing sub-workflow: ${subWf.workflow} (${subWf.id})`);
    
    context.eventEmitter.emit('sub_workflow.started', {
      subWorkflowId: subWf.id,
      workflowId: subWf.workflow,
      executionId: context.executionId
    });
    
    try {
      // 解析输入
      const subInput = resolveInput(subWf.input || {}, context);
      
      // 确保子工作流继承 project_path
      if (context.inputs.project_path && !subInput.project_path) {
        subInput.project_path = context.inputs.project_path;
      }
      
      // 递归执行子工作流
      const subResult = await executeWorkflow(
        subWf.workflow,
        subInput,
        {
          workdir: context.workdir,
          useCache: context.useCache,
          onEvent: (event) => {
            // 转发子工作流事件
            context.eventEmitter.emit('sub_workflow.progress', {
              subWorkflowId: subWf.id,
              ...event
            });
          }
        }
      );
      
      // 提取输出到父上下文
      if (subWf.outputs && subResult.outputs) {
        for (const outputKey of subWf.outputs) {
          if (subResult.outputs[outputKey] !== undefined) {
            context.outputs[outputKey] = subResult.outputs[outputKey];
          }
        }
      }
      
      // 记录步骤结果
      context.steps.push({
        stepId: `sub-workflow-${subWf.id}`,
        status: 'completed',
        output: subResult.outputs,
        startTime: subResult.startTime,
        endTime: subResult.endTime,
        duration: subResult.duration
      });
      
      // 记录到 session history
      // 记录到 session history
      const subWfOutput = subResult.outputs;
      
      // 🆕 使用 HistoryCompressor（优先）
      if (context.historyCompressor && subWfOutput) {
        // 映射状态：running → completed（子工作流完成后不可能 running）
        const mappedStatus = subResult.status === 'cancelled' ? 'skipped' : 
          (subResult.status === 'running' ? 'completed' : subResult.status);
        
        // 🆕 AR-010: 统一使用 HistoryCompressor
        if (context.historyCompressor) {
          context.historyCompressor.addEntry({
            stepId: `sub-workflow-${subWf.id}`,
            stepName: subWf.workflow,
            status: mappedStatus as 'completed' | 'failed' | 'skipped',
            output: JSON.stringify(subWfOutput),
            keyData: extractKeyData(subWfOutput),
          });
        }
        
        // 🔄 向后兼容：同步更新 sessionHistory
        if (context.sessionHistory) {
          context.sessionHistory.push({
            stepId: `sub-workflow-${subWf.id}`,
            stepName: subWf.workflow,
            output: subWfOutput,
            timestamp: new Date()
          });
        }
      }
      
      context.eventEmitter.emit('sub_workflow.completed', {
        subWorkflowId: subWf.id,
        workflowId: subWf.workflow,
        outputs: subResult.outputs,
        executionId: context.executionId
      });
      
    } catch (error) {
      console.error(`❌ Sub-workflow ${subWf.id} failed:`, (error as Error).message);
      
      context.eventEmitter.emit('sub_workflow.failed', {
        subWorkflowId: subWf.id,
        workflowId: subWf.workflow,
        error: (error as Error).message,
        executionId: context.executionId
      });
      
      // 检查是否需要回滚
      if (context.workflow.rollback?.enabled) {
        const shouldRollback = context.workflow.rollback.on_phases?.includes(subWf.id);
        if (shouldRollback) {
          console.log('🔄 Triggering rollback due to sub-workflow failure...');
          await executeRollback(context.workflow.rollback, context);
        }
      }
      
      throw error;
    }
  }
}

/**
 * 评估条件表达式
 */
function evaluateCondition(condition: string, context: ExecutionContext): boolean {
  console.log(`🔍 Evaluating condition: ${condition}`);
  
  // 替换变量
  let resolvedCondition = condition;
  
  // ${steps.xxx.output.field} 或 ${steps.xxx.outputs.field} - 步骤输出字段引用
  resolvedCondition = resolvedCondition.replace(/\$\{steps\.([\w-]+)\.(output|outputs)(?:\.([\w.-]+))?\}/g, (_, stepId, outputType, field) => {
    const stepResult = context.steps.find(s => s.stepId === stepId);
    if (!stepResult) return '0';
    
    if (field) {
      // ${steps.xxx.output.field}
      const fieldValue = stepResult.output?.[field];
      if (Array.isArray(fieldValue)) {
        return String(fieldValue.length);
      }
      return String(fieldValue ?? '0');
    } else {
      // ${steps.xxx.output}
      return String(stepResult.output ?? '');
    }
  });
  
  // 🆕 ${steps.xxx.field} - 直接字段引用（无 output 中间词）
  resolvedCondition = resolvedCondition.replace(/\$\{steps\.([\w-]+)\.([\w.-]+)\}/g, (_, stepId, field) => {
    const stepResult = context.steps.find(s => s.stepId === stepId);
    console.log(`  🔎 Looking for step '${stepId}' with field '${field}'`);
    console.log(`  🔎 context.steps: ${context.steps.map(s => s.stepId).join(', ')}`);
    
    if (!stepResult) {
      console.log(`  ❌ Step not found: ${stepId}`);
      return '';
    }
    
    const fieldValue = stepResult.output?.[field];
    console.log(`  ✅ Found: ${field} = ${fieldValue}`);
    return String(fieldValue ?? '');
  });
  
  console.log(`  📝 Resolved condition: ${resolvedCondition}`);
  
  // ${inputs.xxx} 或 ${outputs.xxx}
  resolvedCondition = resolvedCondition.replace(/\$\{([\w.-]+)\}/g, (_, varName) => {
    return String(context.outputs[varName] ?? context.inputs[varName] ?? '');
  });
  
  // {{inputs.xxx}}
  resolvedCondition = resolvedCondition.replace(/\{\{inputs\.([\w-]+)\}\}/g, (_, varName) => {
    return String(context.inputs[varName] ?? '');
  });
  
  // 简单条件评估
  // == true / == false
  if (resolvedCondition.includes('== true')) {
    const left = resolvedCondition.split('==')[0].trim();
    return left === 'true';
  }
  if (resolvedCondition.includes('== false')) {
    const left = resolvedCondition.split('==')[0].trim();
    return left === 'false';
  }
  if (resolvedCondition.includes('!= false')) {
    const left = resolvedCondition.split('!=')[0].trim();
    return left !== 'false';
  }
  if (resolvedCondition.includes('!= true')) {
    const left = resolvedCondition.split('!=')[0].trim();
    return left !== 'true';
  }
  
  // 包含数字比较
  const numMatch = resolvedCondition.match(/(.+?)\s*(>|<|>=|<=|==|!=)\s*(\d+)/);
  if (numMatch) {
    const left = parseFloat(numMatch[1].trim()) || 0;
    const op = numMatch[2];
    const right = parseFloat(numMatch[3]);
    
    switch (op) {
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '==': return left === right;
      case '!=': return left !== right;
    }
  }
  
  // 🆕 字符串比较（单引号）
  const strMatch = resolvedCondition.match(/(.+?)\s*(==|!=)\s*'(.+)'/);
  if (strMatch) {
    const left = strMatch[1].trim();
    const op = strMatch[2];
    const right = strMatch[3];
    
    console.log(`  🔤 String compare: '${left}' ${op} '${right}'`);
    
    if (op === '==') {
      return left === right;
    } else {
      return left !== right;
    }
  }
  
  // 默认：检查是否为真值
  return Boolean(resolvedCondition.trim());
}

/**
 * 执行回滚
 */
async function executeRollback(
  rollbackConfig: import('./types').RollbackConfig,
  context: ExecutionContext
): Promise<void> {
  console.log('\n🔄 Executing rollback...');
  
  if (!rollbackConfig.steps || rollbackConfig.steps.length === 0) {
    console.log('⚠️ No rollback steps defined');
    return;
  }
  
  for (const step of rollbackConfig.steps) {
    console.log(`  📌 ${step.message || step.command}`);
    
    try {
          const projectPath = context.inputs.project_path || context.workdir;
      execSync(step.command, {
        cwd: projectPath,
        stdio: 'inherit'
      });
      
      console.log(`  ✅ ${step.message || 'Rollback step completed'}`);
      
    } catch (error) {
      console.error(`  ❌ Rollback step failed: ${(error as Error).message}`);
      
      if (step.on_error === 'abort') {
        throw error;
      }
      // continue - 继续执行下一步
    }
  }
  
  console.log('✅ Rollback completed');
  
  context.eventEmitter.emit('rollback.completed', {
    executionId: context.executionId
  });
}

/**
 * 🆕 执行 Batch Iterator - 批次迭代执行
 * 
 * 将数据源按批次拆分，每批次执行一组步骤
 * 支持批次间状态传递和进度追踪
 */
async function executeBatchIterator(step: Step, context: ExecutionContext): Promise<void> {
  console.log(`\n🔄 Executing batch iterator: ${step.id}`);
  
  // 解析数据源
  const source = resolveValue(step.source || '', context);
  if (!Array.isArray(source)) {
    console.warn(`⚠️ Batch iterator source must be an array, got: ${typeof source}`);
    return;
  }
  
  const batches = source;
  const batchVar = step.batch_var || 'current_batch';
  const indexVar = step.index_var || 'batch_index';
  const subSteps = step.steps || [];
  
  console.log(`📦 Total batches: ${batches.length}`);
  
  // 初始化累积输出
  const accumulatedOutputs: any[] = [];
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`\n📦 Processing batch ${i + 1}/${batches.length}`);
    
    context.eventEmitter.emit('batch.started', {
      stepId: step.id,
      batchIndex: i,
      totalBatches: batches.length
    });
    
    // 设置批次上下文变量
    const batchContext: ExecutionContext = {
      ...context,
      inputs: {
        ...context.inputs,
        [batchVar]: batch,
        [indexVar]: i,
        accumulated_outputs: accumulatedOutputs
      }
    };
    
    // 执行子步骤
    try {
      for (const subStep of subSteps) {
        // 注入批次变量到步骤输入
        const enrichedStep: Step = {
          ...subStep,
          input: {
            ...subStep.input,
            [batchVar]: batch,
            [indexVar]: i
          }
        };
        
        await executeStep(enrichedStep, batchContext);
      }
      
      // 记录批次输出
      if (batchContext.outputs[step.id]) {
        accumulatedOutputs.push(batchContext.outputs[step.id]);
      }
      
      context.eventEmitter.emit('batch.completed', {
        stepId: step.id,
        batchIndex: i,
        totalBatches: batches.length,
        success: true
      });
      
    } catch (error) {
      console.error(`❌ Batch ${i + 1} failed: ${(error as Error).message}`);
      
      context.eventEmitter.emit('batch.completed', {
        stepId: step.id,
        batchIndex: i,
        totalBatches: batches.length,
        success: false,
        error: (error as Error).message
      });
      
      throw error;
    }
  }
  
  // 保存累积输出
  if (step.output) {
    context.outputs[step.output] = accumulatedOutputs;
  }
  
  console.log(`✅ Batch iterator completed: ${batches.length} batches processed`);
}

/**
 * 🆕 执行 Loop - 循环执行
 * 
 * 循环执行步骤直到条件满足或达到最大迭代次数
 * 支持状态管理和条件判断
 */
async function executeLoop(step: Step, context: ExecutionContext): Promise<void> {
  console.log(`\n🔄 Executing loop: ${step.id}`);
  
  const maxIterations = step.max_iterations || 10;
  const subSteps = step.steps || [];
  
  // 🆕 AR-009 P2: 迭代结果清理配置
  const keepRecentIterations = step.keep_recent_iterations ?? 3;  // 默认保留最近 3 次
  const cleanupInterval = step.cleanup_interval ?? 5;  // 默认每 5 次清理一次
  
  // 初始化循环状态
  let state: Record<string, any> = {
    iteration: 0,
    passed: false,
    ...step.initial_state
  };
  
  // 🆕 AR-009 P2: 迭代结果存储目录
  const iterationsDir = path.join(context.workdir, '.agent-runtime', 'iterations', step.id);
  await fsPromises.mkdir(iterationsDir, { recursive: true });
  
  // 循环执行
  while (state.iteration < maxIterations) {
    console.log(`\n🔄 Loop iteration ${state.iteration + 1}/${maxIterations}`);
    
    context.eventEmitter.emit('loop.iteration', {
      stepId: step.id,
      iteration: state.iteration,
      maxIterations
    });
    
    // 创建循环上下文
    const loopContext: ExecutionContext = {
      ...context,
      inputs: {
        ...context.inputs,
        state
      }
    };
    
    // 执行子步骤
    let shouldBreak = false;
    
    for (const subStep of subSteps) {
      // 检查 break 条件
      const subStepAny = subStep as any;
      if (subStep.condition === 'break' || subStepAny.action === 'break') {
        console.log(`⏹️ Break condition met, exiting loop`);
        shouldBreak = true;
        break;
      }
      
      // 检查条件
      if (subStep.condition) {
        const conditionMet = evaluateCondition(subStep.condition, loopContext);
        if (!conditionMet) {
          console.log(`⏭️ Skipping step in loop: ${subStep.id}`);
          continue;
        }
      }
      
      // 处理 set_state 动作
      if (subStepAny.action === 'set_state' && subStepAny.state) {
        state = { ...state, ...resolveInput(subStepAny.state, loopContext) };
        console.log(`📝 State updated:`, JSON.stringify(state, null, 2));
        continue;
      }
      
      // 执行普通步骤
      await executeStep(subStep, loopContext);
      
      // 更新状态（从输出中获取）
      if (loopContext.outputs[subStep.id]) {
        state = { ...state, ...loopContext.outputs[subStep.id] };
      }
    }
    
    if (shouldBreak) {
      break;
    }
    
    // 🆕 AR-009 P2: 保存迭代结果到文件
    const iterationPath = path.join(iterationsDir, `iteration_${state.iteration}.json`);
    await fsPromises.writeFile(iterationPath, JSON.stringify({
      iteration: state.iteration,
      state: { ...state },
      outputs: { ...loopContext.outputs },
      timestamp: new Date().toISOString(),
    }, null, 2));
    
    // 更新迭代计数
    state.iteration++;
    
    // 🆕 AR-009 P2: 定期清理旧迭代结果
    if (state.iteration > keepRecentIterations && state.iteration % cleanupInterval === 0) {
      await cleanupOldIterations(iterationsDir, state.iteration - keepRecentIterations);
    }
    
    // 检查循环条件
    if (step.loop_condition) {
      const conditionMet = evaluateCondition(step.loop_condition, {
        ...context,
        inputs: { ...context.inputs, state }
      });
      
      if (!conditionMet) {
        console.log(`✅ Loop condition not met, exiting loop`);
        break;
      }
    }
  }
  
  // 保存最终状态
  if (step.output) {
    context.outputs[step.output] = state;
  }
  
  // 🆕 AR-009 P2: 最终清理
  await cleanupOldIterations(iterationsDir, state.iteration - keepRecentIterations);
  
  console.log(`✅ Loop completed: ${state.iteration} iterations`);
}

/**
 * 🆕 AR-009 P2: 清理旧迭代结果
 */
async function cleanupOldIterations(iterationsDir: string, keepFrom: number): Promise<void> {
  try {
    const files = await fsPromises.readdir(iterationsDir);
    
    let cleanedCount = 0;
    
    for (const file of files) {
      const match = file.match(/iteration_(\d+)\.json/);
      if (match) {
        const iterationNum = parseInt(match[1]);
        if (iterationNum < keepFrom) {
          const filePath = path.join(iterationsDir, file);
          await fsPromises.unlink(filePath);
          cleanedCount++;
        }
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🗑️ 清理 ${cleanedCount} 个旧迭代结果，保留最近 ${keepFrom} 次`);
    }
  } catch (error) {
    // 目录不存在或其他错误，忽略
  }
}

/**
 * 🆕 执行 Aggregator - 结果汇总
 * 
 * 汇总之前步骤的输出结果
 */
async function executeAggregator(step: Step, context: ExecutionContext): Promise<void> {
  console.log(`\n📊 Executing aggregator: ${step.id}`);
  
  const aggregate = step.aggregate;
  if (!aggregate) {
    throw new Error(`Aggregator step must have 'aggregate' config`);
  }
  
  const source = resolveValue(aggregate.source, context);
  const results: Record<string, any> = {};
  
  for (const op of aggregate.operations) {
    const opType = op.type as string;
    
    if (opType === 'count') {
      results[op.name] = Array.isArray(source) ? source.length : 0;
    }
    else if (opType === 'count_where') {
      if (Array.isArray(source)) {
        const filtered = source.filter(item => {
          if (!op.condition) return true;
          return evaluateCondition(op.condition, {
            ...context,
            inputs: { ...context.inputs, item }
          });
        });
        results[op.name] = filtered.length;
      }
    }
    else if (opType === 'filter') {
      if (Array.isArray(source)) {
        const filtered = source.filter(item => {
          if (!op.condition) return true;
          return evaluateCondition(op.condition, {
            ...context,
            inputs: { ...context.inputs, item }
          });
        });
        results[op.name] = filtered;
      }
    }
    else if (opType === 'sum') {
      if (Array.isArray(source) && op.field) {
        results[op.name] = source.reduce((sum, item) => {
          const value = typeof item === 'object' ? item[op.field!] : item;
          return sum + (typeof value === 'number' ? value : 0);
        }, 0);
      }
    }
    else if (opType === 'average') {
      if (Array.isArray(source) && op.field) {
        const values = source
          .map(item => typeof item === 'object' ? item[op.field!] : item)
          .filter(v => typeof v === 'number');
        results[op.name] = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      }
    }
    else if (opType === 'group') {
      if (Array.isArray(source) && op.field) {
        results[op.name] = source.reduce((groups, item) => {
          const key = typeof item === 'object' ? String(item[op.field!]) : String(item);
          if (!groups[key]) groups[key] = [];
          groups[key].push(item);
          return groups;
        }, {} as Record<string, any[]>);
      }
    }
  }
  
  // 保存结果
  if (step.output) {
    context.outputs[step.output] = results;
  }
  
  console.log(`✅ Aggregator completed:`, JSON.stringify(results, null, 2));
}

/**
 * 🆕 执行 Notification - 通知
 * 
 * 发送通知消息
 */
async function executeNotification(step: Step, context: ExecutionContext): Promise<void> {
  console.log(`\n🔔 Executing notification: ${step.id}`);
  
  // 解析消息模板
  let message = step.message || '';
  message = resolveTemplate(message, context);
  
  console.log(`📢 Message: ${message}`);
  
  context.eventEmitter.emit('notification', {
    stepId: step.id,
    message,
    channel: step.channel
  });
  
  // 发送通知（通过 DiscordNotifier）
  try {
    const notifier = getDiscordNotifier();
    if (notifier) {
      // 使用 notifyComplete 或自定义格式发送
      await notifier.notifyComplete({
        executionId: context.executionId,
        workflow: context.workflow.name || context.workflow.id,
        totalDuration: 0,
        status: 'completed',
        outputs: { message }
      });
      console.log(`✅ Notification sent`);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to send notification: ${(error as Error).message}`);
  }
}

/**
 * 解析值表达式
 */
function resolveValue(expression: string, context: ExecutionContext): any {
  if (!expression) return expression;
  
  // 处理 ${steps.xxx.field} 格式 - 步骤输出引用
  const stepMatch = expression.match(/^\$\{steps\.([\w-]+)\.([\w-]+)(?:\.([\w-]+))?\}$/);
  if (stepMatch) {
    const [, stepId, field, subField] = stepMatch;
    const stepResult = context.steps.find(s => s.stepId === stepId);
    if (!stepResult?.output) {
      console.warn(`Step output not found: ${stepId}`);
      return undefined;
    }
    
    let value = stepResult.output[field];
    if (subField && value && typeof value === 'object') {
      value = value[subField];
    }
    return value;
  }
  
  // 处理 ${...} 表达式
  const match = expression.match(/^\$\{(.+)\}$/);
  if (match) {
    const path = match[1];
    return getByPath(context, path);
  }
  
  // 处理包含 ${...} 的模板字符串
  return expression.replace(/\$\{(.+?)\}/g, (_, path) => {
    const value = getByPath(context, path);
    return value !== undefined ? String(value) : '';
  });
}

/**
 * 解析模板字符串
 */
function resolveTemplate(template: string, context: ExecutionContext): string {
  if (!template) return template;
  
  return template.replace(/\$\{(.+?)\}/g, (_, path) => {
    const value = getByPath(context, path);
    return value !== undefined ? String(value) : '';
  });
}

/**
 * 按路径获取值
 */
function getByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let value = obj;
  
  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    
    // 处理数组索引
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      value = value[key]?.[parseInt(index)];
    } else {
      value = value[part];
    }
  }
  
  return value;
}

// ========== 🆕 AS-047: 编排层调用支持 ==========

/**
 * 角色执行配置
 */
export interface RoleExecutionOptions {
  // 执行 ID
  executionId: string;
  
  // 项目 ID
  projectId?: string;
  
  // 工作目录
  workdir?: string;
  
  // 事件回调
  onEvent?: EventHandler;
  
  // 超时（毫秒）
  timeout?: number;
}

/**
 * 执行角色任务
 * 
 * 功能：
 * 1. 从 ContextSharer 读取上下文（会议记录等）
 * 2. 执行 Skill
 * 3. 将结果写入 ContextSharer
 * 
 * 复用：
 * - executeWorkflow: 执行 Skill
 * - ContextSharer: 上下文共享
 */
export async function executeRole(
  roleTask: RoleTask,
  contextSharer: ContextSharer,
  options: RoleExecutionOptions
): Promise<RoleTaskResult> {
  const startTime = Date.now();
  
  console.log(`\n🎭 [executeRole] Starting role: ${roleTask.name} (${roleTask.id})`);
  console.log(`   Priority: ${roleTask.priority}`);
  console.log(`   Skill: ${roleTask.skillId || 'N/A'}`);
  console.log(`   WaitFor: ${roleTask.waitFor.length > 0 ? roleTask.waitFor.join(', ') : 'none'}`);
  
  try {
    // 1. 从 ContextSharer 读取相关上下文
    let meetingContext: any = null;
    let dependencyOutputs: Record<string, any> = {};
    
    // 🆕 渐进式加载会议上下文（AS-054）
    const meetingKeys = await contextSharer.getSummary();
    const meetingKey = meetingKeys.keys.find(k => k.startsWith('meeting:') && !k.includes(':meta') && !k.includes(':decisions') && !k.includes(':summary') && !k.includes(':messages'));
    
    if (meetingKey) {
      // 从 key 中提取 meetingId
      const meetingId = meetingKey.replace('meeting:', '');
      
      // 阶段 1：加载元数据（默认）
      // TODO: 根据 Token 预算动态调整 stage
      const stage = roleTask.meetingContextStage || 2; // 默认加载到决策层
      const progressiveContext = await contextSharer.getMeetingContext(meetingId, stage);
      
      meetingContext = {
        meta: progressiveContext.meta,
        decisions: progressiveContext.decisions,
        summary: progressiveContext.summary,
        messages: progressiveContext.messages,
      };
      
      console.log(`   📋 Loaded meeting context (stage ${stage}): ${meetingKey}`);
      if (progressiveContext.meta) {
        console.log(`      Title: ${progressiveContext.meta.title}`);
        console.log(`      Decisions: ${progressiveContext.decisions?.length || 0}`);
      }
    }
    
    // 读取依赖角色的输出
    for (const depId of roleTask.waitFor) {
      const depOutput = await contextSharer.getValue(`role:${depId}:output`);
      if (depOutput) {
        dependencyOutputs[depId] = depOutput;
        console.log(`   🔗 Loaded dependency output: role:${depId}:output`);
      }
    }
    
    // 2. 构建执行输入
    const roleInput: Record<string, any> = {
      ...roleTask.inputs,
      context: {
        meeting: meetingContext,
        dependencies: dependencyOutputs,
      },
    };
    
    // 3. 执行 Skill
    let result: ExecutionResult;
    
    if (roleTask.skillId) {
      // 执行 Skill（注意：ExecutionOptions 没有 executionId，由 executeWorkflow 内部生成）
      result = await executeWorkflow(
        roleTask.skillId,
        roleInput,
        {
          workdir: options.workdir || config.workdir,
          timeout: roleTask.timeout || options.timeout || DEFAULT_ROLE_TASK_TIMEOUT_MS,
          onEvent: options.onEvent,
        }
      );
    } else {
      // 无 Skill，返回空结果
      result = {
        executionId: `${options.executionId}:${roleTask.id}`,
        workflowId: 'empty',
        status: 'completed',
        inputs: {},
        outputs: {},
        steps: [],
        startTime: new Date(),
        duration: 0,
      };
    }
    
    const duration = Date.now() - startTime;
    
    // 4. 将结果写入 ContextSharer
    await contextSharer.set(
      `role:${roleTask.id}:output`,
      {
        status: result.status,
        outputs: result.outputs,
        duration,
        completedAt: new Date().toISOString(),
      },
      roleTask.id
    );
    
    console.log(`   ✅ Role completed: ${roleTask.id} (${duration}ms)`);
    
    return {
      taskId: roleTask.id,
      status: result.status === 'completed' ? 'success' : 'failed',
      output: result.outputs,
      error: result.error,
      duration,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    console.error(`   ❌ Role failed: ${roleTask.id} - ${errorMessage}`);
    
    return {
      taskId: roleTask.id,
      status: 'failed',
      error: errorMessage,
      duration,
    };
  }
}

/**
 * 创建角色执行器函数
 * 
 * 用于 Orchestrator.setRoleExecutor()
 */
export function createRoleExecutor(
  options: RoleExecutionOptions
): (task: RoleTask, context: ContextSharer) => Promise<RoleTaskResult> {
  return (task: RoleTask, context: ContextSharer) => {
    return executeRole(task, context, options);
  };
}
