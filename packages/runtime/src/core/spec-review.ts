/**
 * Spec 审查机制
 * 
 * 双签制：架构师 + 项目负责人
 * 关键变更需要审查后才能提交
 */

export type ChangeType = 'architecture' | 'api' | 'data-model' | 'workflow' | 'step' | 'skill' | 'other';

export interface SpecChange {
  type: ChangeType;
  file: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  reviewer?: string;
  approved: boolean;
  timestamp?: string;
}

export interface ReviewResult {
  required: boolean;
  reason?: string;
  changes: SpecChange[];
  approvals: {
    architect: boolean;
    projectLead: boolean;
  };
  status: 'pending' | 'approved' | 'rejected' | 'not-required';
}

// 关键变更类型（需要审查）
const CRITICAL_CHANGE_TYPES: ChangeType[] = ['architecture', 'api', 'data-model'];

// 高影响变更关键词
const HIGH_IMPACT_KEYWORDS = [
  'interface', 'schema', 'model', 'api', 'endpoint', 'workflow', 'step',
  'breaking', 'deprecate', 'remove', 'delete', 'rename', 'restructure'
];

/**
 * 分析变更是否需要审查
 */
export function analyzeChanges(changes: SpecChange[]): ReviewResult {
  // 检查是否有关键变更
  const criticalChanges = changes.filter(c => 
    CRITICAL_CHANGE_TYPES.includes(c.type) || c.impact === 'high'
  );
  
  if (criticalChanges.length === 0) {
    return {
      required: false,
      reason: '无关键变更，无需审查',
      changes,
      approvals: { architect: false, projectLead: false },
      status: 'not-required'
    };
  }
  
  return {
    required: true,
    reason: `发现 ${criticalChanges.length} 个关键变更需要审查`,
    changes: criticalChanges,
    approvals: { architect: false, projectLead: false },
    status: 'pending'
  };
}

/**
 * 检测变更类型
 */
export function detectChangeType(file: string, diff: string): ChangeType {
  // 根据文件路径判断
  if (file.includes('/api/') || file.includes('api.')) return 'api';
  if (file.includes('/models/') || file.includes('schema')) return 'data-model';
  if (file.includes('/architecture/') || file.includes('ARCHITECTURE')) return 'architecture';
  if (file.includes('/workflows/') || file.includes('.workflow.')) return 'workflow';
  if (file.includes('/steps/') || file.includes('.step.')) return 'step';
  if (file.includes('/skills/') || file.includes('SKILL.')) return 'skill';
  
  // 根据内容判断
  const lowerDiff = diff.toLowerCase();
  if (lowerDiff.includes('interface ') || lowerDiff.includes('api ')) return 'api';
  if (lowerDiff.includes('schema') || lowerDiff.includes('model')) return 'data-model';
  
  return 'other';
}

/**
 * 评估变更影响
 */
export function assessImpact(diff: string): 'high' | 'medium' | 'low' {
  const lowerDiff = diff.toLowerCase();
  
  // 高影响关键词
  for (const keyword of HIGH_IMPACT_KEYWORDS) {
    if (lowerDiff.includes(keyword)) {
      return 'high';
    }
  }
  
  // 中等影响
  if (lowerDiff.includes('change') || lowerDiff.includes('update') || lowerDiff.includes('modify')) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * 审查流程状态
 */
export interface ReviewWorkflow {
  id: string;
  changes: SpecChange[];
  result: ReviewResult;
  architectReview?: {
    reviewer: string;
    approved: boolean;
    comment?: string;
    timestamp: string;
  };
  projectLeadReview?: {
    reviewer: string;
    approved: boolean;
    comment?: string;
    timestamp: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建审查工作流
 */
export function createReviewWorkflow(changes: SpecChange[]): ReviewWorkflow {
  const result = analyzeChanges(changes);
  const id = `review-${Date.now()}`;
  const now = new Date().toISOString();
  
  return {
    id,
    changes,
    result,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 提交审查意见
 */
export function submitReview(
  workflow: ReviewWorkflow,
  role: 'architect' | 'projectLead',
  reviewer: string,
  approved: boolean,
  comment?: string
): ReviewWorkflow {
  const now = new Date().toISOString();
  
  const review = {
    reviewer,
    approved,
    comment,
    timestamp: now
  };
  
  if (role === 'architect') {
    workflow.architectReview = review;
    workflow.result.approvals.architect = approved;
  } else {
    workflow.projectLeadReview = review;
    workflow.result.approvals.projectLead = approved;
  }
  
  // 更新状态
  if (workflow.result.approvals.architect && workflow.result.approvals.projectLead) {
    workflow.result.status = 'approved';
  } else if (!approved) {
    workflow.result.status = 'rejected';
  }
  
  workflow.updatedAt = now;
  
  return workflow;
}

/**
 * 检查是否可以提交
 */
export function canCommit(workflow: ReviewWorkflow): { allowed: boolean; reason?: string } {
  if (!workflow.result.required) {
    return { allowed: true };
  }
  
  if (workflow.result.status === 'approved') {
    return { allowed: true };
  }
  
  if (workflow.result.status === 'rejected') {
    return { allowed: false, reason: '审查已拒绝，无法提交' };
  }
  
  return { allowed: false, reason: '等待审查完成' };
}
