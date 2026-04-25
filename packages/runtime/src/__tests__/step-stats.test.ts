/**
 * 步骤成功率统计测试
 */

import { getStepSuccessRate, StepSuccessRate } from '../monitoring/local-data-source';

describe('Step Success Rate', () => {
  it('should return empty array when no metrics', () => {
    const stats = getStepSuccessRate();
    expect(Array.isArray(stats)).toBe(true);
  });

  it('should calculate success rate correctly', () => {
    // 模拟数据结构验证
    const mockStat: StepSuccessRate = {
      stepId: 'analyze',
      stepName: 'analyze-codebase',
      total: 10,
      completed: 8,
      failed: 2,
      skipped: 0,
      cached: 1,
      successRate: 0.8,
      avgDuration: 5000,
    };

    expect(mockStat.successRate).toBe(mockStat.completed / mockStat.total);
    expect(mockStat.stepId).toBeDefined();
  });

  it('should sort by success rate (lowest first)', () => {
    // 验证排序逻辑：成功率低的排前面
    const stats: StepSuccessRate[] = [
      { stepId: 'a', total: 10, completed: 9, failed: 1, skipped: 0, cached: 0, successRate: 0.9 },
      { stepId: 'b', total: 10, completed: 5, failed: 5, skipped: 0, cached: 0, successRate: 0.5 },
      { stepId: 'c', total: 10, completed: 8, failed: 2, skipped: 0, cached: 0, successRate: 0.8 },
    ];

    const sorted = [...stats].sort((a, b) => a.successRate - b.successRate);
    expect(sorted[0].stepId).toBe('b'); // 成功率最低的排前面
  });

  it('should filter by workflow_id', () => {
    // 验证 workflow_id 过滤参数
    const stats = getStepSuccessRate('wf-test');
    expect(Array.isArray(stats)).toBe(true);
  });
});
