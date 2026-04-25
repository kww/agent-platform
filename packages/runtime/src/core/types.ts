/**
 * 类型定义
 */

// ========== Stage Definition (责任链模型) ==========

/**
 * 开发阶段（责任链模型）
 */
export type Stage = 'plan' | 'develop' | 'verify' | 'deploy' | 'fix' | 'govern';

// ========== Fail Strategy (AR-008) ==========

/**
 * 并行执行失败策略
 */
export type FailStrategy = 'all' | 'continue' | 'best-effort';

// ========== Skill (意图层) ==========

/**
 * Skill 路由规则
 */
export interface SkillRoutingRule {
  /** 规则条件 */
  condition: string;
  /** 匹配时调用的 Workflow */
  workflow: string;
  /** 规则优先级（数字越大优先级越高） */
  priority?: number;
  /** 规则描述 */
  description?: string;
}

/**
 * Skill 意图定义
 */
export interface SkillIntent {
  /** 意图关键词 */
  keywords: string[];
  /** 意图描述 */
  description: string;
  /** 示例用户输入 */
  examples?: string[];
}

/**
 * Skill 场景上下文
 */
export interface SkillContext {
  /** 领域知识 */
  domain?: string;
  /** 最佳实践 */
  bestPractices?: string[];
  /** 代码规范 */
  codeStyle?: string;
  /** 自定义 Prompt 片段 */
  prompts?: Record<string, string>;
}

/**
 * Skill 定义（意图层）
 * 
 * Skill 是面向用户的意图抽象层，负责：
 * 1. 识别用户意图
 * 2. 根据上下文路由到合适的 Workflow
 * 3. 提供场景级别的上下文
 */
export interface Skill {
  /** Skill ID */
  id: string;
  /** Skill 名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 版本号 */
  version?: string;
  
  /** 意图定义 */
  intent: SkillIntent;
  
  /** 路由规则（按优先级排序，匹配第一个） */
  routing: SkillRoutingRule[];
  
  /** 默认 Workflow（无匹配规则时使用） */
  defaultWorkflow?: string;
  
  /** 场景上下文 */
  context?: SkillContext;
  
  /** OpenClaw 元数据 */
  openclaw?: {
    /** 是否用户可调用 */
    userInvocable?: boolean;
    /** 显示图标 */
    emoji?: string;
    /** 触发命令 */
    command?: string;
  };
  
  /** 元数据 */
  metadata?: Record<string, any>;
}

// ========== Workflow ==========

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  usageScenario?: string;  // 使用场景说明
  inputs?: WorkflowInput[];
  steps?: Step[];        // 扁平步骤列表
  phases?: Phase[];      // 阶段划分（二选一）
  outputs?: string[];
  retry?: RetryConfig;
  timeout?: number;
  context?: string;  // 上下文模板路径，如 frameworks/nextjs
  
  // OpenClaw 元数据
  openclaw?: {
    userInvocable?: boolean;
    emoji?: string;
    keywords?: string[];
  };
  
  // Superpowers 整合
  superpowers?: string[];
  
  // 铁律检查
  iron_laws?: IronLaw[];
  
  // 动态执行配置
  dynamic_execution?: DynamicExecution;
  
  // 子工作流调用
  sub_workflows?: SubWorkflow[];
  
  // 回滚配置
  rollback?: RollbackConfig;
  
  // 🆕 AW-026 工作流级错误处理
  error_handlers?: StepErrorHandler[];
  
  // 🆕 部分成功配置
  continueOnFailure?: boolean | ContinueOnFailureConfig;
  
  // 🆕 并发控制配置
  concurrency?: ConcurrencyConfig;
  
  // 🆕 默认 Agent 配置（AR-005）
  // 优先级：步骤指定 > 工作流默认 > 全局默认 > codex
  defaultAgent?: string;
  
  // 🆕 Phase 6: Workflow Agent 共享
  agent?: string;           // Workflow 级别 Agent
  agentMode?: 'shared' | 'separate';  // Agent 模式
  agentConfig?: AgentConfig; // Agent 配置
}

/**
 * 🆕 Phase 6: Agent 配置
 */
export interface AgentConfig {
  passHistory?: boolean;      // 是否传递对话历史
  historyStrategy?: 'full' | 'summary' | 'hybrid';  // 历史策略
  recentCount?: number;       // hybrid 模式保留最近轮次（默认 2）
  maxHistoryTokens?: number;  // 最大历史 Token（默认 50000）
}

/**
 * 🆕 并发控制配置
 */
export interface ConcurrencyConfig {
  max_parallel_tasks?: number;   // 工作流级别最大并发数
  resource_aware?: boolean;      // 是否启用资源感知调度
  priority_queue?: boolean;      // 是否启用优先级队列
}

/**
 * 🆕 部分成功配置
 */
export interface ContinueOnFailureConfig {
  enabled: boolean;
  maxFailures?: number;           // 最大允许失败数
  failureSteps?: string[];        // 允许失败的步骤 ID
  onStepFailure?: 'continue' | 'warn' | 'abort';  // 步骤失败时的行为
  reportOnComplete?: boolean;     // 完成时报告失败统计
}

export interface SubWorkflow {
  id: string;
  workflow: string;          // 引用的 workflow ID
  input?: Record<string, any>;
  outputs?: string[];
  checkpoint?: Checkpoint;
  condition?: string;
}

export interface RollbackConfig {
  enabled: boolean;
  on_phases?: string[];      // 在哪些阶段失败时触发回滚
  steps?: RollbackStep[];
}

export interface RollbackStep {
  command: string;
  message?: string;
  on_error?: 'continue' | 'abort';
}

export interface Phase {
  id: string;
  name: string;
  description?: string;
  steps?: Step[];        // 阶段内的步骤
  parallel?: Step[];     // 并行步骤
  checkpoint?: Checkpoint | Checkpoint[];  // 阶段检查点
}

export interface Checkpoint {
  id?: string;
  check?: 'file_exists' | 'command_success' | 'output_contains';
  path?: string;
  command?: string;
  output?: string;
  pattern?: string;
  message?: string;
  verify?: string;
  on_fail?: 'retry' | 'abort' | 'skip';
}

export interface IronLaw {
  id: string;
  enforce_at?: string;
  message: string;
}

// ========== Dynamic Execution ==========

export interface DynamicExecution {
  enabled: boolean;
  source: string;              // 数据源，如 "${steps.load-tasks.output}"
  step_template: Step;         // 步骤模板
  parallel?: boolean;          // 是否并行执行
  max_parallel?: number;       // 最大并行数
  task_filter?: string;        // 任务过滤器（可选）
  continue_on_error?: boolean; // 任务失败是否继续
}

export interface DynamicTask {
  id: string;
  name: string;
  type: string;
  priority?: number;
  files?: TaskFile[];
  dependencies?: string[];
  spec?: string;
  test_required?: boolean;
  test_files?: TaskFile[];
  acceptance?: string[];
  
  // 🆕 约束机制字段
  passes?: boolean;              // 任务是否通过（只能由测试结果修改）
  test_result?: TaskTestResult;  // 测试证据
  step_status?: Record<string, TaskStepStatus>;  // 步骤状态跟踪
  current_step?: string;         // 当前执行的步骤
  current_step_index?: number;   // 当前步骤索引
  constraint_level?: ConstraintLevel;  // 约束级别
}

export interface TaskFile {
  path: string;
  type?: string;
}

export interface ExecutionPlan {
  phase: string;
  parallel: boolean;
  tasks: string[];
}

export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  description?: string;
  default?: any;
}

// ========== Step ==========

export interface Step {
  id: string;
  
  // 步骤引用（原子步骤）
  step?: string;              // 引用原子步骤名称，如 "analyze-codebase"
  
  // 直接执行工具
  tool?: string;
  
  // 输入输出
  input?: Record<string, any>;
  output?: string;
  
  // 条件与控制
  condition?: string;
  retry?: RetryConfig;
  timeout?: number;
  parallel?: Step[];          // 并行步骤
  
  // 🆕 AR-008 并行执行优化
  max_parallel?: number;      // 最大并发数
  failStrategy?: FailStrategy; // 失败策略：all | continue | best-effort
  
  // 🆕 AW-026 步骤级错误处理
  on_fail?: 'abort' | 'skip' | 'continue' | 'fallback';
  fallback?: FallbackConfig;
  error_handlers?: StepErrorHandler[];
  
  // 🆕 Batch Iterator - 批次迭代执行
  type?: 'batch-iterator' | 'loop' | 'aggregator' | 'notification';
  source?: string;            // 数据源表达式，如 "${steps.split-batch.batches}"
  batch_var?: string;         // 批次变量名，如 "current_batch"
  index_var?: string;         // 索引变量名，如 "batch_index"
  steps?: Step[];             // 子步骤列表
  
  // 🆕 Loop - 循环执行
  max_iterations?: number;    // 最大迭代次数
  loop_condition?: string;    // 循环条件
  initial_state?: Record<string, any>;  // 初始状态
  
  // 🆕 AR-009 P2: 迭代结果清理
  keep_recent_iterations?: number;  // 保留最近 N 次结果（默认 3）
  cleanup_interval?: number;        // 清理间隔（默认每 5 次）
  
  // 🆕 Aggregator - 结果汇总
  aggregate?: {
    source: string;
    operations: AggregateOperation[];
  };
  
  // 🆕 Notification - 通知
  message?: string;           // 通知消息模板
  channel?: string;           // 通知渠道
  
  // 阶段信息（由 parser 自动填充）
  phaseId?: string;
  phaseName?: string;
  
  // 检查点
  checkpoint?: Checkpoint;
  
  // 🆕 Phase 6: 步骤级 Agent 覆盖
  agentOverride?: string;     // 覆盖 Workflow.agent
}

// ========== Aggregate Operation ==========
export interface AggregateOperation {
  name: string;
  type: 'count' | 'count_where' | 'sum' | 'average' | 'filter' | 'group';
  field?: string;
  condition?: string;
}

// ========== Loop Step Extension ==========
export interface LoopStep extends Step {
  action?: 'set_state' | 'break';
  state?: Record<string, any>;
}

// ========== Understand (Knowledge Graph) ==========

export interface UnderstandConfig {
  /** 分析范围：项目根目录或子目录 */
  scope?: string;
  /** 是否强制全量分析 */
  force?: boolean;
  /** 输出路径，默认 .understand-anything/knowledge-graph.json */
  outputPath?: string;
  /** 是否包含测试文件 */
  includeTests?: boolean;
  /** 排除目录 */
  excludeDirs?: string[];
}

export interface KnowledgeGraph {
  project: ProjectMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  layers: GraphLayer[];
  tour: TourStep[];
}

export interface ProjectMeta {
  name: string;
  description?: string;
  languages: string[];
  frameworks: string[];
  analyzedAt: string;
  gitCommitHash: string;
}

export interface GraphNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'module' | 'concept';
  name: string;
  filePath?: string;
  summary: string;
  tags: string[];
  complexity: 'simple' | 'moderate' | 'complex';
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  direction: 'forward' | 'backward' | 'bidirectional';
  weight: number;
  description?: string;
}

export interface GraphLayer {
  id: string;
  name: string;
  description: string;
  nodeIds: string[];
}

export interface TourStep {
  order: number;
  title: string;
  description: string;
  nodeIds: string[];
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'completed_with_error';
  output?: any;
  error?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
}

// ========== Tool ==========

export interface Tool {
  name: string;
  description?: string;
  input?: ToolInput[];
  output?: ToolOutput;
  script?: string;
  timeout?: number;
}

export interface ToolInput {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  default?: any;
}

export interface ToolOutput {
  [key: string]: any;
}

// ========== Execution ==========

export interface ExecutionOptions {
  workdir?: string;
  timeout?: number;
  stepTimeout?: number;  // 单个步骤超时（毫秒）
  useCache?: boolean;    // 是否启用步骤缓存
  resume?: boolean;      // 是否从断点恢复
  force?: boolean;       // 是否强制重新执行
  onEvent?: (event: import('./events').Event) => void;
  onComplete?: (result: ExecutionResult) => void;
  onError?: (error: Error) => void;
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  steps: StepResult[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  
  // 🆕 Token 统计
  tokenUsage?: {
    model: string;
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
    stepCount: number;
    avgPerStep: number;
    steps: Array<{
      stepId: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
}

// ========== Retry ==========

export interface RetryConfig {
  maxAttempts: number;
  backoff?: 'fixed' | 'exponential' | 'smart';  // smart = 智能重试（修改 prompt）
  initialDelay?: number;
  maxDelay?: number;
}

// ========== AW-026 步骤级错误处理 ==========

/**
 * 备用方案配置
 */
export interface FallbackConfig {
  agent?: string;             // 备用 Agent（如 'claude-code', 'pi'）
  step?: string;              // 备用步骤（引用其他步骤）
  timeout?: number;           // 备用超时
  temperature?: number;       // 备用 Agent 温度
}

/**
 * 错误匹配配置
 */
export interface ErrorMatchConfig {
  error_type?: StepErrorType | string;   // 错误类型
  error_pattern?: string;                // 错误消息正则匹配
  step_status?: string;                  // 步骤状态匹配
  recoverable?: boolean;                 // 可恢复性匹配
}

/**
 * 错误处理动作
 */
export interface ErrorAction {
  type: 'retry' | 'fallback' | 'skip' | 'abort' | 'notify' | 'continue';
  config?: RetryConfig | FallbackConfig | any;  // 动作配置
}

/**
 * 步骤级错误处理器
 */
export interface StepErrorHandler {
  match: ErrorMatchConfig;    // 匹配规则
  actions: ErrorAction[];     // 处理动作链（按顺序执行）
  priority?: number;          // 优先级（数字越小越先匹配）
  description?: string;       // 描述
}

/**
 * 错误类型枚举（对应 error-handler.ts）
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
 * 错误分类结果
 */
export interface ErrorClassification {
  type: StepErrorType | string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

// ========== Retry History ==========

export interface RetryAttempt {
  attempt: number;
  error: string;
  prompt?: string;  // 智能重试时的 prompt
  timestamp: string;
}

// ========== Registry ==========

export interface Registry {
  version: string;
  workflows: WorkflowMeta[];
  tools: ToolMeta[];
}

// Workflow 元数据（匹配接口文档 WorkflowInfo）
export interface WorkflowMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'workflow';
  stepIds: string[];
  /** Stage 分类（责任链模型）*/
  stage?: Stage;
  openclaw?: {
    userInvocable?: boolean;
    emoji?: string;
    keywords?: string[];
  };
  path: string;
  createdAt?: string;
  updatedAt?: string;
}

// Tool 元数据（匹配接口文档 ToolInfo）
export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'tool';
  /** Stage 分类（责任链模型）*/
  stage?: Stage;
  path: string;
  createdAt?: string;
  updatedAt?: string;
}

// ========== Step Definition (原子步骤) ==========

export interface StepDefinition {
  /** 步骤 ID */
  id?: string;
  name: string;
  description?: string;
  category: 'analysis' | 'design' | 'development' | 'quality' | 'deploy';
  version?: string;
  inputs?: StepInput[];
  outputs?: StepOutput[];
  execute?: StepExecute;
  
  // 类型标记
  type?: 'skill';
  
  // 文件路径
  path?: string;
  
  // Agent 配置
  agent?: string;
  temperature?: number;
  prompt?: string;
  
  // 可用工具
  tools?: string[];
}

export interface StepInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  description?: string;
}

export interface StepOutput {
  name: string;
  type: string;
  description?: string;
}

export interface StepExecute {
  type: 'tool' | 'understand' | 'builtin' | 'agent' | 'script';
  tool?: string;
  handler?: string;  // builtin 处理器名称
  script?: string;   // 🆕 shell 脚本内容
  config?: Record<string, any>;
  input?: Record<string, any>;
  output?: string;
  
  // Agent 执行配置
  agent?: string;
  temperature?: number;
  prompt?: string;
}

// Step 元数据（匹配接口文档 StepInfo）
export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'skill';
  
  // Agent 配置
  agent?: 'codex' | 'claude';
  temperature?: number;
  maxTokens?: number;
  
  // 可用工具
  tools?: string[];
  
  // Prompt（必需）
  prompt: string;
  
  // 输入输出
  inputs?: StepInput[];
  outputs?: StepOutput[];
  
  // 元数据
  path: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ========== Execution Context ==========

// ========== Session ==========

export interface SessionEntry {
  stepId: string;
  stepName?: string;
  phaseId?: string;
  phaseName?: string;
  output?: any;
  summary?: string;  // 步骤摘要（可选）
  thinking?: string; // 思考过程（可选）
  timestamp: Date;
}

export interface ExecutionContext {
  executionId: string;
  workflow: Workflow;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  steps: StepResult[];
  workdir: string;
  eventEmitter: import('./events').EventEmitter;
  // AR-007: 步骤缓存（支持 TTL/LRU/git hash）
  stepCache?: import('./cache').StepCache | Map<string, any>;
  useCache?: boolean;
  // 增量执行支持
  skipSteps?: string[];
  stateHandle?: {
    updateStep: (stepId: string, stepState: any) => Promise<void>;
    complete: (outputs: any, status?: string) => Promise<void>;
  };
  // 上下文支持
  projectContext?: import('./context').ProjectContext;
  // Workflow Session 支持
  // ⚠️ 已废弃：请使用 historyCompressor 代替
  // 保留用于向后兼容，内部使用 historyCompressor 管理
  sessionHistory?: SessionEntry[];
  // 🆕 历史压缩器（sessionHistory 管理 + Token 优化）
  // 🆕 AR-010: 统一历史管理
  historyCompressor?: import('./history-compressor').HistoryCompressor;
}

// ========== Progress Tracking (P0) ==========

export interface ProgressState {
  executionId: string;
  workflowId: string;
  workflowName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  currentStep?: StepProgress;
  steps: StepProgress[];
  startedAt: Date;
  estimatedEndTime?: Date;
  estimatedRemaining?: number;  // 秒
  lastUpdated: Date;
  warnings: ProgressWarning[];
  errors: ProgressError[];
}

export interface StepProgress {
  stepId: string;
  stepName?: string;
  phaseId?: string;
  phaseName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;  // 毫秒
  progress?: number;  // 0-100，子进度
  message?: string;
  output?: any;
  error?: string;
}

export interface ProgressWarning {
  stepId: string;
  message: string;
  timestamp: Date;
}

export interface ProgressError {
  stepId: string;
  error: string;
  type: ErrorType;
  recoverable: boolean;
  suggestion?: string;
  timestamp: Date;
}

// ========== Error Classification (P0) ==========

export type ErrorType = 
  | 'NETWORK'        // 网络错误 → 立即重试
  | 'RATE_LIMIT'     // API 限制 → 延迟重试
  | 'API_ERROR'      // API 错误 → 检查配置
  | 'CODE_ERROR'     // 代码错误 → 修改 prompt
  | 'TIMEOUT'        // 超时 → 增加超时时间
  | 'VALIDATION'     // 验证失败 → 检查输入
  | 'PERMISSION'     // 权限错误 → 检查权限
  | 'UNKNOWN';       // 未知错误

export interface ClassifiedError {
  type: ErrorType;
  originalError: string;
  recoverable: boolean;
  retryDelay?: number;  // 毫秒
  suggestion?: string;
  context?: Record<string, any>;
}

// ========== Notification (P0) ==========

export interface NotificationConfig {
  enabled: boolean;
  channels: NotificationChannel[];
  events: NotificationEvent[];
  interval: number;  // 进度通知间隔（秒）
  webhookUrl?: string;
  discordChannelId?: string;
}

export type NotificationChannel = 'discord' | 'webhook' | 'wechat' | 'telegram';

export type NotificationEvent = 
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'phase.started'
  | 'phase.completed'
  | 'step.completed'   // 步骤完成
  | 'step.progress'    // 定期进度更新
  | 'error.occurred'
  | 'warning.occurred';

export interface NotificationPayload {
  executionId: string;
  workflowId: string;
  workflowName?: string;
  event: NotificationEvent;
  status: ProgressState['status'];
  progress: number;  // 0-100
  currentStep?: string;
  completedSteps: number;
  totalSteps: number;
  duration: number;  // 秒
  estimatedRemaining?: number;
  error?: string;
  warnings: number;
  timestamp: Date;
  tokenUsage?: {
    used: number;
    remaining: number;
    percentage: number;
    stepCount: number;
    avgPerStep: number;
  };
}

// ========== Timeout Configuration (P0) ==========

export interface TimeoutConfig {
  workflow?: number;        // 工作流总超时（毫秒）
  step?: number;            // 默认步骤超时（毫秒）
  agent?: Record<string, number>;  // Agent 特定超时
  warningThreshold?: number;  // 超时预警阈值（百分比，默认 50）
}

export const DEFAULT_TIMEOUTS: TimeoutConfig = {
  workflow: 3600000,   // 1 小时
  step: 300000,        // 5 分钟
  agent: {
    'codex': 600000,       // 10 分钟
    'claude-code': 600000, // 10 分钟
    'pi': 600000,          // 10 分钟
  },
  warningThreshold: 50,  // 50% 时发送预警
};

// ========== Agent Fallback (P1) ==========

/**
 * Agent 回退配置
 */
export interface AgentFallbackConfig {
  enabled: boolean;
  fallbacks: AgentFallbackMapping[];
  retryWithFallback?: boolean;  // 失败后是否用备用 Agent 重试
  notifyOnFallback?: boolean;   // 切换时是否通知
}

/**
 * Agent 回退映射
 */
export interface AgentFallbackMapping {
  primary: string;       // 主 Agent
  fallback: string;      // 备用 Agent
  condition?: FallbackCondition;
  maxRetries?: number;   // 切换前最大重试次数
}

/**
 * 回退条件
 */
export interface FallbackCondition {
  errorTypes?: ErrorType[];       // 特定错误类型触发
  maxDuration?: number;           // 超过指定时间触发
  consecutiveFailures?: number;   // 连续失败次数触发
}

/**
 * 回退状态
 */
export interface FallbackState {
  originalAgent: string;
  currentAgent: string;
  fallbackCount: number;
  fallbackHistory: FallbackEvent[];
}

/**
 * 回退事件
 */
export interface FallbackEvent {
  from: string;
  to: string;
  reason: string;
  timestamp: Date;
  attemptNumber: number;
}

// ========== Token Tracking (P1) ==========

/**
 * Token 使用记录
 */
export interface TokenUsageRecord {
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
  stepUsages: TokenUsageRecord[];
  warningThreshold: number;
  warningSent: boolean;
}

// ========== Output Processing (P1) ==========

/**
 * 输出类别
 */
export type OutputCategory = 'critical' | 'important' | 'compressible';

/**
 * 输出类型
 */
export type OutputType = 
  | 'error'
  | 'decision'
  | 'file_change'
  | 'commit'
  | 'test_result'
  | 'api_response'
  | 'log'
  | 'progress'
  | 'code'
  | 'explanation';

/**
 * 分类后的输出
 */
export interface ClassifiedOutput {
  stepId: string;
  type: OutputType;
  category: OutputCategory;
  original: string;
  processed: string;
  tokens: number;
  savedTokens: number;
  metadata?: Record<string, any>;
}

// ========== Constraint Mechanism ==========

/**
 * 约束级别
 */
export type ConstraintLevel = 'L1' | 'L2' | 'L3' | 'L4';

/**
 * 任务步骤状态
 */
export interface TaskStepStatus {
  completed: boolean;
  result?: string;
  timestamp?: Date;
  error?: string;
}

/**
 * 任务测试结果
 */
export interface TaskTestResult {
  passed: boolean;
  command: string;           // 执行的测试命令
  output?: string;           // 测试输出
  failures?: string[];       // 失败信息
  coverage?: number;         // 覆盖率
  timestamp: Date;
  evidence?: string;         // 测试证据（截图、日志等路径）
}

/**
 * Session Startup 检查点配置
 */
export interface StartupCheckpoints {
  required: StartupCheckpointType[];
  optional?: StartupCheckpointType[];
  timeout?: number;          // 检查点超时（毫秒）
}

export type StartupCheckpointType = 
  | 'pwd'
  | 'git_log'
  | 'git_status'
  | 'read_progress'
  | 'read_task_list'
  | 'init_sh'
  | 'basic_verification'
  | 'load_context';

/**
 * Startup 检查点结果
 */
export interface StartupCheckpointResult {
  type: StartupCheckpointType;
  success: boolean;
  data?: any;
  error?: string;
  duration: number;  // 执行时长（毫秒）
}

/**
 * PassesGate 配置
 */
export interface PassesGateConfig {
  enabled: boolean;
  testCommand?: string;       // 自定义测试命令，默认从 package.json 读取
  requireEvidence?: boolean;  // 是否要求测试证据
  allowPartialPass?: boolean; // 是否允许部分通过
  maxRetries?: number;        // 最大重试次数
  retryDelay?: number;        // 重试延迟（毫秒）
}

/**
 * 测试门控结果
 */
export interface PassesGateResult {
  taskId: string;
  allowed: boolean;
  testResult?: TaskTestResult;
  error?: string;
  attempts: number;
}

/**
 * Clean State 配置
 */
export interface CleanStateConfig {
  enabled: boolean;
  autoCommit?: boolean;       // 是否自动提交未提交的变更
  detectBugs?: boolean;       // 是否检测 bug
  updateProgress?: boolean;   // 是否更新 progress 文件
  commitMessageTemplate?: string;  // 提交消息模板
}

/**
 * Clean State 结果
 */
export interface CleanStateResult {
  isClean: boolean;
  hasUncommittedChanges: boolean;
  committedFiles?: string[];
  bugs?: DetectedBug[];
  progressUpdated: boolean;
  errors?: string[];
}

/**
 * 检测到的 Bug
 */
export interface DetectedBug {
  file: string;
  line?: number;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'syntax' | 'runtime' | 'logic' | 'security' | 'performance';
}

/**
 * 约束矩阵规则
 */
export interface ConstraintRule {
  id: string;
  condition: ConstraintCondition;
  level: ConstraintLevel;
  requireApproval?: boolean;
  approvalRoles?: string[];   // 需要审批的角色
  message?: string;
}

export interface ConstraintCondition {
  linesChanged?: number;      // 变更行数
  targetModules?: string[];   // 目标模块
  affectsSecurity?: boolean;  // 影响安全
  affectsProduction?: boolean; // 影响生产
  taskType?: string;          // 任务类型
}

/**
 * 性格系统 - Big Five 模型
 */
export interface Personality {
  openness: number;          // 开放性 0-1
  conscientiousness: number; // 尽责性 0-1
  extraversion: number;      // 外向性 0-1
  agreeableness: number;     // 宜人性 0-1
  neuroticism: number;       // 神经质 0-1
}

/**
 * 性格模板
 */
export interface PersonalityTemplate {
  id: string;
  name: string;
  description?: string;
  personality: Personality;
  type: 'user' | 'employee';
  behaviorInfluence?: PersonalityBehaviorInfluence;
}

/**
 * 性格对行为的影响
 */
export interface PersonalityBehaviorInfluence {
  codeQuality?: number;        // 代码质量倾向 0-1
  communicationStyle?: number; // 沟通风格 0-1
  ratingTendency?: number;     // 评分倾向 -0.5 到 +0.5
  stanceAdherence?: number;    // 立场坚守程度 0-1
  feedbackLikelihood?: number; // 反馈意愿 0-1
}

/**
 * Task List JSON 格式（扩展版）
 */
export interface TaskListJson {
  project: {
    name: string;
    description?: string;
    path: string;
    tech_stack?: Record<string, string>;
    created_at?: Date;
    updated_at?: Date;
  };
  tasks: DynamicTask[];
  execution_plan?: ExecutionPlan[];
  
  // 🆕 约束机制元数据
  constraint_config?: {
    default_level?: ConstraintLevel;
    rules?: ConstraintRule[];
  };
  
  // 🆕 创建信息
  created_by?: string;        // 创建来源（workflow id）
  created_at?: Date;
  last_session_id?: string;   // 上次执行 session
}

// ============================================
// 🆕 自我进化机制 - 失败归因与能力缺口报告
// ============================================

/**
 * 失败根本原因类型
 */
export type FailureRootCause =
  | 'capability_missing'    // 能力缺失：角色没有该能力
  | 'context_insufficient'  // 上下文不足：缺少必要信息
  | 'constraint_too_strict' // 约束过严：无法完成任务
  | 'constraint_too_loose'  // 约束过松：没有有效约束
  | 'workflow_defect'       // 工作流缺陷：步骤设计有问题
  | 'agent_limitation'      // Agent 限制：模型能力限制
  | 'external_failure'      // 外部失败：网络/API/环境问题
  | 'unknown';              // 未知原因

/**
 * 能力缺口类型
 */
export type GapType = 'tool' | 'step' | 'workflow' | 'context' | 'constraint' | 'knowledge';

/**
 * 能力缺口报告
 */
export interface GapReport {
  id: string;                    // GAP-YYYYMMDD-NNN
  timestamp: number;
  
  // 关联信息
  executionId: string;
  workflowId: string;
  stepId: string;
  roleId?: string;
  
  // 归因结果
  rootCause: FailureRootCause;
  confidence: number;            // 0-1，置信度
  
  // 缺口详情
  gap: {
    type: GapType;
    name: string;                // 缺失的能力名
    description: string;         // 描述
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
  
  // 影响评估
  impact: {
    affected_workflows: string[];
    affected_roles: string[];
    frequency_estimate: number;  // 预估发生频率 0-1
  };
  
  // 建议方案
  suggestions: GapSuggestion[];
  
  // 原始错误
  originalError?: string;
  errorType?: ErrorType;
  
  // 状态
  status: 'open' | 'in_review' | 'accepted' | 'rejected' | 'implemented';
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  assigned_to?: string;
}

/**
 * 进化建议
 */
export interface GapSuggestion {
  type: 'add_capability' | 'adjust_constraint' | 'enhance_context' | 'fix_workflow' | 'upgrade_agent';
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  recommended: boolean;
}

/**
 * 归因规则
 */
export interface RootCauseRule {
  cause: FailureRootCause;
  error_types?: ErrorType[];
  patterns?: string[];
  conditions?: RootCauseCondition[];
  auto_classify: boolean;
  priority: number;  // 规则优先级，数字越小越先匹配
}

/**
 * 归因条件
 */
export interface RootCauseCondition {
  constraint_level?: ConstraintLevel[];
  retry_count?: string;          // ">3", ">=2" 等
  test_passed?: boolean;
  step_order_invalid?: boolean;
  skipped_required_step?: boolean;
}

/**
 * 归因分析结果
 */
export interface RootCauseAnalysisResult {
  rootCause: FailureRootCause;
  confidence: number;
  matchedRule?: RootCauseRule;
  matchedPattern?: string;
  gapReport: GapReport;
}

/**
 * 进化待办项
 */
export interface EvolutionBacklogItem {
  id: string;                    // EVOL-NNN 或 GAP-YYYYMMDD-NNN
  type: 'evolution' | 'capability';
  title: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_review' | 'accepted' | 'rejected' | 'implemented';
  
  gap_report_id: string;
  root_cause: FailureRootCause;
  
  suggested_solution: string;
  estimated_effort: 'low' | 'medium' | 'high';
  
  votes?: Array<{
    role: string;
    vote: 'approve' | 'reject';
    reason?: string;
  }>;
  
  created_at: number;
  updated_at?: number;
}

// ============================================
// 🆕 治理机制 - 投票、审计、效果追踪
// ============================================

/**
 * 投票类型
 */
export type VoteType = 'approve' | 'reject' | 'abstain';

/**
 * 投票权重类型
 */
export type VoteWeight = 'normal' | 'heavy' | 'veto';

/**
 * 单个投票
 */
export interface Vote {
  voter_id: string;              // 投票者 ID（角色或用户）
  voter_type: 'role' | 'user';   // 投票者类型
  vote: VoteType;
  weight: number;                // 权重值（普通=1, 重权=2, 否决=无限）
  reason?: string;               // 投票理由
  timestamp: number;
}

/**
 * 投票会话
 */
export interface VotingSession {
  id: string;                    // VOTE-YYYYMMDD-NNN
  topic: string;                 // 投票主题
  description?: string;          // 详细描述
  
  // 关联信息
  related_item_id: string;       // 关联的进化建议/审计报告 ID
  related_item_type: 'evolution' | 'audit' | 'impeachment';
  
  // 投票配置
  config: VotingConfig;
  
  // 投票记录
  votes: Vote[];
  
  // 状态
  status: 'pending' | 'voting' | 'completed' | 'cancelled';
  
  // 结果
  result?: VotingResult;
  
  // 时间线
  created_at: number;
  voting_started_at?: number;
  voting_ends_at?: number;
  completed_at?: number;
}

/**
 * 投票配置
 */
export interface VotingConfig {
  // 通过条件
  method: 'simple_majority' | 'absolute_majority' | 'unanimous' | 'super_majority';
  threshold: number;             // 通过阈值（百分比）
  
  // 参与者
  participants: VotingParticipant[];
  
  // 时间限制
  duration_minutes?: number;     // 投票时长（分钟）
  
  // 否决权配置
  veto_holders?: string[];       // 有否决权的角色 ID
  
  // 最少参与人数
  min_participants?: number;
  quorum?: number;               // 法定人数（百分比）
}

/**
 * 投票参与者
 */
export interface VotingParticipant {
  id: string;
  type: 'role' | 'user';
  weight: VoteWeight;
  required?: boolean;            // 是否必须投票
}

/**
 * 投票结果
 */
export interface VotingResult {
  decision: 'approved' | 'rejected' | 'no_quorum' | 'vetoed';
  
  // 统计
  statistics: {
    total_participants: number;
    actual_voters: number;
    approve_count: number;
    reject_count: number;
    abstain_count: number;
    approve_weight: number;
    reject_weight: number;
  };
  
  // 通过条件检查
  checks: {
    quorum_met: boolean;
    threshold_met: boolean;
    veto_exercised: boolean;
  };
  
  // 详细记录
  vote_breakdown: Vote[];
  
  // 时间
  decided_at: number;
}

/**
 * 审计类型
 */
export type AuditType = 'task' | 'quality' | 'efficiency' | 'compliance' | 'comprehensive';

/**
 * 审计报告
 */
export interface AuditReport {
  id: string;                    // AUDIT-YYYYMMDD-NNN
  type: AuditType;
  
  // 审计范围
  scope: {
    time_range: [number, number];  // [start, end] 时间戳
    roles: string[];
    tasks: string[];
    workflows?: string[];
  };
  
  // 审计发现
  findings: AuditFinding[];
  
  // 统计数据
  statistics: {
    total_tasks: number;
    success_rate: number;
    average_quality: number;
    average_efficiency: number;
    issues_found: number;
  };
  
  // 改进建议
  recommendations: string[];
  
  // 是否需要弹劾
  impeachment_required: boolean;
  impeachment_targets?: string[];
  
  // 元数据
  auditor_id: string;
  created_at: number;
  status: 'draft' | 'final' | 'reviewed';
}

/**
 * 审计发现
 */
export interface AuditFinding {
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  description: string;
  evidence: string[];
  recommendation: string;
  affected_roles?: string[];
  affected_tasks?: string[];
}

/**
 * 弹劾严重程度
 */
export type ImpeachmentSeverity = 'critical' | 'major' | 'minor';

/**
 * 弹劾记录
 */
export interface ImpeachmentRecord {
  id: string;                    // IMP-YYYYMMDD-NNN
  
  // 弹劾信息
  impeachment: {
    target_id: string;           // 被弹劾角色 ID
    target_type: 'role';
    reason: string;
    severity: ImpeachmentSeverity;
    evidence: string[];
  };
  
  // 审核流程
  review: {
    tech_lead_opinion?: string;
    tech_lead_decision?: 'proceed' | 'dismiss';
    user_decision?: 'approve' | 'reject' | 'mitigate';
    final_penalty?: string;
  };
  
  // 时间线
  timeline: {
    initiated_at: number;
    reviewed_at?: number;
    decided_at?: number;
    executed_at?: number;
  };
  
  // 状态
  status: 'pending' | 'reviewed' | 'decided' | 'executed' | 'dismissed';
  
  // 发起人
  initiated_by: string;          // Auditor ID
}

/**
 * 匿名举报
 */
export interface AnonymousReport {
  id: string;                    // RPT-YYYYMMDD-NNN
  
  // 举报内容
  report: {
    target_id: string;           // 被举报角色 ID
    description: string;
    evidence?: string[];
    severity: ImpeachmentSeverity;
  };
  
  // 保护措施
  protection: {
    reporter_identity_encrypted: boolean;
    reporter_id_hash: string;    // 加密后的举报者 ID
  };
  
  // 处理结果
  handling: {
    status: 'received' | 'investigating' | 'verified' | 'dismissed';
    auditor_id?: string;
    investigation_notes?: string;
    impeachment_initiated?: boolean;
    impeachment_id?: string;
  };
  
  // 时间
  created_at: number;
  updated_at?: number;
}

/**
 * 效果追踪状态
 */
export type EffectStatus = 'pending' | 'tracking' | 'success' | 'failed' | 'rolled_back';

/**
 * 效果追踪记录
 */
export interface EffectTracking {
  id: string;                    // EFF-YYYYMMDD-NNN
  
  // 关联信息
  evolution_item_id: string;     // 关联的进化建议
  implementation_id: string;     // 实现记录 ID
  
  // 追踪配置
  config: EffectTrackingConfig;
  
  // 指标数据
  metrics: EffectMetric[];
  
  // 检查点结果
  checkpoints: EffectCheckpoint[];
  
  // 状态
  status: EffectStatus;
  
  // 回滚决策
  rollback_decision?: RollbackDecision;
  
  // 时间线
  implemented_at: number;
  tracking_started_at?: number;
  tracking_ends_at?: number;
  completed_at?: number;
}

/**
 * 效果追踪配置
 */
export interface EffectTrackingConfig {
  // 风险等级
  risk_level: 'low' | 'medium' | 'high';
  
  // 追踪周期
  tracking_duration_hours: number;   // 总追踪时长
  
  // 检查点
  checkpoint_schedule: EffectCheckpointSchedule[];
  
  // 基础指标（必追踪）
  basic_metrics: ['error_rate', 'test_pass_rate', 'build_status'];
  
  // 增强指标（可选）
  enhanced_metrics?: ('response_time' | 'memory_usage' | 'api_success_rate')[];
  
  // 回滚阈值
  rollback_thresholds: {
    error_rate_increase: number;     // 错误率增加上限（百分比）
    test_pass_rate_drop: number;     // 测试通过率下降下限
    critical_errors: number;         // 关键错误数上限
  };
  
  // 回滚策略
  rollback_strategy: 'auto' | 'manual' | 'notify';
}

/**
 * 效果检查点调度
 */
export interface EffectCheckpointSchedule {
  time: string;                // 'immediate' | '1h' | '1d' | '1w'
  checks: string[];            // 要检查的指标
}

/**
 * 效果指标
 */
export interface EffectMetric {
  name: string;
  type: 'basic' | 'enhanced';
  
  // 基线（实现前）
  baseline: {
    value: number;
    timestamp: number;
  };
  
  // 当前值
  current: {
    value: number;
    timestamp: number;
  };
  
  // 变化
  change: {
    absolute: number;
    percentage: number;
    trend: 'improved' | 'degraded' | 'stable';
  };
  
  // 阈值检查
  threshold_exceeded: boolean;
}

/**
 * 效果检查点结果
 */
export interface EffectCheckpoint {
  scheduled_time: string;
  actual_time: number;
  
  // 指标快照
  metrics: EffectMetric[];
  
  // 整体评估
  assessment: 'pass' | 'warn' | 'fail';
  
  // 问题
  issues?: string[];
  
  // 建议
  recommendations?: string[];
}

/**
 * 回滚决策
 */
export interface RollbackDecision {
  decision: 'rollback' | 'keep' | 'monitor';
  reason: string;
  
  // 触发条件
  triggered_by: {
    metric?: string;
    threshold?: number;
    actual_value?: number;
    manual_decision?: boolean;
  };
  
  // 回滚执行
  execution?: {
    started_at?: number;
    completed_at?: number;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    commit_before?: string;
    commit_after?: string;
  };
  
  // 决策者
  decided_by: string;            // 'auto' 或用户 ID
  decided_at: number;
}
