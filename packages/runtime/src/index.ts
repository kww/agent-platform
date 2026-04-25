/**
 * agent-runtime - AI Agent 工作流执行引擎
 * 
 * 入口文件：导出核心 API
 */

export { executeWorkflow, getWorkflowStatus, cancelWorkflow } from './core/executor';
export { listWorkflows, listTools, listSteps, getWorkflow, getTool, getStep } from './core/registry';
export { validateWorkflow, validateTool } from './core/parser';
export { loadConfig, Config } from './utils/config';
export { EventEmitter, EventHandler, Event } from './core/events';

// 类型导出
export type {
  Workflow,
  Tool,
  Step,
  StepResult,
  ExecutionResult,
  ExecutionOptions,
  UnderstandConfig,
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphLayer,
  TourStep,
  ExecutionContext,
} from './core/types';

export type { UnderstandResult } from './executors/understand';
export type { WorkflowState, StepState } from './core/state';
export type { ProjectContext } from './core/context';

// 状态管理导出
export { loadState, canResume, clearState } from './core/state';

// 上下文管理导出
export { 
  loadContextFile, 
  loadLanguageContext, 
  loadFrameworkContext, 
  loadTemplateContext,
  detectProjectContext,
  mergeContexts,
  buildContextPrompt
} from './core/context';

// 🆕 进度追踪导出
export {
  ProgressTracker,
} from './core/progress-tracker';

// 🆕 渐进式披露导出 (HZ-002)
export {
  ProgressiveDisclosure,
  progressiveDisclosure,
  type AgentContext,
  type ContextMessage,
  type DisclosureOptions,
  type DisclosedContext,
} from './context/progressive-disclosure';

// 🆕 进度追踪导出
export {
  getProgressTracker,
  createProgressTracker,
  removeProgressTracker,
  getAllProgressTrackers,
  classifyError,
} from './core/progress-tracker';

export type { ProgressTrackerOptions } from './core/progress-tracker';

// 🆕 监控模块导出
export {
  setupMetricsListener,
  getMetrics,
  getRegister,
  setExecutionContext,
  getExecutionContext,
  clearExecutionContext,
  // 指标
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
} from './monitoring';

// 🆕 通知服务导出
export {
  NotificationService,
  createNotificationService,
  getNotificationService,
  removeNotificationService,
  DEFAULT_NOTIFICATION_CONFIG,
} from './core/notification-service';

export type { NotificationServiceOptions } from './core/notification-service';

// 🆕 类型导出
export type {
  ProgressState,
  StepProgress,
  ProgressWarning,
  ProgressError,
  ClassifiedError,
  NotificationConfig,
  NotificationPayload,
  NotificationChannel,
  NotificationEvent,
  TimeoutConfig,
  // P1 类型
  AgentFallbackConfig,
  AgentFallbackMapping,
  FallbackCondition,
  FallbackState,
  FallbackEvent,
  TokenUsageRecord,
  TokenState,
  OutputCategory,
  OutputType,
  ClassifiedOutput,
} from './core/types';

// 执行层错误类型（别名导出，避免与 harness ErrorType 冲突）
export type { ErrorType as ExecutionErrorType } from './core/types';

// 🆕 P1: Token 追踪导出
export {
  TokenTracker,
  createTokenTracker,
  getTokenTracker,
  removeTokenTracker,
  MODEL_TOKEN_LIMITS,
} from './core/token-tracker';

export type { TokenTrackerOptions } from './core/token-tracker';

// 🆕 P1: 输出处理器导出
export {
  OutputProcessor,
  createOutputProcessor,
} from './core/output-processor';

export type { OutputProcessorOptions, ProcessingResult } from './core/output-processor';

// 🆕 P1: Agent 回退机制导出
export {
  AgentFallbackManager,
  createFallbackManager,
  getDefaultFallbackManager,
  setDefaultFallbackManager,
} from './core/agent-fallback';

// 🆕 P1: 执行索引导出
export {
  IndexBuilder,
  createIndexBuilder,
  getIndexBuilder,
  registerIndexBuilder,
  unregisterIndexBuilder,
} from './core/index-builder';

export type {
  StepIndex,
  KeyOutput,
  KeyOutputType,
  ExecutionIndex,
  ErrorSummary,
  IndexSearchOptions,
  IndexBuilderOptions,
} from './core/index-builder';

// 🆕 P1: 历史压缩导出
export {
  HistoryCompressor,
  createHistoryCompressor,
  DEFAULT_COMPRESSION_CONFIG,
} from './core/history-compressor';

export type {
  HistoryEntry,
  CompressionConfig,
  CompressionResult,
  HistoryState,
  OutputPriority,
} from './core/history-compressor';

// 🆕 P1: 进度解析导出
export {
  ProgressParser,
  CodexProgressParser,
  ClaudeCodeProgressParser,
  createProgressParser,
  createCodexProgressParser,
  createClaudeCodeProgressParser,
  DEFAULT_HEARTBEAT_CONFIG,
} from './core/progress-parser';

export type {
  ProgressInfo,
  HeartbeatConfig,
  AgentOutputPattern,
} from './core/progress-parser';

// 🆕 P1: 项目 Token 统计导出
export {
  ProjectTokenTracker,
  getProjectTokenTracker,
  createProjectTokenTracker,
  CONTEXT_THRESHOLDS,
} from './core/project-token-tracker';

export type {
  TokenUsageRecord as ProjectTokenUsageRecord,
  WorkflowTypeStats,
  ProjectTokenStats,
  ProjectTokenTrackerOptions,
  ContextUsage,
  ContextSuggestion,
} from './core/project-token-tracker';

// 🆕 资源感知调度导出
export {
  ResourceScheduler,
  createResourceScheduler,
  getSystemMetrics,
  evaluateResourceStatus,
  getResourceAwareConcurrency,
  DEFAULT_THRESHOLDS,
} from './core/scheduler';

export type {
  ResourceMetrics,
  ResourceThresholds,
  ResourceStatus,
} from './core/scheduler';

// ============================================
// 便捷 API
// ============================================

import { getProjectTokenTracker as _getProjectTokenTracker } from './core/project-token-tracker';

/**
 * 获取项目 Token 统计
 */
export function getProjectTokenStats(projectPath: string): import('./core/project-token-tracker').ProjectTokenStats {
  const tracker = _getProjectTokenTracker(projectPath);
  return tracker.getStats();
}

/**
 * 获取项目 Token 摘要
 */
export function getProjectTokenSummary(projectPath: string): string {
  const tracker = _getProjectTokenTracker(projectPath);
  return tracker.generateSummary();
}

/**
 * 获取上下文使用情况
 */
export function getContextUsage(
  projectPath: string,
  currentModel: string,
  currentExecutionTokens?: number
): import('./core/project-token-tracker').ContextUsage {
  const tracker = _getProjectTokenTracker(projectPath);
  return tracker.getContextUsage(currentModel, currentExecutionTokens);
}

/**
 * 获取上下文状态摘要（用于 UI）
 */
export function getContextSummary(
  projectPath: string,
  currentModel: string,
  currentExecutionTokens?: number
): string {
  const tracker = _getProjectTokenTracker(projectPath);
  return tracker.generateContextSummary(currentModel, currentExecutionTokens);
}

// ============================================
// 🆕 约束机制导出（从 @dommaker/harness）
// ============================================

// 从 harness 导入约束机制
export {
  PassesGate,
  createPassesGate,
  CleanStateManager,
  createCleanStateManager,
  SessionStartup,
  createSessionStartup,
  DEFAULT_CODE_CHECKPOINTS,
  MINIMAL_CHECKPOINTS,
  // 铁律系统
  IronLawChecker,
  IRON_LAWS,
  ironLawChecker,
  // 检查点验证器
  CheckpointValidator,
} from '@dommaker/harness';

// 约束类型从 harness 导入
export type {
  PassesGateConfig,
  PassesGateResult,
  TaskTestResult,
  StartupCheckpoints,
  StartupCheckpointType,
  StartupCheckpointResult,
  CleanStateConfig,
  CleanStateResult,
  DetectedBug,
  IronLaw as IronLawFull,
  IronLawId,
  IronLawSeverity,
  IronLawTrigger,
  IronLawResult,
  IronLawContext,
} from '@dommaker/harness';

// 保留本地类型（Workflow 配置专用）
export type {
  ConstraintLevel,
  TaskStepStatus,
  ConstraintRule,
  ConstraintCondition,
  Personality,
  PersonalityTemplate,
  PersonalityBehaviorInfluence,
  TaskListJson,
  // Workflow 配置用的简化版 IronLaw（有 enforce_at 属性）
  IronLaw,
} from './core/types';

// Personality 导出
export {
  PersonalitySystem,
  createPersonalitySystem,
  PERSONALITY_TEMPLATES,
} from './core/personality';

// ============================================
// 🆕 自我进化机制导出
// ============================================

// 类型导出
export type {
  FailureRootCause,
  GapType,
  GapReport,
  GapSuggestion,
  RootCauseRule,
  RootCauseCondition,
  RootCauseAnalysisResult,
  EvolutionBacklogItem,
} from './core/types';

// RootCauseAnalyzer 导出
export {
  RootCauseAnalyzer,
  getRootCauseAnalyzer,
  analyzeRootCause,
  saveGapReport,
} from './core/root-cause-analyzer';

// ============================================
// 🆕 进化步骤处理器导出
// ============================================

export {
  handleReportGap,
  handlePrioritize,
  evolutionHandlers,
  ReportGapInput,
  ReportGapOutput,
  PrioritizeInput,
  PrioritizeOutput,
  PrioritizedItem,
} from './executors/evolution';

// ============================================
// 🆕 Phase 6: Workflow Agent 共享导出
// ============================================

// 类型导出
export type {
  AgentConfig,
} from './core/types';

// Messages Prompt Builder 导出
export {
  buildSessionPromptFromMessages,
  buildPromptFromMessages,
  extractKeyDataFromMessages,
  embedMessagesIntoPrompt,
  estimateTokens,
  estimateMessagesTokens,
} from './core/messages-prompt-builder';

export type {
  Message,
  BuildPromptConfig,
} from './core/messages-prompt-builder';

// Baseline Validator 导出（WA-008）
export {
  parseBaselineDecision,
  extractTechChoicesFromGitDiff,
  detectConstraintViolations,
  compareBaselineVsActual,
  assessRisk,
  verifyBaselineDeviation,
} from './core/baseline-validator';

export type {
  BaselineDecision,
  Decision,
  Constraint,
  Deviation,
  RiskAssessment,
  RiskFactors,
  ActualBehavior,
  TechChoice,
} from './core/baseline-validator';

// Risk Assessor 导出（WA-011/012/013）
export {
  RiskAssessor,
  createRiskAssessor,
  DEFAULT_RISK_THRESHOLDS,
  DEFAULT_SEVERITY_WEIGHTS,
  DEFAULT_IMPACT_WEIGHTS,
  DEFAULT_REVERSIBILITY_WEIGHTS,
  DEFAULT_URGENCY_WEIGHTS,
} from './core/risk-assessor';

export type {
  RiskThresholds,
  SeverityWeights,
  ImpactWeights,
  ReversibilityWeights,
  UrgencyWeights,
  RiskAssessorConfig,
} from './core/risk-assessor';

// ============================================
// 🆕 角色系统导出
// ============================================

// 类型导出
export type {
  Role,
  RoleLevel,
  RoleStatus,
  RoleCapability,
  RoleEconomy,
  RolePerformance,
  RolePersonality,
  RoleMetadata,
  LevelRequirement,
  PerformanceStatus,
  PromotionRequest,
  DemotionRecord,
  AssessmentRecord,
  AssessmentType,
  ResignationRequest,
  TransferRequest,
  ResponsibilityChain,
  ResponsibilityNode,
} from './types/role';

// 常量导出
export {
  LEVEL_REQUIREMENTS,
  ASSESSMENT_STANDARDS,
  RESPONSIBILITY_WEIGHTS,
  calculateTransferFee,
} from './types/role';

// 角色模板导出
export {
  ROLE_TEMPLATES,
  INITIAL_CAPABILITIES,
  ROLE_STANCE_MAP,
  getRoleTemplate,
  getAllRoleTemplates,
  getInitialCapabilities,
  getRoleStance,
  REVIEWER_ROLE,
  STRATEGIST_ROLE,
  TECH_LEAD_ROLE,
  DEVELOPER_ROLE,
  TESTER_ROLE,
  ARCHITECT_ROLE,
  SECURITY_EXPERT_ROLE,
  PERFORMANCE_EXPERT_ROLE,
  AUDITOR_ROLE,
} from './core/roles';

// 角色管理器导出
export {
  RoleManager,
  createRoleManager,
  CreateRoleInput,
  UpdateRoleInput,
  RoleFilter,
} from './core/role-manager';

// 级别管理器导出
export {
  LevelManager,
  createLevelManager,
  PromotionCheckResult,
  DemotionCheckResult,
  AssessmentResult,
} from './core/level-manager';

// ============================================
// 🆕 编排层导出
// ============================================

// 核心类导出
export {
  Orchestrator,
  MeetingSubscriber,
  ContextSharer,
  RoleScheduler,
  RolePriority,
} from './orchestration';

// 会议核心（C-修正架构）
export {
  MeetingCore,
  createMeetingCore,
  InMemoryMeetingStore,
} from './orchestration';

// 便捷函数导出
export {
  createOrchestrator,
  createMeetingSubscriber,
  createContextSharer,
  createRoleScheduler,
} from './orchestration';

// 类型导出
export type {
  OrchestrationConfig,
  OrchestrationResult,
  OrchestrationStatus,
  OrchestrationEvent,
  RoleResult,
  RoleTask,
  RoleTaskResult,
  SharedContext,
  MeetingEvent,
  // 会议相关类型
  Meeting,
  MeetingParticipant,
  MeetingMessage,
  MeetingDecision,
  MeetingSummary,
  MeetingStatus,
  MeetingStore,
  CreateMeetingInput,
  SendMessageInput,
  MeetingCoreConfig,
} from './orchestration';
