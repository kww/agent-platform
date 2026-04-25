/**
 * Stage Definitions 测试
 */

import { Stage } from '../responsibility-chain';
import {
  STAGE_DEFINITIONS,
  STAGE_KEYWORDS,
  STAGE_KEY_QUESTIONS,
  suggestStage,
  validateStageField,
} from '../stage-definitions';

describe('stage-definitions', () => {
  describe('STAGE_DEFINITIONS', () => {
    it('should have all 6 stages defined', () => {
      const stages: Stage[] = ['plan', 'develop', 'verify', 'deploy', 'fix', 'govern'];
      for (const stage of stages) {
        expect(STAGE_DEFINITIONS[stage]).toBeDefined();
        expect(STAGE_DEFINITIONS[stage].definition).toBeTruthy();
      }
    });

    it('should have keywords for each stage', () => {
      for (const stage of Object.keys(STAGE_KEYWORDS) as Stage[]) {
        expect(STAGE_KEYWORDS[stage].length).toBeGreaterThan(0);
      }
    });

    it('should have key questions for each stage', () => {
      for (const stage of Object.keys(STAGE_KEY_QUESTIONS) as Stage[]) {
        expect(STAGE_KEY_QUESTIONS[stage].length).toBeGreaterThan(0);
      }
    });
  });

  describe('suggestStage', () => {
    it('should suggest plan for planning keywords', () => {
      const result = suggestStage('需求分析', '分析用户需求并设计方案');
      expect(result).toContain('plan');
    });

    it('should suggest develop for development keywords', () => {
      const result = suggestStage('实现功能', '开发用户登录功能');
      expect(result).toContain('develop');
    });

    it('should suggest verify for test keywords', () => {
      const result = suggestStage('测试验证', '运行单元测试确保质量');
      expect(result).toContain('verify');
    });

    it('should suggest deploy for deploy keywords', () => {
      const result = suggestStage('发布上线', '部署到生产环境');
      expect(result).toContain('deploy');
    });

    it('should suggest fix for bug keywords', () => {
      const result = suggestStage('修复Bug', '诊断并修复登录失败问题');
      expect(result).toContain('fix');
    });

    it('should suggest govern for governance keywords', () => {
      const result = suggestStage('审计检查', '检查系统合规性');
      expect(result).toContain('govern');
    });

    it('should return multiple suggestions for ambiguous input', () => {
      const result = suggestStage('开发测试', '开发并测试功能');
      expect(result.length).toBeGreaterThan(1);
    });

    it('should return empty array for no match', () => {
      const result = suggestStage('xyz123', 'unknown task');
      expect(result).toEqual([]);
    });

    it('should prioritize name over description', () => {
      const result = suggestStage('架构设计', '写代码');
      expect(result[0]).toBe('plan'); // name match overrides description
    });
  });

  describe('validateStageField', () => {
    it('should pass for valid stage', () => {
      const result = validateStageField('develop');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail for invalid stage', () => {
      const result = validateStageField('invalid-stage');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('stage "invalid-stage" 不是有效阶段');
    });

    it('should provide suggestions for missing stage', () => {
      const result = validateStageField(undefined, '开发功能', '实现用户登录');
      expect(result.valid).toBe(false);
      expect(result.suggestions).toContain('develop');
    });
  });
});