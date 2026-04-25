/**
 * 责任链模型测试
 */

import {
  Stage,
  Role,
  ConstraintLevel,
  ChangeType,
  RESPONSIBILITY_CHAIN,
  CHANGE_TYPE_EXPERTS,
  CONSTRAINT_DEPTH,
  STAGE_TOOLS,
  decideParticipants,
  deriveRoleConfig,
  getRoleDepthInStage,
  isToolAllowedForStage,
} from '../responsibility-chain';

describe('responsibility-chain', () => {
  describe('RESPONSIBILITY_CHAIN', () => {
    it('should have all stages defined', () => {
      const stages: Stage[] = ['plan', 'develop', 'verify', 'deploy', 'fix', 'govern'];
      for (const stage of stages) {
        expect(RESPONSIBILITY_CHAIN[stage]).toBeDefined();
        expect(RESPONSIBILITY_CHAIN[stage].length).toBeGreaterThan(0);
      }
    });

    it('should have valid roles in chains', () => {
      const validRoles: Role[] = ['architect', 'tech-lead', 'developer', 'qa', 'pm', 'ceo'];
      for (const chain of Object.values(RESPONSIBILITY_CHAIN)) {
        for (const role of chain) {
          expect(validRoles).toContain(role);
        }
      }
    });
  });

  describe('CHANGE_TYPE_EXPERTS', () => {
    it('should have high-risk change types include architect', () => {
      expect(CHANGE_TYPE_EXPERTS['database']).toContain('architect');
      expect(CHANGE_TYPE_EXPERTS['api_contract']).toContain('architect');
      expect(CHANGE_TYPE_EXPERTS['security']).toContain('architect');
    });

    it('should have low-risk change types have empty array', () => {
      expect(CHANGE_TYPE_EXPERTS['config']).toEqual([]);
      expect(CHANGE_TYPE_EXPERTS['ui']).toEqual([]);
      expect(CHANGE_TYPE_EXPERTS['documentation']).toEqual([]);
    });
  });

  describe('decideParticipants', () => {
    it('should return empty for L1 (auto approved)', () => {
      const result = decideParticipants('develop', 'L1', ['feature']);
      expect(result).toEqual([]);
    });

    it('should return first role for L2', () => {
      const result = decideParticipants('develop', 'L2', ['feature']);
      expect(result).toEqual(['tech-lead']);
    });

    it('should return first two roles for L3', () => {
      const result = decideParticipants('develop', 'L3', ['feature']);
      expect(result).toEqual(['tech-lead', 'developer']);
    });

    it('should return full chain for L4', () => {
      const result = decideParticipants('plan', 'L4', []);
      expect(result).toEqual(['architect', 'pm', 'tech-lead']);
    });

    it('should include expert for api_contract', () => {
      const result = decideParticipants('develop', 'L2', ['api_contract']);
      expect(result).toContain('tech-lead');
      expect(result).toContain('architect');
    });

    it('should deduplicate roles', () => {
      const result = decideParticipants('plan', 'L4', ['breaking_change']);
      // plan chain: architect, pm, tech-lead
      // breaking_change experts: architect, pm
      // deduped: architect, pm, tech-lead
      expect(result).toEqual(['architect', 'pm', 'tech-lead']);
    });
  });

  describe('deriveRoleConfig', () => {
    it('should derive architect config', () => {
      const config = deriveRoleConfig('architect');
      expect(config.stages).toContain('plan');
      expect(config.stages).toContain('govern');
      expect(config.name).toBe('架构师');
    });

    it('should derive tech-lead config with most stages', () => {
      const config = deriveRoleConfig('tech-lead');
      // tech-lead participates in all stages except govern has ceo
      expect(config.stages.length).toBeGreaterThan(4);
      expect(config.workflows.length).toBeGreaterThan(0);
    });

    it('should derive developer config', () => {
      const config = deriveRoleConfig('developer');
      expect(config.stages).toContain('develop');
      expect(config.stages).toContain('fix');
      expect(config.name).toBe('开发工程师');
    });

    it('should derive qa config', () => {
      const config = deriveRoleConfig('qa');
      expect(config.stages).toContain('verify');
      expect(config.name).toBe('测试工程师');
    });

    it('should derive pm config', () => {
      const config = deriveRoleConfig('pm');
      expect(config.stages).toContain('plan');
      expect(config.stages).toContain('deploy');
      expect(config.stages).toContain('govern');
    });

    it('should derive ceo config', () => {
      const config = deriveRoleConfig('ceo');
      expect(config.stages).toContain('govern');
      expect(config.name).toBe('决策者');
    });
  });

  describe('getRoleDepthInStage', () => {
    it('should return 0 for primary role', () => {
      expect(getRoleDepthInStage('architect', 'plan')).toBe(0);
      expect(getRoleDepthInStage('tech-lead', 'develop')).toBe(0);
    });

    it('should return positive for secondary role', () => {
      expect(getRoleDepthInStage('pm', 'plan')).toBe(1);
      expect(getRoleDepthInStage('developer', 'develop')).toBe(1);
    });

    it('should return -1 for role not in stage', () => {
      expect(getRoleDepthInStage('qa', 'develop')).toBe(-1);
      expect(getRoleDepthInStage('developer', 'plan')).toBe(-1);
    });
  });

  describe('isToolAllowedForStage', () => {
    it('should allow development tools for develop stage', () => {
      expect(isToolAllowedForStage('development/write-code', 'develop')).toBe(true);
      expect(isToolAllowedForStage('development/refactor', 'develop')).toBe(true);
    });

    it('should allow analysis tools for plan stage', () => {
      expect(isToolAllowedForStage('analysis/analyze-codebase', 'plan')).toBe(true);
      expect(isToolAllowedForStage('design/api-design', 'plan')).toBe(true);
    });

    it('should deny development tools for plan stage', () => {
      expect(isToolAllowedForStage('development/write-code', 'plan')).toBe(false);
    });

    it('should deny deploy tools for develop stage', () => {
      expect(isToolAllowedForStage('deploy/release', 'develop')).toBe(false);
    });
  });

  describe('CONSTRAINT_DEPTH', () => {
    it('should have correct depth values', () => {
      expect(CONSTRAINT_DEPTH['L1']).toBe(0);
      expect(CONSTRAINT_DEPTH['L2']).toBe(1);
      expect(CONSTRAINT_DEPTH['L3']).toBe(2);
      expect(CONSTRAINT_DEPTH['L4']).toBe(-1);
    });
  });
});