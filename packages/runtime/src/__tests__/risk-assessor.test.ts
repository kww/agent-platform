/**
 * Risk Assessor 测试
 * 
 * WA-011/012/013: 风险评估算法 + 权重配置 + L1-L4 映射
 */

import { 
  RiskAssessor, 
  createRiskAssessor,
  DEFAULT_RISK_THRESHOLDS,
  DEFAULT_SEVERITY_WEIGHTS,
} from '../core/risk-assessor';
import type { Deviation } from '../core/baseline-validator';

describe('M5: Risk Assessor', () => {
  
  describe('WA-011: RiskScore 计算', () => {
    let assessor: RiskAssessor;

    beforeEach(() => {
      assessor = createRiskAssessor();
    });

    it('should calculate RiskScore with formula', () => {
      const deviations: Deviation[] = [
        {
          id: 'dev-1',
          type: 'db_choice_deviation',
          severity: 'critical',
          description: '数据库偏离',
        },
      ];
      
      const score = assessor.calculateRiskScore(
        deviations,
        4,  // impact: full_system
        0,  // reversibility: irreversible
        2   // urgency: blocking
      );
      
      // RiskScore = 4 × 4 - 0 + 2 = 18
      expect(score).toBe(18);
    });

    it('should clamp RiskScore to 0-18', () => {
      // 负数情况
      const score1 = assessor.calculateRiskScore([], 1, 3, 0);
      expect(score1).toBeGreaterThanOrEqual(0);
      
      // 超限情况
      const deviations: Deviation[] = [
        { id: 'dev-2', type: 'constraint_violation', severity: 'critical', description: '违规' },
      ];
      const score2 = assessor.calculateRiskScore(deviations, 4, 0, 2);
      expect(score2).toBeLessThanOrEqual(18);
    });

    it('should use constraint_violation severity when present', () => {
      const deviations: Deviation[] = [
        { id: 'dev-3', type: 'constraint_violation', severity: 'critical', description: '约束违规' },
      ];
      
      const score = assessor.calculateRiskScore(deviations, 2, 2, 0);
      
      // Severity = 4 (constraint_violation)
      // RiskScore = 4 × 2 - 2 + 0 = 6
      expect(score).toBe(6);
    });
  });

  describe('WA-012: 风险因素权重配置', () => {
    it('should use default weights', () => {
      const assessor = createRiskAssessor();
      
      const weights = assessor.getWeights();
      
      expect(weights.severity.constraint_violation).toBe(DEFAULT_SEVERITY_WEIGHTS.constraint_violation);
      expect(weights.severity.db_deviation).toBe(4);
      expect(weights.impact.full_system).toBe(4);
      expect(weights.reversibility.irreversible).toBe(0);
      expect(weights.urgency.blocking).toBe(2);
    });

    it('should accept custom weights', () => {
      const assessor = createRiskAssessor({
        severityWeights: {
          constraint_violation: 5,  // 自定义权重
          db_deviation: 4,
          auth_deviation: 3,
          api_deviation: 3,
          tech_deviation: 2,
          structure_deviation: 1,
        },
      });
      
      const weights = assessor.getWeights();
      
      expect(weights.severity.constraint_violation).toBe(5);
    });
  });

  describe('WA-013: L1-L4 映射逻辑', () => {
    let assessor: RiskAssessor;

    beforeEach(() => {
      assessor = createRiskAssessor();
    });

    it('should map L1 for low risk', () => {
      const level = assessor.mapToConstraintLevel(0);
      expect(level).toBe('L1');
      
      const level2 = assessor.mapToConstraintLevel(2);
      expect(level2).toBe('L1');
    });

    it('should map L2 for moderate risk', () => {
      const level = assessor.mapToConstraintLevel(3);
      expect(level).toBe('L2');
      
      const level2 = assessor.mapToConstraintLevel(5);
      expect(level2).toBe('L2');
    });

    it('should map L3 for high risk', () => {
      const level = assessor.mapToConstraintLevel(6);
      expect(level).toBe('L3');
      
      const level2 = assessor.mapToConstraintLevel(10);
      expect(level2).toBe('L3');
    });

    it('should map L4 for critical risk', () => {
      const level = assessor.mapToConstraintLevel(11);
      expect(level).toBe('L4');
      
      const level2 = assessor.mapToConstraintLevel(18);
      expect(level2).toBe('L4');
    });

    it('should generate auto decision correctly', () => {
      // L1: approve
      const decision1 = assessor.generateAutoDecision(0);
      expect(decision1).toBe('approve');
      
      // L2: approve or need_review
      const decision2 = assessor.generateAutoDecision(3);
      expect(decision2).toBe('need_review');
      
      // L3: need_review
      const decision3 = assessor.generateAutoDecision(6);
      expect(decision3).toBe('need_review');
      
      // L4: reject
      const decision4 = assessor.generateAutoDecision(15);
      expect(decision4).toBe('reject');
    });
  });

  describe('动态调整阈值', () => {
    it('should adjust thresholds dynamically', () => {
      const assessor = createRiskAssessor();
      
      // 调整阈值
      assessor.adjustThresholds({
        autoApproveThreshold: 3,
        needReviewThreshold: 8,
      });
      
      const thresholds = assessor.getThresholds();
      
      expect(thresholds.autoApproveThreshold).toBe(3);
      expect(thresholds.needReviewThreshold).toBe(8);
    });
  });
});