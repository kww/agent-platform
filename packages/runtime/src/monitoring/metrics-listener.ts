/**
 * Prometheus 指标监听器
 * 
 * 监听 agent-runtime 事件并转换为 Prometheus 指标
 */

import client from 'prom-client';
import { EventEmitter } from '../core/events';

// ===== 自动采集 Node.js 默认指标 =====

const register = client.register;
register.setDefaultLabels({ app: 'agent-runtime' });
client.collectDefaultMetrics({ register });

// ===== 指标定义 =====

// 工作流指标
const workflowStarted = new client.Counter({
  name: 'workflow_started_total',
  help: 'Total number of workflows started',
  labelNames: ['workflow_id', 'workflow_name'],
});

const workflowCompleted = new client.Counter({
  name: 'workflow_completed_total',
  help: 'Total number of workflows completed successfully',
  labelNames: ['workflow_id', 'workflow_name'],
});

const workflowFailed = new client.Counter({
  name: 'workflow_failed_total',
  help: 'Total number of workflows that failed',
  labelNames: ['workflow_id', 'workflow_name', 'error_type'],
});

const workflowCancelled = new client.Counter({
  name: 'workflow_cancelled_total',
  help: 'Total number of workflows cancelled',
  labelNames: ['workflow_id', 'workflow_name'],
});

const workflowDuration = new client.Histogram({
  name: 'workflow_duration_seconds',
  help: 'Workflow execution duration in seconds',
  labelNames: ['workflow_id', 'workflow_name'],
  buckets: [10, 30, 60, 120, 300, 600, 1200, 1800, 3600],
});

// 步骤指标
const stepStarted = new client.Counter({
  name: 'step_started_total',
  help: 'Total number of steps started',
  labelNames: ['workflow_id', 'step_id', 'step_name'],
});

const stepCompleted = new client.Counter({
  name: 'step_completed_total',
  help: 'Total number of steps completed successfully',
  labelNames: ['workflow_id', 'step_id', 'step_name'],
});

const stepFailed = new client.Counter({
  name: 'step_failed_total',
  help: 'Total number of steps that failed',
  labelNames: ['workflow_id', 'step_id', 'step_name', 'error_type'],
});

const stepSkipped = new client.Counter({
  name: 'step_skipped_total',
  help: 'Total number of steps skipped',
  labelNames: ['workflow_id', 'step_id', 'step_name'],
});

const stepCached = new client.Counter({
  name: 'step_cached_total',
  help: 'Total number of steps served from cache',
  labelNames: ['workflow_id', 'step_id', 'step_name'],
});

const stepDuration = new client.Histogram({
  name: 'step_duration_seconds',
  help: 'Step execution duration in seconds',
  labelNames: ['workflow_id', 'step_id', 'step_name'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
});

// Agent 指标
const agentTimeout = new client.Counter({
  name: 'agent_timeout_total',
  help: 'Total number of agent timeouts',
  labelNames: ['workflow_id', 'step_id'],
});

const agentWarning = new client.Counter({
  name: 'agent_warning_total',
  help: 'Total number of agent warnings',
  labelNames: ['workflow_id', 'step_id', 'warning_type'],
});

// Token 指标
const tokenUsage = new client.Counter({
  name: 'token_usage_total',
  help: 'Total token usage',
  labelNames: ['execution_id', 'model', 'type'], // type: input | output
});

const tokenLimitWarning = new client.Counter({
  name: 'token_limit_warning_total',
  help: 'Total number of token limit warnings',
  labelNames: ['execution_id', 'model', 'threshold'], // threshold: 80 | 90 | 100
});

// Token 成本（美元）
const tokenCost = new client.Counter({
  name: 'token_cost_dollars',
  help: 'Token cost in dollars',
  labelNames: ['execution_id', 'model'],
});

// 工具调用指标
const toolCalls = new client.Counter({
  name: 'tool_calls_total',
  help: 'Total number of tool calls',
  labelNames: ['tool_id', 'status'], // status: success | failed
});

const toolDuration = new client.Histogram({
  name: 'tool_duration_seconds',
  help: 'Tool call duration in seconds',
  labelNames: ['tool_id'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});

// 铁律违规指标
const ironLawViolations = new client.Counter({
  name: 'iron_law_violations_total',
  help: 'Total number of iron law violations',
  labelNames: ['law_id', 'severity'],
});

// 阶段指标
const phaseDuration = new client.Histogram({
  name: 'phase_duration_seconds',
  help: 'Phase execution duration in seconds',
  labelNames: ['workflow_id', 'phase_id', 'phase_name'],
  buckets: [10, 30, 60, 120, 300, 600],
});

// 子工作流指标
const subWorkflowDuration = new client.Histogram({
  name: 'sub_workflow_duration_seconds',
  help: 'Sub-workflow execution duration in seconds',
  labelNames: ['workflow_id', 'sub_workflow_id'],
  buckets: [10, 30, 60, 120, 300],
});

// ===== 模型价格配置（每百万 token 美元） =====

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-3.5-sonnet': { input: 3, output: 15 },
  'claude-3.5-haiku': { input: 1, output: 5 },
  'claude-code': { input: 3, output: 15 },
  
  // OpenAI
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-32k': { input: 60, output: 120 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4o': { input: 5, output: 15 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
  
  // GLM
  'glm-4': { input: 0.14, output: 0.14 },
  'glm-4-flash': { input: 0.01, output: 0.01 },
  
  // Default
  'default': { input: 0, output: 0 },
};

/**
 * 获取模型价格
 */
function getModelPricing(model: string): { input: number; output: number } {
  // 精确匹配
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  
  // 模糊匹配（处理变体名称）
  const lowerModel = model.toLowerCase();
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lowerModel.includes(key.toLowerCase())) {
      return pricing;
    }
  }
  
  return MODEL_PRICING.default;
}

/**
 * 计算并记录 Token 成本
 */
function recordTokenCost(executionId: string, model: string, inputTokens: number, outputTokens: number): void {
  const pricing = getModelPricing(model);
  const cost = (inputTokens / 1_000_000) * pricing.input + 
               (outputTokens / 1_000_000) * pricing.output;
  
  if (cost > 0) {
    tokenCost.inc({ execution_id: executionId, model }, cost);
  }
}

// ===== 当前执行上下文（用于关联事件） =====

const executionContext = new Map<string, {
  workflowId: string;
  workflowName: string;
  startTime: number;
}>();

/**
 * 设置执行上下文
 */
export function setExecutionContext(executionId: string, workflowId: string, workflowName: string): void {
  executionContext.set(executionId, {
    workflowId,
    workflowName,
    startTime: Date.now(),
  });
}

/**
 * 获取执行上下文
 */
export function getExecutionContext(executionId: string) {
  return executionContext.get(executionId);
}

/**
 * 清除执行上下文
 */
export function clearExecutionContext(executionId: string): void {
  executionContext.delete(executionId);
}

// ===== 事件监听器 =====

/**
 * 设置指标监听器
 */
export function setupMetricsListener(events: EventEmitter): void {
  // ===== 工作流事件 =====
  
  events.on('workflow.started', (event: any) => {
    const { workflowId, workflowName, executionId } = event.data || event;
    workflowStarted.inc({ workflow_id: workflowId, workflow_name: workflowName || 'unknown' });
    setExecutionContext(executionId || workflowId, workflowId, workflowName || 'unknown');
  });
  
  events.on('workflow.completed', (event: any) => {
    const { workflowId, workflowName, duration, executionId } = event.data || event;
    workflowCompleted.inc({ workflow_id: workflowId, workflow_name: workflowName || 'unknown' });
    
    if (duration) {
      workflowDuration.observe(
        { workflow_id: workflowId, workflow_name: workflowName || 'unknown' },
        duration / 1000
      );
    }
    
    clearExecutionContext(executionId || workflowId);
  });
  
  events.on('workflow.failed', (event: any) => {
    const { workflowId, workflowName, error, executionId } = event.data || event;
    const errorType = error?.name || error?.code || 'unknown';
    workflowFailed.inc({ 
      workflow_id: workflowId, 
      workflow_name: workflowName || 'unknown',
      error_type: errorType 
    });
    clearExecutionContext(executionId || workflowId);
  });
  
  events.on('workflow.cancelled', (event: any) => {
    const { workflowId, workflowName, executionId } = event.data || event;
    workflowCancelled.inc({ workflow_id: workflowId, workflow_name: workflowName || 'unknown' });
    clearExecutionContext(executionId || workflowId);
  });
  
  // ===== 步骤事件 =====
  
  events.on('step.started', (event: any) => {
    const { workflowId, stepId, stepName } = event.data || event;
    stepStarted.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      step_name: stepName || stepId 
    });
  });
  
  events.on('step.completed', (event: any) => {
    const { workflowId, stepId, stepName, duration } = event.data || event;
    stepCompleted.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      step_name: stepName || stepId 
    });
    
    if (duration) {
      stepDuration.observe(
        { workflow_id: workflowId, step_id: stepId, step_name: stepName || stepId },
        duration / 1000
      );
    }
  });
  
  events.on('step.failed', (event: any) => {
    const { workflowId, stepId, stepName, error, errorType } = event.data || event;
    const errorTypeValue = errorType || error?.name || error?.code || 'unknown';
    stepFailed.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      step_name: stepName || stepId,
      error_type: errorTypeValue 
    });
  });
  
  events.on('step.skipped', (event: any) => {
    const { workflowId, stepId, stepName } = event.data || event;
    stepSkipped.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      step_name: stepName || stepId 
    });
  });
  
  events.on('step.cached', (event: any) => {
    const { workflowId, stepId, stepName } = event.data || event;
    stepCached.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      step_name: stepName || stepId 
    });
  });
  
  // ===== Agent 事件 =====
  
  events.on('agent.timeout', (event: any) => {
    const { workflowId, stepId } = event.data || event;
    agentTimeout.inc({ workflow_id: workflowId, step_id: stepId });
  });
  
  events.on('agent.warning', (event: any) => {
    const { workflowId, stepId, warningType } = event.data || event;
    agentWarning.inc({ 
      workflow_id: workflowId, 
      step_id: stepId, 
      warning_type: warningType || 'unknown' 
    });
  });
  
  // ===== Token 事件 =====
  
  events.on('token.used', (event: any) => {
    const { executionId, model, inputTokens, outputTokens } = event.data || event;
    
    if (inputTokens > 0) {
      tokenUsage.inc({ execution_id: executionId, model, type: 'input' }, inputTokens);
    }
    if (outputTokens > 0) {
      tokenUsage.inc({ execution_id: executionId, model, type: 'output' }, outputTokens);
    }
    
    // 计算成本
    recordTokenCost(executionId, model, inputTokens, outputTokens);
  });
  
  events.on('token.warning', (event: any) => {
    const { executionId, model, threshold } = event.data || event;
    tokenLimitWarning.inc({ 
      execution_id: executionId, 
      model, 
      threshold: threshold.toString() 
    });
  });
  
  // ===== 工具调用事件 =====
  
  events.on('tool.started', (event: any) => {
    // 工具开始调用（只记录，不计入指标）
  });
  
  events.on('tool.completed', (event: any) => {
    const { toolId, duration } = event.data || event;
    toolCalls.inc({ tool_id: toolId, status: 'success' });
    
    if (duration) {
      toolDuration.observe({ tool_id: toolId }, duration / 1000);
    }
  });
  
  events.on('tool.failed', (event: any) => {
    const { toolId, error } = event.data || event;
    toolCalls.inc({ tool_id: toolId, status: 'failed' });
  });
  
  // ===== 铁律事件 =====
  
  events.on('iron_law.violated', (event: any) => {
    const { lawId, severity } = event.data || event;
    ironLawViolations.inc({ 
      law_id: lawId, 
      severity: severity || 'warning' 
    });
  });
  
  // ===== 阶段事件 =====
  
  events.on('phase.completed', (event: any) => {
    const { workflowId, phaseId, phaseName, duration } = event.data || event;
    
    if (duration) {
      phaseDuration.observe(
        { workflow_id: workflowId, phase_id: phaseId, phase_name: phaseName || phaseId },
        duration / 1000
      );
    }
  });
  
  // ===== 子工作流事件 =====
  
  events.on('sub_workflow.completed', (event: any) => {
    const { workflowId, subWorkflowId, duration } = event.data || event;
    
    if (duration) {
      subWorkflowDuration.observe(
        { workflow_id: workflowId, sub_workflow_id: subWorkflowId },
        duration / 1000
      );
    }
  });
}

// ===== 导出 =====

export { register };
export {
  workflowStarted,
  workflowCompleted,
  workflowFailed,
  workflowCancelled,
  workflowDuration,
  stepStarted,
  stepCompleted,
  stepFailed,
  stepSkipped,
  stepCached,
  stepDuration,
  agentTimeout,
  agentWarning,
  tokenUsage,
  tokenLimitWarning,
  tokenCost,
  toolCalls,
  toolDuration,
  ironLawViolations,
  phaseDuration,
  subWorkflowDuration,
};

/**
 * 获取所有指标（用于 /metrics 端点）
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * 获取指标注册表（用于自定义指标）
 */
export function getRegister(): client.Registry {
  return register;
}