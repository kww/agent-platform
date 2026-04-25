/**
 * 质量评分系统测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  calculateQualityScore,
  calculateAllScores,
  listScores,
} from '../monitoring/quality-scorer';

const SCORES_DIR = path.join(__dirname, '../../quality-scores');

describe('Quality Scorer', () => {
  beforeAll(() => {
    // 确保目录存在
    if (!fs.existsSync(SCORES_DIR)) {
      fs.mkdirSync(SCORES_DIR, { recursive: true });
    }
  });

  describe('calculateQualityScore', () => {
    it('should calculate quality score for a workflow', async () => {
      const workflowId = 'test-quality-workflow';
      
      const score = await calculateQualityScore(workflowId);
      
      expect(score.workflowId).toBe(workflowId);
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D']).toContain(score.grade);
      
      // 检查维度
      expect(score.dimensions.successRate).toBeDefined();
      expect(score.dimensions.efficiency).toBeDefined();
      expect(score.dimensions.tokenEfficiency).toBeDefined();
      expect(score.dimensions.outputQuality).toBeDefined();
    });

    it('should have correct weights', async () => {
      const workflowId = 'test-quality-workflow';
      const score = await calculateQualityScore(workflowId);
      
      const totalWeight = 
        score.dimensions.successRate.weight +
        score.dimensions.efficiency.weight +
        score.dimensions.tokenEfficiency.weight +
        score.dimensions.outputQuality.weight;
      
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });

    it('should save score history', async () => {
      const workflowId = 'test-quality-workflow';
      await calculateQualityScore(workflowId);
      
      const historyPath = path.join(SCORES_DIR, workflowId, 'history.json');
      expect(fs.existsSync(historyPath)).toBe(true);
    });
  });

  describe('calculateAllScores', () => {
    it('should calculate scores for all workflows', async () => {
      const scores = await calculateAllScores();
      
      expect(Array.isArray(scores)).toBe(true);
      // 可能没有工作流数据
    });
  });

  describe('listScores', () => {
    it('should list all saved scores', () => {
      const scores = listScores();
      
      expect(Array.isArray(scores)).toBe(true);
    });
  });

  describe('grade calculation', () => {
    it('should assign A for scores >= 90', async () => {
      // 创建高成功率的工作流数据
      // 由于依赖 Prometheus，这里只测试逻辑
      const workflowId = 'test-grade-a';
      const score = await calculateQualityScore(workflowId);
      
      if (score.score >= 90) {
        expect(score.grade).toBe('A');
      } else if (score.score >= 80) {
        expect(score.grade).toBe('B');
      } else if (score.score >= 70) {
        expect(score.grade).toBe('C');
      } else {
        expect(score.grade).toBe('D');
      }
    });
  });
});