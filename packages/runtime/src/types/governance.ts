/**
 * 治理机制类型定义
 * 
 * 三省六部制监察制度：独立审计官，监督角色行为
 */

import { StanceId } from './stance';
import { DocumentType } from './document';

// ========== 审计角色 ==========

/**
 * 审计类型
 */
export type AuditType = 
  | 'task'        // 任务审计
  | 'quality'     // 质量审计
  | 'efficiency'  // 效率审计
  | 'compliance'  // 合规审计
  | 'comprehensive'; // 全面审计

/**
 * 审计触发方式
 */
export type AuditTrigger = 
  | 'automatic'     // 自动触发（异常检测）
  | 'user_request'  // 用户委托
  | 'scheduled';    // 定期审计

/**
 * 审计配置
 */
export interface AuditConfig {
  /** 是否启用独立审计 */
  enabled: boolean;
  
  /** 审计角色配置 */
  auditor: {
    count: number;
    scope: ('all_tasks' | 'all_roles')[];
    scheduled: ScheduledAudit[];
  };
}

/**
 * 定期审计配置
 */
export interface ScheduledAudit {
  type: AuditType;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  enabled: boolean;
}

// ========== 审计流程 ==========

/**
 * 审计记录
 */
export interface AuditRecord {
  id: string;
  type: AuditType;
  trigger: AuditTrigger;
  
  // 审计范围
  scope: {
    timeRange: [Date, Date];
    roleIds?: string[];
    taskIds?: string[];
  };
  
  // 审计发现
  findings: AuditFinding[];
  
  // 统计数据
  statistics: AuditStatistics;
  
  // 改进建议
  recommendations: string[];
  
  // 是否需要弹劾
  impeachmentRequired: boolean;
  impeachmentTargets?: string[];
  
  // 审计人
  auditorId: string;
  
  // 时间戳
  createdAt: Date;
  completedAt?: Date;
  status: 'pending' | 'in_progress' | 'completed';
}

/**
 * 审计发现
 */
export interface AuditFinding {
  id: string;
  category: string;
  severity: 'critical' | 'major' | 'minor' | 'suggestion';
  description: string;
  evidence: string[];
  recommendation: string;
  
  // 关联信息
  roleId?: string;
  taskId?: string;
  timestamp: Date;
}

/**
 * 审计统计
 */
export interface AuditStatistics {
  totalTasks: number;
  completedTasks: number;
  successRate: number;
  averageQuality: number;
  averageEfficiency: number;
  
  // 按角色统计
  byRole?: Record<string, {
    taskCount: number;
    successRate: number;
    qualityScore: number;
  }>;
}

// ========== 弹劾机制 ==========

/**
 * 弹劾严重程度
 */
export type ImpeachmentSeverity = 'critical' | 'major' | 'minor';

/**
 * 弹劾条件
 */
export interface ImpeachmentCondition {
  severity: ImpeachmentSeverity;
  conditions: string[];
  examples: string[];
}

/**
 * 弹劾条件配置
 */
export const IMPEACHMENT_CONDITIONS: Record<ImpeachmentSeverity, ImpeachmentCondition> = {
  critical: {
    severity: 'critical',
    conditions: [
      '严重失职导致重大损失',
      '故意隐瞒问题',
      '伪造签署文档',
      '滥用职权',
    ],
    examples: [
      '删除生产数据库',
      '隐藏安全漏洞',
      '伪造审批签名',
    ],
  },
  major: {
    severity: 'major',
    conditions: [
      '连续 3 个月绩效不达标',
      '多次审核失误',
      '违反工作流程',
    ],
    examples: [
      '连续 3 个月质量分 < 3.0',
      '连续 5 次审核遗漏问题',
      '跳过必要审核步骤',
    ],
  },
  minor: {
    severity: 'minor',
    conditions: [
      '工作态度问题',
      '沟通不畅',
      '配合度低',
    ],
    examples: [
      '多次延迟回复',
      '拒绝合理协作',
    ],
  },
};

/**
 * 弹劾记录
 */
export interface ImpeachmentRecord {
  id: string;
  
  // 弹劾信息
  impeachment: {
    targetId: string;
    targetName: string;
    reason: string;
    severity: ImpeachmentSeverity;
    evidence: string[];
  };
  
  // 审核结果
  review: {
    techLeadOpinion: string;
    techLeadDecision?: 'support' | 'oppose';
    userDecision?: 'approve' | 'reject' | 'mitigate';
    finalPenalty?: string;
  };
  
  // 时间线
  timeline: {
    initiatedAt: Date;
    reviewedAt?: Date;
    decidedAt?: Date;
    executedAt?: Date;
  };
  
  // 状态
  status: 'pending' | 'reviewed' | 'decided' | 'executed' | 'cancelled';
  
  // 发起人
  initiatorId: string;
}

/**
 * 弹劾流程步骤
 */
export interface ImpeachmentWorkflowStep {
  name: string;
  action: 'initiate' | 'review' | 'decide' | 'execute';
  role: 'auditor' | 'tech-lead' | 'user' | 'system';
  required: boolean;
  timeout?: number;
}

/**
 * 弹劾工作流
 */
export const IMPEACHMENT_WORKFLOW: ImpeachmentWorkflowStep[] = [
  {
    name: '发起弹劾',
    action: 'initiate',
    role: 'auditor',
    required: true,
    timeout: 86400000, // 24 小时
  },
  {
    name: '审核弹劾',
    action: 'review',
    role: 'tech-lead',
    required: true,
    timeout: 172800000, // 48 小时
  },
  {
    name: '用户裁决',
    action: 'decide',
    role: 'user',
    required: true,
    timeout: 604800000, // 7 天
  },
  {
    name: '执行处罚',
    action: 'execute',
    role: 'system',
    required: true,
  },
];

// ========== 匿名举报 ==========

/**
 * 举报记录
 */
export interface AnonymousReport {
  id: string;
  
  // 举报内容
  content: {
    targetId: string;
    targetName: string;
    description: string;
    evidence?: string[];
  };
  
  // 举报者（加密）
  reporterId: string; // 加密存储
  
  // 处理状态
  status: 'received' | 'investigating' | 'verified' | 'rejected' | 'closed';
  
  // 处理结果
  result?: {
    verified: boolean;
    action: 'impeachment' | 'warning' | 'none';
    impeachmentId?: string;
  };
  
  // 时间戳
  createdAt: Date;
  updatedAt: Date;
  
  // 保护措施
  protection: {
    reporterProtected: boolean;
    noRetaliation: boolean;
    rewardGiven?: boolean;
  };
}

/**
 * 举报处理步骤
 */
export interface ReportHandlingStep {
  name: string;
  action: 'receive' | 'verify' | 'investigate' | 'decide';
  role: 'auditor';
  timeout?: number;
}

/**
 * 举报处理工作流
 */
export const REPORT_HANDLING_WORKFLOW: ReportHandlingStep[] = [
  {
    name: '接收举报',
    action: 'receive',
    role: 'auditor',
    timeout: 3600000, // 1 小时
  },
  {
    name: '初步核实',
    action: 'verify',
    role: 'auditor',
    timeout: 86400000, // 24 小时
  },
  {
    name: '深入调查',
    action: 'investigate',
    role: 'auditor',
    timeout: 604800000, // 7 天
  },
  {
    name: '处理结果',
    action: 'decide',
    role: 'auditor',
    timeout: 172800000, // 48 小时
  },
];

// ========== 审计角色定义 ==========

/**
 * 审计角色配置
 */
export interface AuditorRoleConfig {
  /** 角色定义 */
  role: {
    id: 'auditor';
    name: '审计官';
    stance: 'auditor';
  };
  
  /** 独立性保证 */
  independence: {
    notInProjects: boolean;    // 不参与项目开发
    notManagedByTechLead: boolean; // 不受 tech-lead 管理
    reportDirectlyToUser: boolean; // 直接向用户负责
  };
  
  /** 核心能力 */
  capabilities: string[];
  
  /** 性格设定 */
  personality: {
    prompt: string;
    traits: string[];
  };
}

/**
 * 审计角色默认配置
 */
export const DEFAULT_AUDITOR_CONFIG: AuditorRoleConfig = {
  role: {
    id: 'auditor',
    name: '审计官',
    stance: 'auditor',
  },
  independence: {
    notInProjects: true,
    notManagedByTechLead: true,
    reportDirectlyToUser: true,
  },
  capabilities: [
    'audit-task',
    'audit-quality',
    'audit-efficiency',
    'audit-compliance',
    'report-issue',
    'impeach-role',
  ],
  personality: {
    prompt: `你是审计官，独立于项目团队，负责监督。
站在审计者的立场思考。
你性格公正、严谨、不留情面。
发现问题直接上报，不徇私情。`,
    traits: ['公正', '严谨', '不留情面', '独立'],
  },
};

// ========== 封驳制度 ==========

/**
 * 审核结论
 */
export type ReviewVerdict = 
  | 'approve'        // 通过
  | 'reject'         // 封还（直接退回）
  | 'request_changes'; // 驳正（要求修改）

/**
 * 封驳记录
 */
export interface RejectionRecord {
  id: string;
  documentId: string;
  reviewerId: string;
  
  // 封驳类型
  type: 'reject' | 'request_changes';
  
  // 封驳理由
  reason: string;
  
  // 具体问题
  issues: {
    description: string;
    severity: 'critical' | 'major' | 'minor';
    suggestion?: string;
  }[];
  
  // 处理结果
  result?: {
    action: 'resubmit' | 'modify' | 'withdraw';
    modifiedDocument?: string;
  };
  
  // 时间戳
  createdAt: Date;
  resolvedAt?: Date;
  status: 'pending' | 'resolved' | 'withdrawn';
}

/**
 * 审核权力配置
 */
export interface ReviewerPowerConfig {
  /** 是否有封还权 */
  canReject: boolean;
  
  /** 是否有驳正权 */
  canRequestChanges: boolean;
  
  /** 审核范围 */
  scope: DocumentType[];
  
  /** 一票否决权 */
  vetoPower: {
    enabled: boolean;
    conditions: string[];
  };
}
