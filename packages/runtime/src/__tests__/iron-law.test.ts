/**
 * 约束检查器测试
 */

import { 
  constraintChecker, 
  IRON_LAWS, 
  GUIDELINES,
  checkConstraint 
} from '@dommaker/harness';
import type { ConstraintContext } from '@dommaker/harness';

describe('Constraint System', () => {
  describe('IRON_LAWS definitions', () => {
    test('should have no_bypass_checkpoint law', () => {
      expect(IRON_LAWS.no_bypass_checkpoint).toBeDefined();
      expect(IRON_LAWS.no_bypass_checkpoint.rule).toBe('NO BYPASSING CHECKPOINTS');
    });

    test('should have no_self_approval law', () => {
      expect(IRON_LAWS.no_self_approval).toBeDefined();
    });

    test('all iron laws should have required fields', () => {
      Object.values(IRON_LAWS).forEach(law => {
        expect(law.id).toBeDefined();
        expect(law.rule).toBeDefined();
        expect(law.message).toBeDefined();
        expect(law.trigger).toBeDefined();
        expect(law.enforcement).toBeDefined();
        expect(law.level).toBe('iron_law');
      });
    });
  });

  describe('GUIDELINES definitions', () => {
    test('should have no_fix_without_root_cause guideline', () => {
      expect(GUIDELINES.no_fix_without_root_cause).toBeDefined();
      expect(GUIDELINES.no_fix_without_root_cause.level).toBe('guideline');
    });

    test('all guidelines should have level guideline', () => {
      Object.values(GUIDELINES).forEach(guideline => {
        expect(guideline.level).toBe('guideline');
      });
    });
  });

  describe('checkConstraint', () => {
    test('should return satisfied when precondition is met', async () => {
      const context: ConstraintContext = {
        operation: 'bug_fix_attempt',
        hasRootCauseInvestigation: true
      };

      const result = await checkConstraint('no_fix_without_root_cause', context);

      expect(result.satisfied).toBe(true);
    });

    test('should return not satisfied when precondition is not met', async () => {
      const context: ConstraintContext = {
        operation: 'bug_fix_attempt',
        hasRootCauseInvestigation: false
      };

      const result = await checkConstraint('no_fix_without_root_cause', context);

      expect(result.satisfied).toBe(false);
      expect(result.message).toBe(GUIDELINES.no_fix_without_root_cause.message);
    });

    test('should return error for unknown constraint', async () => {
      const context: ConstraintContext = {
        operation: 'bug_fix_attempt'
      };

      const result = await checkConstraint('non-existent-constraint', context);

      expect(result.satisfied).toBe(false);
      expect(result.message).toContain('未知的约束');
    });
  });

  describe('checkConstraints (three-layer)', () => {
    test('should return three-layer results', async () => {
      const context: ConstraintContext = {
        operation: 'task_completion_claim',
        hasVerificationEvidence: true,
        hasTest: true
      };

      const result = await constraintChecker.checkConstraints(context);

      expect(result.ironLaws).toBeDefined();
      expect(result.guidelines).toBeDefined();
      expect(result.tips).toBeDefined();
      expect(result.passed).toBe(true);
    });
  });

  describe('no_completion_without_verification (Iron Law)', () => {
    test('should pass when has verification evidence', async () => {
      const context: ConstraintContext = {
        operation: 'task_completion_claim',
        hasVerificationEvidence: true
      };

      const result = await checkConstraint('no_completion_without_verification', context);

      expect(result.satisfied).toBe(true);
    });

    test('should fail when no verification evidence', async () => {
      const context: ConstraintContext = {
        operation: 'task_completion_claim',
        hasVerificationEvidence: false
      };

      const result = await checkConstraint('no_completion_without_verification', context);

      expect(result.satisfied).toBe(false);
    });
  });

  describe('no_skill_without_test (Guideline)', () => {
    test('should pass when has test', async () => {
      const context: ConstraintContext = {
        operation: 'skill_creation',
        hasTest: true
      };

      const result = await checkConstraint('no_skill_without_test', context);

      expect(result.satisfied).toBe(true);
    });

    test('should fail when no test', async () => {
      const context: ConstraintContext = {
        operation: 'skill_creation',
        hasTest: false
      };

      const result = await checkConstraint('no_skill_without_test', context);

      expect(result.satisfied).toBe(false);
    });
  });
});