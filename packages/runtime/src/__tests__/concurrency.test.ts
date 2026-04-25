/**
 * 并发控制测试
 */

import { getMaxConcurrent } from '../core/executor';
import { config } from '../utils/config';

// Mock config for testing
jest.mock('../utils/config', () => ({
  config: {
    maxConcurrent: 5,
  },
}));

describe('getMaxConcurrent', () => {
  beforeEach(() => {
    // Reset config mock
    (config as any).maxConcurrent = 5;
  });

  describe('优先级链', () => {
    it('步骤 max_parallel 最高优先级', () => {
      const result = getMaxConcurrent(3, { max_parallel_tasks: 10 });
      expect(result).toBe(3);
    });

    it('工作流 concurrency.max_parallel_tasks 第二优先级', () => {
      const result = getMaxConcurrent(undefined, { max_parallel_tasks: 10 });
      expect(result).toBe(10);
    });

    it('全局 config.maxConcurrent 第三优先级', () => {
      (config as any).maxConcurrent = 8;
      const result = getMaxConcurrent(undefined, undefined);
      expect(result).toBe(8);
    });

    it('默认值 5 最后优先级', () => {
      (config as any).maxConcurrent = 0;  // 无效值
      const result = getMaxConcurrent(undefined, undefined);
      expect(result).toBe(5);
    });
  });

  describe('边界情况', () => {
    it('步骤 max_parallel = 0 时忽略', () => {
      const result = getMaxConcurrent(0, { max_parallel_tasks: 10 });
      expect(result).toBe(10);
    });

    it('工作流 max_parallel_tasks = 0 时忽略', () => {
      (config as any).maxConcurrent = 8;
      const result = getMaxConcurrent(undefined, { max_parallel_tasks: 0 });
      expect(result).toBe(8);
    });

    it('所有配置无效时使用默认值', () => {
      (config as any).maxConcurrent = 0;
      const result = getMaxConcurrent(0, { max_parallel_tasks: 0 });
      expect(result).toBe(5);
    });
  });

  describe('配置链完整性', () => {
    it('完整优先级链: 步骤 > 工作流 > 全局 > 默认', () => {
      // 步骤优先
      expect(getMaxConcurrent(1, { max_parallel_tasks: 2 })).toBe(1);
      
      // 工作流优先（无步骤配置）
      (config as any).maxConcurrent = 3;
      expect(getMaxConcurrent(undefined, { max_parallel_tasks: 2 })).toBe(2);
      
      // 全局优先（无步骤和工作流配置）
      (config as any).maxConcurrent = 3;
      expect(getMaxConcurrent(undefined, undefined)).toBe(3);
      
      // 默认值（所有配置无效）
      (config as any).maxConcurrent = 0;
      expect(getMaxConcurrent(undefined, undefined)).toBe(5);
    });
  });
});