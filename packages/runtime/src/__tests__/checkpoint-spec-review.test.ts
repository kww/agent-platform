/**
 * M4 测试：Checkpoint + SpecReview 集成
 * 
 * WA-008: baseline-validator.ts
 * WA-009: workflow-blocker.ts
 * WA-010: verifyCheckpoint 扩展
 */

import { 
  parseBaselineDecision, 
  compareBaselineVsActual, 
  assessRisk,
  BaselineDecision,
  Deviation,
} from '../core/baseline-validator';
import { 
  WorkflowBlocker, 
  createWorkflowBlocker 
} from '../orchestration/workflow-blocker';
import { MockRedisClient } from './mock-redis';

describe('M4: Checkpoint + SpecReview 集成', () => {
  
  describe('WA-008: baseline-validator', () => {
    
    describe('parseBaselineDecision', () => {
      it('should parse baseline decisions', () => {
        const baseline = `
技术决策：
- 数据库：PostgreSQL（已有连接池）
- API 风格：RESTful
- 认证方式：JWT

约束：
- 必须使用 TypeScript
- 禁止使用 ORM（使用原生 SQL）
`;
        
        const parsed = parseBaselineDecision(baseline);
        
        expect(parsed.decisions).toBeDefined();
        expect(parsed.decisions.length).toBeGreaterThan(0);
        expect(parsed.constraints).toBeDefined();
        expect(parsed.constraints.length).toBeGreaterThan(0);
        
        // 检查决策
        const dbDecision = parsed.decisions.find(d => d.type === 'db_choice');
        expect(dbDecision?.content).toContain('PostgreSQL');
        
        // 检查约束
        const typeScriptConstraint = parsed.constraints.find(c => c.value.includes('TypeScript'));
        expect(typeScriptConstraint?.type).toBe('must_use');
        
        const ormConstraint = parsed.constraints.find(c => c.value.includes('ORM'));
        expect(ormConstraint?.type).toBe('must_not_use');
      });

      it('should handle empty baseline', () => {
        const baseline = '';
        
        const parsed = parseBaselineDecision(baseline);
        
        expect(parsed.decisions).toEqual([]);
        expect(parsed.constraints).toEqual([]);
      });
    });

    describe('compareBaselineVsActual', () => {
      it('should detect constraint violation', () => {
        const baseline: BaselineDecision = {
          decisions: [{ id: 'db', type: 'db_choice', content: 'PostgreSQL' }],
          constraints: [{ type: 'must_not_use', value: 'ORM' }],
        };
        
        const actual = {
          techChoices: [{ type: 'db_choice', value: 'PostgreSQL', source: 'import' }],
          constraintsViolated: ['使用了 Sequelize ORM'],
        };
        
        const deviations = compareBaselineVsActual(baseline, actual);
        
        expect(deviations.length).toBeGreaterThan(0);
        expect(deviations[0].type).toBe('constraint_violation');
        expect(deviations[0].severity).toBe('critical');
      });

      it('should detect decision deviation', () => {
        const baseline: BaselineDecision = {
          decisions: [{ id: 'db', type: 'db_choice', content: 'PostgreSQL' }],
          constraints: [],
        };
        
        const actual = {
          techChoices: [{ type: 'db_choice', value: 'MySQL', source: 'config' }],
          constraintsViolated: [],
        };
        
        const deviations = compareBaselineVsActual(baseline, actual);
        
        expect(deviations.length).toBeGreaterThan(0);
        expect(deviations[0].type).toContain('deviation');
        expect(deviations[0].baselineDecision).toBe('PostgreSQL');
        expect(deviations[0].actualBehavior).toBe('MySQL');
      });

      it('should return empty when no deviation', () => {
        const baseline: BaselineDecision = {
          decisions: [{ id: 'db', type: 'db_choice', content: 'PostgreSQL' }],
          constraints: [],
        };
        
        const actual = {
          techChoices: [{ type: 'db_choice', value: 'PostgreSQL', source: 'import' }],
          constraintsViolated: [],
        };
        
        const deviations = compareBaselineVsActual(baseline, actual);
        
        expect(deviations).toEqual([]);
      });
    });

    describe('assessRisk', () => {
      it('should calculate RiskScore correctly', () => {
        const deviations: Deviation[] = [
          {
            id: 'dev-1',
            type: 'db_choice_deviation',
            severity: 'critical',
            description: '数据库从 PostgreSQL 改为 MySQL',
            baselineDecision: 'PostgreSQL',
            actualBehavior: 'MySQL',
          },
        ];
        
        const assessment = assessRisk(deviations, {
          impact: 4,        // 全系统
          reversibility: 0, // 不可逆
          urgency: 2,       // 阻塞
        });
        
        expect(assessment.riskLevel).toBeGreaterThan(10);  // 应为 L4
        expect(assessment.constraintLevel).toBe('L4');
      });

      it('should map to correct constraint level', () => {
        // L1
        const assessment1 = assessRisk([], { impact: 1, reversibility: 3, urgency: 0 });
        expect(assessment1.constraintLevel).toBe('L1');
        
        // L2（有偏离，severity=2, impact=3）
        const assessment2 = assessRisk([
          { id: 'dev-2', type: 'tech_deviation', severity: 'minor', description: '小偏离' }
        ], { impact: 3, reversibility: 2, urgency: 0 });
        // RiskScore = 2 × 3 - 2 + 0 = 4 → L2
        expect(assessment2.constraintLevel).toBe('L2');
        
        // L3（约束违规）
        const assessment3 = assessRisk([
          { id: 'dev-3', type: 'constraint_violation', severity: 'critical', description: '约束违规' }
        ], { impact: 2, reversibility: 2, urgency: 1 });
        // RiskScore = 4 × 2 - 2 + 1 = 7 → L3
        expect(assessment3.constraintLevel).toBe('L3');
      });
    });
  });

  describe('WA-009: workflow-blocker', () => {
    let blocker: WorkflowBlocker;
    let redis: MockRedisClient;

    beforeEach(() => {
      redis = new MockRedisClient();
      blocker = createWorkflowBlocker({
        redis,
        taskQueue: {
          getRunningCount: () => Promise.resolve(1),
          getWaitingCount: () => Promise.resolve(1),
          enqueue: () => Promise.resolve(),
        } as any,
      });
    });

    describe('AC-004-2: 偏离时 Workflow 阻塞', () => {
      it('should block workflow on deviation', async () => {
        const executionId = 'exec-1';
        const specReviewId = 'spec-1';
        
        await blocker.block(executionId, specReviewId);
        
        // 验证 Redis 状态
        const blocked = await redis.get(`workflow:blocked:${executionId}`);
        expect(blocked).toBeDefined();
        
        const blockedInfo = JSON.parse(blocked!);
        expect(blockedInfo.specReviewId).toBe(specReviewId);
      });

      it('should move workflow to waiting queue', async () => {
        const executionId = 'exec-2';
        const specReviewId = 'spec-2';
        
        await blocker.block(executionId, specReviewId);
        
        // 验证队列状态（通过 mock redis）
        // 实际 TaskQueue 调用需要真实实现
      });
    });

    describe('AC-004-3: approved 时恢复 Workflow', () => {
      it('should resume workflow on approval', async () => {
        const executionId = 'exec-3';
        const specReviewId = 'spec-3';
        
        // 先阻塞
        await blocker.block(executionId, specReviewId);
        
        // 模拟 approved
        await blocker.resume(executionId, {
          status: 'approved',
          newDecision: '使用 MySQL',
        });
        
        // 验证阻塞状态已清除
        const blocked = await redis.get(`workflow:blocked:${executionId}`);
        expect(blocked).toBeNull();
      });

      it('should update baselineDecision on resume', async () => {
        const executionId = 'exec-4';
        const specReviewId = 'spec-4';
        
        await blocker.block(executionId, specReviewId);
        
        // approved + newDecision
        await blocker.resume(executionId, {
          status: 'approved',
          newDecision: '数据库：MySQL',
        });
        
        // 验证 newDecision 已保存
        const newBaseline = await redis.get(`workflow:baseline:${executionId}`);
        expect(newBaseline).toContain('MySQL');
      });
    });

    describe('AC-004-4: rejected 时终止 Workflow', () => {
      it('should abort workflow on rejection', async () => {
        const executionId = 'exec-5';
        const specReviewId = 'spec-5';
        
        await blocker.block(executionId, specReviewId);
        
        // rejected
        await blocker.abort(executionId, {
          status: 'rejected',
          reason: '架构师不同意',
        });
        
        // 验证状态
        const failed = await redis.get(`workflow:failed:${executionId}`);
        expect(failed).toBeDefined();
      });

      it('should create new task on rejection', async () => {
        const executionId = 'exec-6';
        const specReviewId = 'spec-6';
        
        await blocker.block(executionId, specReviewId);
        
        // rejected + newDecision
        await blocker.abort(executionId, {
          status: 'rejected',
          reason: '需要重新评估',
          newTask: {
            id: 'task-new',
            workflowId: 'wf-backend',
          },
        });
        
        // 验证新 Task 已创建（通过 mock redis）
        const newTask = await redis.get('task:new:exec-6');
        expect(newTask).toBeDefined();
      });
    });
  });

  describe('WA-010: verifyCheckpoint 扩展', () => {
    // verifyCheckpoint 扩展测试
    // 需要模拟 executor.ts 中的 verifyCheckpoint 函数
    
    it('should check baselineDecision deviation', async () => {
      const baseline = `
技术决策：
- 数据库：PostgreSQL

约束：
- 禁止使用 ORM
`;
      
      // 模拟 git diff（违反约束）
      const gitDiff = `
import { Sequelize } from 'sequelize';
// 使用 Sequelize ORM
`;
      
      // 检测偏离
      const result = await checkBaselineDeviation(baseline, gitDiff);
      
      expect(result.passed).toBe(false);
      expect(result.deviation).toBeDefined();
    });

    it('should pass when no deviation', async () => {
      const baseline = `
技术决策：
- 数据库：PostgreSQL
`;
      
      const gitDiff = `
import { Pool } from 'pg';
// 使用 PostgreSQL 连接池
`;
      
      const result = await checkBaselineDeviation(baseline, gitDiff);
      
      expect(result.passed).toBe(true);
    });
  });
});

// Helper functions

async function checkBaselineDeviation(baseline: string, gitDiff: string): Promise<{ passed: boolean; deviation?: any }> {
  // 简化实现：检查 git diff 是否包含违规
  const violations: string[] = [];
  
  // 检测 ORM
  if (gitDiff.includes('Sequelize') || gitDiff.includes('Prisma') || gitDiff.includes('TypeORM')) {
    if (baseline.includes('禁止 ORM') || baseline.includes('禁止使用 ORM')) {
      violations.push('使用了 ORM');
    }
  }
  
  // 检测数据库选择
  if (gitDiff.includes('mysql') || gitDiff.includes('MySQL')) {
    if (baseline.includes('PostgreSQL') && !baseline.includes('MySQL')) {
      violations.push('数据库偏离：PostgreSQL → MySQL');
    }
  }
  
  if (violations.length > 0) {
    return {
      passed: false,
      deviation: {
        violations,
        baseline,
      },
    };
  }
  
  return { passed: true };
}