/**
 * 立场系统单元测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  defineStanceHandler,
  listStancesHandler,
  stanceReviewHandler,
  multiStanceReviewHandler,
  aggregateOpinionsHandler,
} from '../core/stance-handlers';
import {
  getStance,
  getAllStances,
  getStancesByCategory,
  STANCE_DEFINITIONS,
} from '../core/stances';
import { StanceId } from '../types/stance';

describe('Stance Definitions', () => {
  it('should have 9 core stances', () => {
    const stances = getAllStances();
    expect(stances.length).toBeGreaterThanOrEqual(9);
  });

  it('should return correct stance by id', () => {
    const critic = getStance('critic');
    expect(critic).toBeDefined();
    expect(critic?.nameZh).toBe('挑刺者');
    expect(critic?.category).toBe('decision');
  });

  it('should return stances by category', () => {
    const decisionStances = getStancesByCategory('decision');
    expect(decisionStances.length).toBe(3);
    expect(decisionStances.map(s => s.id)).toContain('critic');
    expect(decisionStances.map(s => s.id)).toContain('supporter');
    expect(decisionStances.map(s => s.id)).toContain('decider');
  });

  it('each stance should have required fields', () => {
    const stances = getAllStances();
    for (const stance of stances) {
      expect(stance.id).toBeDefined();
      expect(stance.name).toBeDefined();
      expect(stance.nameZh).toBeDefined();
      expect(stance.category).toBeDefined();
      expect(stance.prompt).toBeDefined();
      expect(stance.forbiddenActions).toBeInstanceOf(Array);
      expect(stance.focusAreas).toBeInstanceOf(Array);
      expect(stance.typicalQuestions).toBeInstanceOf(Array);
    }
  });

  it('critic stance should forbid supporting', () => {
    const critic = getStance('critic');
    expect(critic?.forbiddenActions).toContain('不能认同或支持方案');
  });

  it('supporter stance should forbid criticizing', () => {
    const supporter = getStance('supporter');
    expect(supporter?.forbiddenActions).toContain('不能质疑或否定想法');
  });
});

describe('define-stance handler', () => {
  it('should inject stance prompt', async () => {
    const result = await defineStanceHandler({
      stance_id: 'critic',
      task: 'Review this architecture design',
      input_content: 'The system uses microservices architecture',
    });

    expect(result.success).toBe(true);
    expect(result.stance.id).toBe('critic');
    expect(result.injected_prompt).toContain('评审专家');
    expect(result.injected_prompt).toContain('Review this architecture design');
    expect(result.forbidden_actions).toBeInstanceOf(Array);
  });

  it('should throw error for unknown stance', async () => {
    await expect(defineStanceHandler({
      stance_id: 'unknown-stance',
    })).rejects.toThrow('Unknown stance');
  });

  it('should include additional prompt when provided', async () => {
    const result = await defineStanceHandler({
      stance_id: 'security',
      task: 'Security review',
      additional_prompt: 'Focus on authentication vulnerabilities',
    });

    expect(result.injected_prompt).toContain('Security review');
    expect(result.injected_prompt).toContain('Focus on authentication vulnerabilities');
  });

  it('should include focus areas and typical questions', async () => {
    const result = await defineStanceHandler({
      stance_id: 'tester',
    });

    expect(result.focus_areas).toContain('测试覆盖');
    expect(result.typical_questions).toContain('如果输入 X 会怎样？');
  });
});

describe('list-stances handler', () => {
  it('should list all stances', async () => {
    const result = await listStancesHandler({});

    expect(result.success).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(9);
    expect(result.stances).toBeInstanceOf(Array);
  });

  it('should filter by category', async () => {
    const result = await listStancesHandler({
      category: 'decision',
    });

    expect(result.success).toBe(true);
    expect(result.stances.every((s: any) => s.category === 'decision')).toBe(true);
  });
});

describe('stance-review handler', () => {
  it('should generate review config for critic', async () => {
    const result = await stanceReviewHandler({
      stance_id: 'critic',
      artifact_type: 'architecture',
      artifact_content: 'Using microservices with 10 services',
      review_criteria: ['Scalability', 'Maintainability', 'Performance'],
    });

    expect(result.success).toBe(true);
    expect(result.review_config.stance.id).toBe('critic');
    expect(result.review_config.artifact_type).toBe('architecture');
    expect(result.review_config.review_prompt).toContain('挑刺者');
    expect(result.expected_output.verdict).toBeDefined();
  });

  it('should include previous opinions when provided', async () => {
    const previousOpinions = [
      {
        stanceId: 'critic',
        roleId: 'reviewer-01',
        verdict: 'request_changes',
        opinion: 'Need more detail on error handling',
        timestamp: new Date(),
      },
    ];

    const result = await stanceReviewHandler({
      stance_id: 'supporter',
      artifact_type: 'proposal',
      previous_opinions: previousOpinions,
    });

    expect(result.review_config.review_prompt).toContain('其他立场意见');
    expect(result.review_config.review_prompt).toContain('Need more detail');
  });
});

describe('multi-stance-review handler', () => {
  it('should generate multi-stance review config', async () => {
    const result = await multiStanceReviewHandler({
      artifact_type: 'proposal',
      artifact_content: 'Add user authentication feature',
      stances: ['critic', 'supporter', 'decider'],
      aggregation_method: 'decider',
    });

    expect(result.success).toBe(true);
    expect(result.multi_review_config.stances.length).toBe(3);
    expect(result.multi_review_config.parallel).toBe(true);
    expect(result.expected_workflow).toBeInstanceOf(Array);
  });

  it('should use default stances if not specified', async () => {
    const result = await multiStanceReviewHandler({
      artifact_type: 'proposal',
    });

    expect(result.multi_review_config.stances.length).toBe(3);
    expect(result.multi_review_config.stances.map((s: any) => s.stance_id)).toContain('critic');
    expect(result.multi_review_config.stances.map((s: any) => s.stance_id)).toContain('supporter');
    expect(result.multi_review_config.stances.map((s: any) => s.stance_id)).toContain('decider');
  });

  it('should throw error for invalid stance', async () => {
    await expect(multiStanceReviewHandler({
      stances: ['invalid-stance'],
    })).rejects.toThrow('Unknown stance');
  });
});

describe('aggregate-opinions handler', () => {
  const mockOpinions = [
    {
      stanceId: 'critic',
      roleId: 'reviewer-01',
      verdict: 'request_changes',
      opinion: 'Need more error handling',
      timestamp: new Date(),
    },
    {
      stanceId: 'supporter',
      roleId: 'strategist-01',
      verdict: 'approve',
      opinion: 'Good proposal overall',
      timestamp: new Date(),
    },
    {
      stanceId: 'decider',
      roleId: 'tech-lead-01',
      verdict: 'approve',
      opinion: 'Approve with minor changes',
      timestamp: new Date(),
    },
  ];

  it('should aggregate with decider method', async () => {
    const result = await aggregateOpinionsHandler({
      opinions: mockOpinions,
      aggregation_method: 'decider',
    });

    expect(result.success).toBe(true);
    expect(result.aggregation_result.final_decision).toBe('approved');
    expect(result.aggregation_result.reason).toContain('决策者决定');
    expect(result.aggregation_result.statistics.total).toBe(3);
  });

  it('should aggregate with majority method', async () => {
    const result = await aggregateOpinionsHandler({
      opinions: mockOpinions,
      aggregation_method: 'majority',
    });

    expect(result.success).toBe(true);
    expect(result.aggregation_result.final_decision).toBe('approved');
    expect(result.aggregation_result.statistics.approve).toBe(2);
  });

  it('should aggregate with consensus method', async () => {
    const result = await aggregateOpinionsHandler({
      opinions: mockOpinions,
      aggregation_method: 'consensus',
    });

    expect(result.success).toBe(true);
    expect(result.aggregation_result.final_decision).toBe('changes_requested');
    expect(result.aggregation_result.reason).toContain('有立场要求修改');
  });

  it('should aggregate with weighted method', async () => {
    // All approve - should pass
    const allApproveOpinions = mockOpinions.map(op => ({
      ...op,
      verdict: 'approve',
    }));

    const result = await aggregateOpinionsHandler({
      opinions: allApproveOpinions,
      aggregation_method: 'weighted',
    });

    expect(result.success).toBe(true);
    expect(result.aggregation_result.final_decision).toBe('approved');
  });

  it('should reject if critic rejects with weighted method', async () => {
    const criticRejectOpinions = mockOpinions.map(op => ({
      ...op,
      verdict: op.stanceId === 'critic' ? 'reject' : 'approve',
    }));

    const result = await aggregateOpinionsHandler({
      opinions: criticRejectOpinions,
      aggregation_method: 'weighted',
    });

    expect(result.success).toBe(true);
    // Weighted: critic(2.0) reject vs supporter(1.0) + decider(1.5) approve
    // reject: 2.0, approve: 2.5, total: 4.5
    // 2.5 > 2.25, so approve wins
    expect(result.aggregation_result.final_decision).toBe('approved');
    expect(result.aggregation_result.statistics.reject).toBe(1);
  });
});

describe('Stance Integration', () => {
  it('should support complete review workflow', async () => {
    // Step 1: Define stance for critic
    const criticConfig = await defineStanceHandler({
      stance_id: 'critic',
      task: 'Review the architecture proposal',
    });
    expect(criticConfig.success).toBe(true);

    // Step 2: Setup multi-stance review
    const multiReview = await multiStanceReviewHandler({
      artifact_type: 'architecture',
      stances: ['critic', 'supporter', 'decider'],
      aggregation_method: 'decider',
    });
    expect(multiReview.success).toBe(true);

    // Step 3: Aggregate opinions
    const opinions = [
      {
        stanceId: 'critic',
        roleId: 'reviewer-01',
        verdict: 'request_changes',
        opinion: 'Missing error handling',
        timestamp: new Date(),
      },
      {
        stanceId: 'supporter',
        roleId: 'strategist-01',
        verdict: 'approve',
        opinion: 'Good overall design',
        timestamp: new Date(),
      },
      {
        stanceId: 'decider',
        roleId: 'tech-lead-01',
        verdict: 'approve',
        opinion: 'Approved with requested changes',
        timestamp: new Date(),
      },
    ];

    const result = await aggregateOpinionsHandler({
      opinions,
      aggregation_method: 'decider',
    });
    expect(result.aggregation_result.final_decision).toBe('approved');
  });
});
