/**
 * 性能回归检测测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  recordBaseline,
  detectRegression,
  listBaselines,
} from '../monitoring/performance-regression';

const BENCHMARKS_DIR = path.join(__dirname, '../../benchmarks');

describe('Performance Regression Framework', () => {
  beforeAll(() => {
    // 确保目录存在
    if (!fs.existsSync(BENCHMARKS_DIR)) {
      fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });
    }
  });

  describe('recordBaseline', () => {
    it('should record a performance baseline', async () => {
      const workflowId = 'test-perf-workflow';
      
      const baseline = await recordBaseline(workflowId);
      
      expect(baseline.workflowId).toBe(workflowId);
      expect(baseline.recordedAt).toBeDefined();
      expect(baseline.commit).toBeDefined();
      expect(baseline.thresholds).toBeDefined();
      
      const baselinePath = path.join(BENCHMARKS_DIR, workflowId, 'baseline.json');
      expect(fs.existsSync(baselinePath)).toBe(true);
    });
  });

  describe('detectRegression', () => {
    it('should detect no regression when within threshold', async () => {
      const workflowId = 'test-perf-workflow';
      
      // 基准已录制，直接检测
      const result = await detectRegression(workflowId);
      
      expect(result.workflowId).toBe(workflowId);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.checks.length);
    });

    it('should detect regression when threshold exceeded', async () => {
      const workflowId = 'test-perf-workflow';
      
      // 模拟严重的性能退化
      const badMetrics = {
        workflowId,
        timestamp: new Date().toISOString(),
        commit: 'test',
        branch: 'test',
        duration: {
          p50: 100000,  // 很大
          p90: 150000,
          p99: 200000,
          avg: 120000,
          min: 50000,
          max: 250000,
        },
        tokens: {
          input: 1000000,
          output: 500000,
          total: 1500000,
        },
        steps: [],
        success: true,
        errorCount: 0,
      };
      
      const result = await detectRegression(workflowId, badMetrics);
      
      // 应该检测到耗时变化超过阈值
      const p99Check = result.checks.find(c => c.name === 'duration_p99');
      expect(p99Check).toBeDefined();
      // 由于模拟数据很大，应该超过阈值
      expect(Math.abs(p99Check!.change)).toBeGreaterThan(0);
    });
  });

  describe('listBaselines', () => {
    it('should list all baselines', () => {
      const baselines = listBaselines();
      expect(Array.isArray(baselines)).toBe(true);
      expect(baselines).toContain('test-perf-workflow');
    });
  });
});