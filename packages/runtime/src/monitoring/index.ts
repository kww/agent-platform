/**
 * 监控模块入口
 */

export {
  setupMetricsListener,
  getMetrics,
  getRegister,
  setExecutionContext,
  getExecutionContext,
  clearExecutionContext,
  register,
  // 导出所有指标（用于直接使用）
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
} from './metrics-listener';

export {
  LocalWorkflowMetrics,
  StepSuccessRate,
  getLocalWorkflowMetrics,
  getAllWorkflowMetrics,
  getStepSuccessRate,
  isLocalDataAvailable,
  getMetricsSummary,
} from './local-data-source';

export {
  CapabilityGapReport,
  analyzeCapabilityGaps,
  generateCapabilityReport,
  runCapabilityAnalyze,
} from './capability-analyze';