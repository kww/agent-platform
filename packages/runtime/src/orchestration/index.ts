/**
 * 编排层模块
 * 
 * 核心能力：
 * 1. 多角色协作编排
 * 2. 会议事件驱动
 * 3. 上下文共享（Redis）
 * 4. 角色调度（优先级 + 依赖）
 * 5. 会议核心逻辑（C-修正架构）
 * 
 * 架构：
 * - 会议逻辑下沉到 runtime（meeting-core）
 * - 通过 MeetingStore 接口访问存储
 * - 无直接依赖 agent-studio
 */

// 核心类导出
export { Orchestrator } from './orchestrator';
export { MeetingSubscriber } from './meeting-subscriber';
export { ContextSharer } from './context-sharer';
export { RoleScheduler, RolePriority } from './role-scheduler';
export { ContextBridge } from './context-bridge';
export { MeetingStateMachine } from './meeting-state-machine';
export {
  ContextBridgeListener,
  NotificationListener,
  AuditListener,
  CompositeListener,
  createDefaultListeners,
} from './state-listener';
export { FailureHandler, ErrorType, FailureLevel } from './failure-handler';
export { ErrorClassifier, FailureRecorder, classifyError } from '@dommaker/harness';
export { PerformanceMonitor } from './performance-monitor';
export { DiscussionDriver, createDiscussionDriver } from './discussion-driver';
export { TaskSplitter, createTaskSplitter } from './task-splitter';
export { WorkflowLibrary, createWorkflowLibrary } from './workflow-library';
export { CompanyMCPPool, createCompanyMCPPool } from './company-mcp-pool';
export { SpecConstraintLayer, createSpecConstraintLayer } from './spec-constraint-layer';
export { GateChecker, createGateChecker } from './gate-checker';
export { AuditChain, AuditChainAdapter, createAuditChain, createAuditChainAdapter } from './audit-chain';
export { EconomyAdapter, createEconomyAdapter } from './economy-adapter';

// Phase 6: TaskQueue + TaskWorker
export { TaskQueue, createTaskQueue } from './task-queue';
export { TaskWorker, createTaskWorker } from './task-worker';
export { TaskOutputManager, createTaskOutputManager } from './task-output';
export { WorkflowBlocker, createWorkflowBlocker } from './workflow-blocker';

// 会议核心（C-修正架构）
export { MeetingCore, createMeetingCore } from './meeting-core';
export { InMemoryMeetingStore } from './meeting-store';

// 便捷函数导出
export { createOrchestrator } from './orchestrator';
export { createMeetingSubscriber } from './meeting-subscriber';
export { createContextSharer } from './context-sharer';
export { createRoleScheduler } from './role-scheduler';
export { createContextBridge } from './context-bridge';
export { createMeetingStateMachine } from './meeting-state-machine';
export { createFailureHandler } from './failure-handler';
export { createPerformanceMonitor } from './performance-monitor';

// 类型导出
export type {
  OrchestrationConfig,
  OrchestrationResult,
  OrchestrationStatus,
  OrchestrationEvent,
  RoleResult,
} from './types';

export type { RoleTask, RoleTaskResult } from './role-scheduler';
export type { SharedContext } from './context-sharer';
export type { MeetingEvent } from './meeting-subscriber';
export type {
  ContextBridgeConfig,
  BridgeSkillExecutor,
  BridgeSkillConfig,
  BridgeSkillResult,
  BridgeExecutionRequest,
  BridgeExecutionResult,
  RoleContext,
  TaskSpec,
  ExtractedContext,
  PrunedContext,
} from './context-bridge';

// 状态机类型导出
export type {
  MeetingState,
  TransitionTrigger,
  TransitionEvent,
  TransitionEntry,
  MeetingStateRecord,
  StateListener,
  TransitionRequest,
  GateResult as StateGateResult,
  GateCheckResult,
} from './meeting-state-machine';

export type {
  Notifier,
  Auditor,
  Notification,
  AuditEntry,
} from './state-listener';

// 失败处理器类型导出
export type {
  FailureHandlerConfig,
  BridgeContext,
  FailureRecord,
  FailureEvent,
  HandleResult,
  MeetingCreator,
  CreateFailureMeetingInput,
  FailureNotifier,
} from './failure-handler';

// 性能监控类型导出
export type {
  PerformanceMonitorConfig,
  PerformanceThresholds as MonitorThresholds,
  TokenMetric,
  ContextSizeMetric,
  PerformanceReport,
  HarnessPerformanceSummary,
  PerformanceAnomaly,
} from './performance-monitor';

// 讨论驱动器类型导出
export type {
  DiscussionDriverConfig,
  LLMClient,
  LLMOptions,
  MessageSender,
  MessageSendResult,
  Role,
  DiscussionMessage,
  DiscussionResult,
  Decision,
  ConsensusResult,
  SpeakerSelection,
  UserInterventionEvent,
} from './discussion-driver';

// 任务拆分器类型导出
export type {
  TaskSplitterConfig,
  ProjectAnalyzer,
  ProjectStructure,
  Task,
  TaskAssignee,
  TaskSplitResult,
  TaskDependency,
  TaskStatistics,
  DecisionInput,
} from './task-splitter';

// Workflow 库类型导出
export type {
  WorkflowLayer,
  WorkflowStatus,
  WorkflowDefinition,
  CompanyWorkflow,
  WorkflowOverrides,
  RoleWorkflowBinding,
  WorkflowConstraints,
  WorkflowUsageRecord,
  WorkflowLibraryConfig,
} from './workflow-library';

// 公司 MCP 池类型导出
export type {
  MCPSource,
  MCPTransport,
  MCPStatus,
  SystemMCP,
  CompanyMCP,
  MCPTool,
  MCPUsageRecord,
  CompanyMCPPoolConfig,
} from './company-mcp-pool';

// Spec 约束层类型导出
export type {
  ChangeLevel,
  ChangeType,
  SpecDefinition,
  ArchitectureSpec,
  ModuleSpec,
  APISpec,
  ConstraintSpec,
  SpecChangeRequest,
  SpecGateConfig,
  GateLevelConfig,
  SpecValidationResult,
  SpecValidationError,
  SpecValidationWarning,
  SpecConstraintLayerConfig,
} from './spec-constraint-layer';

// 门禁检查器类型导出
export type {
  GateType,
  GateStatus,
  GateResult,
  GateCheckContext,
  PerformanceThresholds,
  GateConfig,
  ProjectGateConfig,
  MeetingGateConfig,
  TaskGateConfig,
  GateCheckReport,
  GateCheckerConfig,
} from './gate-checker';

// 审计链类型导出
export type {
  AuditAction,
  AuditChainEntry,
  ChainValidationResult,
  AuditChainStats,
  AuditChainConfig,
} from './audit-chain';

// 经济适配器类型导出
export type {
  TaskCompletionInput,
  SettlementResult,
  MonthlySettlementResult,
  BalanceCheckResult,
  EconomyStats,
  TransactionRecord,
  EconomyAdapterConfig,
} from './economy-adapter';

// Phase 6: TaskQueue + TaskWorker 类型导出
export type {
  TaskQueueRedisClient,
  TaskOutput,
  TaskQueueConfig,
} from './task-queue';

export type {
  TaskWorkerRedisClient,
  TaskWorkerConfig,
} from './task-worker';

export type {
  TaskOutputConfig,
} from './task-output';

export type {
  WorkflowBlockerRedisClient,
  WorkflowBlockerConfig,
  SpecReviewResult,
} from './workflow-blocker';

// 会议相关类型导出
export type {
  Meeting,
  MeetingParticipant,
  MeetingMessage,
  MeetingDecision,
  MeetingSummary,
  MeetingStatus,
  MeetingStore,
  CreateMeetingInput,
  SendMessageInput,
} from './meeting-store';

export type { MeetingCoreConfig } from './meeting-core';
