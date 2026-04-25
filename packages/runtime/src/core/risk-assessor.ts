/**
 * Risk Assessor - 风险评估算法
 * 
 * 功能：
 * 1. RiskScore 计算（Severity × Impact - Reversibility + Urgency）
 * 2. L1-L4 映射
 * 3. 自动决策生成
 * 
 * WA-011: risk-assessor.ts（已封装）
 * WA-012: 风险因素权重配置
 * WA-013: L1-L4 映射逻辑
 */

import type { Deviation } from './baseline-validator';

/**
 * 风险阈值配置
 */
export interface RiskThresholds {
  autoApproveThreshold: number;    // ≤ 此值自动批准（默认 2）
  needReviewThreshold: number;      // 此值以上需要评审（默认 6）
  autoRejectThreshold: number;      // ≥ 此值自动拒绝建议（默认 15）
}

/**
 * 默认风险阈值
 */
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  autoApproveThreshold: 2,
  needReviewThreshold: 6,
  autoRejectThreshold: 15,
};

/**
 * Severity 权重配置
 */
export interface SeverityWeights {
  constraint_violation: number;     // 约束违规（4）
  db_deviation: number;             // 数据库偏离（4）
  auth_deviation: number;           // 认证偏离（3）
  api_deviation: number;            // API 偏离（3）
  tech_deviation: number;           // 技术栈偏离（2）
  structure_deviation: number;      // 代码结构偏离（1）
}

/**
 * 默认 Severity 权重
 */
export const DEFAULT_SEVERITY_WEIGHTS: SeverityWeights = {
  constraint_violation: 4,
  db_deviation: 4,
  auth_deviation: 3,
  api_deviation: 3,
  tech_deviation: 2,
  structure_deviation: 1,
};

/**
 * Impact 权重配置
 */
export interface ImpactWeights {
  full_system: number;              // 全系统（4）
  multiple_modules: number;         // 多个模块（3）
  single_module: number;            // 单个模块（2）
  single_file: number;              // 单个文件（1）
}

/**
 * 默认 Impact 权重
 */
export const DEFAULT_IMPACT_WEIGHTS: ImpactWeights = {
  full_system: 4,
  multiple_modules: 3,
  single_module: 2,
  single_file: 1,
};

/**
 * Reversibility 权重配置
 */
export interface ReversibilityWeights {
  irreversible: number;             // 不可逆（0）
  hard_to_revert: number;           // 难回滚（1）
  can_revert: number;               // 可回滚（2）
  easy_revert: number;              // 易回滚（3）
}

/**
 * 默认 Reversibility 权重
 */
export const DEFAULT_REVERSIBILITY_WEIGHTS: ReversibilityWeights = {
  irreversible: 0,
  hard_to_revert: 1,
  can_revert: 2,
  easy_revert: 3,
};

/**
 * Urgency 权重配置
 */
export interface UrgencyWeights {
  blocking: number;                 // 阻塞其他任务（2）
  medium: number;                   // 中等紧急（1）
  low: number;                      // 低紧急（0）
}

/**
 * 默认 Urgency 权重
 */
export const DEFAULT_URGENCY_WEIGHTS: UrgencyWeights = {
  blocking: 2,
  medium: 1,
  low: 0,
};

/**
 * RiskAssessor 配置
 */
export interface RiskAssessorConfig {
  thresholds?: RiskThresholds;
  severityWeights?: SeverityWeights;
  impactWeights?: ImpactWeights;
  reversibilityWeights?: ReversibilityWeights;
  urgencyWeights?: UrgencyWeights;
}

/**
 * RiskAssessor 实现
 */
export class RiskAssessor {
  private thresholds: RiskThresholds;
  private severityWeights: SeverityWeights;
  private impactWeights: ImpactWeights;
  private reversibilityWeights: ReversibilityWeights;
  private urgencyWeights: UrgencyWeights;

  constructor(config?: RiskAssessorConfig) {
    this.thresholds = config?.thresholds ?? DEFAULT_RISK_THRESHOLDS;
    this.severityWeights = config?.severityWeights ?? DEFAULT_SEVERITY_WEIGHTS;
    this.impactWeights = config?.impactWeights ?? DEFAULT_IMPACT_WEIGHTS;
    this.reversibilityWeights = config?.reversibilityWeights ?? DEFAULT_REVERSIBILITY_WEIGHTS;
    this.urgencyWeights = config?.urgencyWeights ?? DEFAULT_URGENCY_WEIGHTS;
  }

  /**
   * 计算 RiskScore
   */
  calculateRiskScore(
    deviations: Deviation[],
    impact: number,
    reversibility: number,
    urgency: number
  ): number {
    // 计算 Severity（取最高）
    let severity = 1;
    
    if (deviations.some(d => d.type === 'constraint_violation')) {
      severity = this.severityWeights.constraint_violation;
    } else if (deviations.some(d => d.severity === 'critical')) {
      severity = 4;
    } else if (deviations.some(d => d.severity === 'major')) {
      severity = 3;
    } else if (deviations.length > 0) {
      severity = 2;
    }
    
    // 计算 RiskScore
    const rawScore = severity * impact - reversibility + urgency;
    
    // 限制范围 0-18
    return Math.max(0, Math.min(18, rawScore));
  }

  /**
   * 映射到约束级别
   */
  mapToConstraintLevel(riskScore: number): 'L1' | 'L2' | 'L3' | 'L4' {
    if (riskScore >= 11) return 'L4';
    if (riskScore >= this.thresholds.needReviewThreshold) return 'L3';
    if (riskScore >= this.thresholds.autoApproveThreshold + 1) return 'L2';
    return 'L1';
  }

  /**
   * 生成自动决策
   */
  generateAutoDecision(riskScore: number): 'approve' | 'reject' | 'need_review' {
    if (riskScore <= this.thresholds.autoApproveThreshold) {
      return 'approve';
    }
    
    if (riskScore >= this.thresholds.autoRejectThreshold) {
      return 'reject';
    }
    
    return 'need_review';
  }

  /**
   * 获取阈值配置
   */
  getThresholds(): RiskThresholds {
    return this.thresholds;
  }

  /**
   * 获取权重配置
   */
  getWeights(): {
    severity: SeverityWeights;
    impact: ImpactWeights;
    reversibility: ReversibilityWeights;
    urgency: UrgencyWeights;
  } {
    return {
      severity: this.severityWeights,
      impact: this.impactWeights,
      reversibility: this.reversibilityWeights,
      urgency: this.urgencyWeights,
    };
  }

  /**
   * 动态调整阈值
   */
  adjustThresholds(newThresholds: Partial<RiskThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...newThresholds,
    };
  }
}

/**
 * 创建 RiskAssessor
 */
export function createRiskAssessor(config?: RiskAssessorConfig): RiskAssessor {
  return new RiskAssessor(config);
}