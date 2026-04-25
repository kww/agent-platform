/**
 * 签署文档类型定义
 * 
 * 三省六部制文书流转制度：每个环节都有正式文书，可追溯、可问责、可存档
 */

import { StanceId } from './stance';

// ========== 文档类型 ==========

/**
 * 文档类型
 */
export type DocumentType = 
  | 'proposal'     // 提案文书
  | 'review'       // 审核意见书
  | 'decision'     // 决策记录
  | 'execution'    // 执行回执
  | 'report';      // 工作报告

/**
 * 文档状态
 */
export type DocumentStatus = 
  | 'draft'          // 草稿
  | 'pending_review' // 待审核
  | 'approved'       // 已批准
  | 'rejected'       // 已拒绝
  | 'executed'       // 已执行
  | 'archived';      // 已归档

// ========== 签署文档 ==========

/**
 * 签署文档
 */
export interface SignedDocument {
  id: string;
  type: DocumentType;
  
  // 文档内容
  content: DocumentContent;
  
  // 签署信息
  signers: DocumentSigner[];
  
  // 文档状态
  status: DocumentStatus;
  
  // 关联信息
  relations: DocumentRelations;
  
  // 审核结果
  reviewResult?: ReviewResult;
  
  // 元数据
  metadata: DocumentMetadata;
}

/**
 * 文档内容
 */
export interface DocumentContent {
  title: string;
  body: any;
  attachments?: DocumentAttachment[];
  
  // 文档来源
  source?: {
    workflowId?: string;
    stepId?: string;
    taskId?: string;
  };
}

/**
 * 文档附件
 */
export interface DocumentAttachment {
  id: string;
  name: string;
  type: string;
  content: string | Buffer;
  size?: number;
}

/**
 * 文档签署者
 */
export interface DocumentSigner {
  /** 角色 ID */
  roleId: string;
  
  /** 角色名称 */
  roleName: string;
  
  /** 立场 */
  stance: StanceId;
  
  /** 签署时间 */
  signedAt: Date;
  
  /** 签名（可验证） */
  signature: string;
  
  /** 审核意见 */
  opinion?: string;
  
  /** 审核结论 */
  verdict?: 'approve' | 'reject' | 'request_changes';
}

/**
 * 文档关联
 */
export interface DocumentRelations {
  /** 上级文档 */
  parentDocument?: string;
  
  /** 关联任务 */
  taskId?: string;
  
  /** 关联工作流 */
  workflowId?: string;
  
  /** 关联角色 */
  roleIds?: string[];
}

/**
 * 审核结果
 */
export interface ReviewResult {
  /** 最终结论 */
  decision: 'approved' | 'rejected' | 'changes_requested';
  
  /** 决策理由 */
  reason: string;
  
  /** 决策者 */
  deciderId: string;
  
  /** 时间戳 */
  timestamp: Date;
}

/**
 * 文档元数据
 */
export interface DocumentMetadata {
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  version: string;
  archivedAt?: Date;
}

// ========== 文档类型配置 ==========

/**
 * 文档类型配置
 */
export const DOCUMENT_TYPE_CONFIG: Record<DocumentType, {
  name: string;
  description: string;
  requiredSigners: string[];
  autoArchive: boolean;
  retentionDays: number;
}> = {
  proposal: {
    name: '提案文书',
    description: '方案策划提出的提案',
    requiredSigners: ['reviewer', 'tech-lead'],
    autoArchive: true,
    retentionDays: 365,
  },
  review: {
    name: '审核意见书',
    description: '评审专家的审核意见',
    requiredSigners: [],
    autoArchive: true,
    retentionDays: 365,
  },
  decision: {
    name: '决策记录',
    description: '项目负责人的决策记录',
    requiredSigners: ['tech-lead'],
    autoArchive: true,
    retentionDays: 365,
  },
  execution: {
    name: '执行回执',
    description: '开发者的执行回执',
    requiredSigners: ['developer'],
    autoArchive: true,
    retentionDays: 365,
  },
  report: {
    name: '工作报告',
    description: '工作完成后的报告',
    requiredSigners: ['tech-lead'],
    autoArchive: true,
    retentionDays: 365,
  },
};

// ========== 文书流转 ==========

/**
 * 文书流转步骤
 */
export interface DocumentFlowStep {
  /** 步骤名称 */
  name: string;
  
  /** 动作 */
  action: 'create' | 'submit' | 'review' | 'sign' | 'execute' | 'archive';
  
  /** 执行角色 */
  role: string;
  
  /** 输入文档 */
  inputDocument?: string;
  
  /** 输出文档 */
  outputDocument?: string;
  
  /** 条件 */
  condition?: string;
  
  /** 超时 */
  timeout?: number;
}

/**
 * 文书流转记录
 */
export interface DocumentFlowRecord {
  id: string;
  documentId: string;
  steps: DocumentFlowStepResult[];
  currentStep: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
}

/**
 * 流转步骤结果
 */
export interface DocumentFlowStepResult {
  step: DocumentFlowStep;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  executor?: string;
  output?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// ========== 会签制度 ==========

/**
 * 会签配置
 */
export interface CountersignConfig {
  /** 是否启用会签 */
  enabled: boolean;
  
  /** 会签角色 */
  roles: string[];
  
  /** 通过条件 */
  passCondition: 'all' | 'majority' | 'weighted';
  
  /** 权重配置 */
  weights?: Record<string, number>;
  
  /** 超时 */
  timeout?: number;
}

/**
 * 会签记录
 */
export interface CountersignRecord {
  id: string;
  documentId: string;
  config: CountersignConfig;
  
  /** 各角色签署状态 */
  signers: CountersignSigner[];
  
  /** 最终结果 */
  result?: 'approved' | 'rejected';
  
  /** 时间戳 */
  createdAt: Date;
  completedAt?: Date;
}

/**
 * 会签签署者
 */
export interface CountersignSigner {
  roleId: string;
  roleName: string;
  status: 'pending' | 'signed' | 'rejected';
  signedAt?: Date;
  opinion?: string;
  verdict?: 'approve' | 'reject';
}

// ========== 文档归档 ==========

/**
 * 归档配置
 */
export interface ArchiveConfig {
  /** 归档时机 */
  timing: ('task_complete' | 'task_cancel' | 'monthly')[];
  
  /** 归档内容 */
  content: DocumentType[];
  
  /** 存储位置模板 */
  locationTemplate: string;
  
  /** 保留天数 */
  retentionDays: number;
  
  /** 索引字段 */
  indexFields: string[];
}

/**
 * 归档记录
 */
export interface ArchiveRecord {
  id: string;
  documentIds: string[];
  archivedAt: Date;
  location: string;
  size: number;
  indexed: boolean;
}

// ========== 文档查询 ==========

/**
 * 文档查询条件
 */
export interface DocumentQuery {
  /** 按任务查询 */
  taskId?: string;
  
  /** 按角色查询 */
  roleId?: string;
  
  /** 按状态查询 */
  status?: DocumentStatus;
  
  /** 按类型查询 */
  type?: DocumentType;
  
  /** 按时间范围 */
  timeRange?: {
    start: Date;
    end: Date;
  };
  
  /** 分页 */
  pagination?: {
    offset: number;
    limit: number;
  };
  
  /** 排序 */
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

/**
 * 责任链追溯结果
 */
export interface ResponsibilityTrace {
  document: SignedDocument;
  signers: DocumentSigner[];
  parentDocuments?: ResponsibilityTrace[];
}
