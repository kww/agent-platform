/**
 * 编排层类型定义
 */

/**
 * 执行状态
 */
export type ExecutionStatus = 
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'stopped'
  | 'cancelled';

/**
 * 编排配置
 */
export interface OrchestrationConfig {
  // 执行 ID
  executionId: string;
  
  // 项目 ID
  projectId: string;
  
  // 工作流 ID
  workflowId?: string;
  
  // 最大并发角色数
  maxConcurrentRoles?: number;
  
  // 上下文共享配置
  context?: {
    // 是否启用上下文共享
    enabled: boolean;
    // TTL（秒）
    ttl?: number;
  };
  
  // 事件回调
  onEvent?: (event: OrchestrationEvent) => void;
}

/**
 * 编排结果
 */
export interface OrchestrationResult {
  // 执行 ID
  executionId: string;
  
  // 状态
  status: OrchestrationStatus;
  
  // 参与角色
  roles: string[];
  
  // 各角色执行结果
  roleResults: Map<string, RoleResult>;
  
  // 共享上下文摘要
  contextSummary?: SharedContextSummary;
  
  // 错误信息
  error?: string;
  
  // 开始时间
  startedAt: string;
  
  // 结束时间
  completedAt?: string;
}

/**
 * 编排状态
 */
export type OrchestrationStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * 角色执行结果
 */
export interface RoleResult {
  roleId: string;
  roleName: string;
  status: ExecutionStatus;
  output?: any;
  error?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

/**
 * 编排事件
 */
export interface OrchestrationEvent {
  type: string;
  executionId: string;
  roleId?: string;
  data?: any;
  timestamp: string;
}

/**
 * 共享上下文摘要
 */
export interface SharedContextSummary {
  // 上下文条目数
  entryCount: number;
  
  // 总大小（字节）
  totalSize: number;
  
  // 关键数据键
  keys: string[];
  
  // 最后更新时间
  lastUpdatedAt: string;
}

/**
 * Spec 约束模式
 * - none: 无约束（需求早期讨论）
 * - flexible: 建议性约束（可参考但不强制）
 * - strict: 严格约束（必须遵守）
 */
export type SpecMode = 'none' | 'flexible' | 'strict';

/**
 * 会议约束级别
 * - L1: none - 需求早期讨论，不传递到工作流
 * - L2: advisory - 技术方案讨论，工作流可参考但不强制
 * - L3: binding - 架构决策，工作流必须遵守
 * - L4: binding - 关键架构决策，工作流必须遵守 + 审批流程
 */
export type ConstraintLevel = 'L1' | 'L2' | 'L3' | 'L4';

/**
 * 约束级别到 Spec 模式的映射
 */
export const CONSTRAINT_TO_SPEC_MODE: Record<ConstraintLevel, SpecMode> = {
  L1: 'none',
  L2: 'flexible',
  L3: 'strict',
  L4: 'strict',
};

/**
 * 约束上下文
 */
export interface ConstraintContext {
  // 约束级别
  constraintLevel: ConstraintLevel;
  
  // 映射后的 Spec 模式
  specMode: SpecMode;
  
  // 来源（会议 ID 或手动指定）
  source: {
    type: 'meeting' | 'manual';
    id?: string;
  };
  
  // 创建时间
  createdAt: string;
}
