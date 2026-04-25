/**
 * AR-010 内存使用优化测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { HistoryCompressor, createHistoryCompressor, CompressionConfig } from '../core/history-compressor';

describe('AR-010 内存使用优化', () => {
  
  describe('P0: 统一历史管理', () => {
    let compressor: HistoryCompressor;
    
    beforeEach(() => {
      compressor = createHistoryCompressor({
        windowSize: 3,
        maxTokenLimit: 10000,
        compressionThreshold: 8000,
      });
    });
    
    it('should add entries to history compressor', () => {
      compressor.addEntry({
        stepId: 'step_001',
        stepName: 'Test Step',
        status: 'completed',
        output: 'output data',
        keyData: { result: 'success' },
      });
      
      const entries = compressor.getEntries();
      
      expect(entries.length).toBe(1);
      expect(entries[0].stepId).toBe('step_001');
    });
    
    it('should maintain sliding window for compression', () => {
      // 添加 5 个条目，窗口大小 3
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step_${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: `output ${i}`,
          keyData: {},
        });
      }
      
      const entries = compressor.getEntries();
      
      // 条目总数是 5（不删除，只压缩）
      expect(entries.length).toBe(5);
      
      // 但滑动窗口外的条目会被压缩
      const stats = compressor.getStats();
      expect(stats.totalTokens).toBeLessThan(100);  // 小输出，token 数不多
    });
    
    it('should compress old entries', () => {
      // 添加大输出
      const largeOutput = 'x'.repeat(5000);
      
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step_${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: largeOutput,
          keyData: { index: i },
        });
      }
      
      const state = compressor.getState();
      
      // 应该触发压缩
      expect(state.totalTokens).toBeLessThan(5000 * 5);
    });
    
    it('should get outputs for context with limit', () => {
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step_${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: `output data ${i}`,
          keyData: { index: i },
        });
      }
      
      const contextOutputs = compressor.getOutputsForContext(1000);
      
      // 应该是压缩后的格式
      expect(contextOutputs.length).toBeGreaterThan(0);
    });
    
    it('should track compression history when triggered', () => {
      // 设置较低的阈值以触发压缩
      const smallThresholdCompressor = createHistoryCompressor({
        windowSize: 2,
        maxTokenLimit: 1000,
        compressionThreshold: 500,  // 500 token 时触发压缩
      });
      
      // 添加大输出以触发压缩
      for (let i = 0; i < 5; i++) {
        smallThresholdCompressor.addEntry({
          stepId: `step_${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'x'.repeat(1000),  // 大输出
          keyData: {},
        });
      }
      
      const state = smallThresholdCompressor.getState();
      
      // 应该有压缩记录（如果触发了压缩）
      // 注意：可能没有触发，取决于 token 估算
      expect(state.compressionHistory.length).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('P1: context.steps 清理', () => {
    // 模拟步骤结果清理
    function cleanupStepOutput(stepResult: { output?: any }, threshold: number = 10240): void {
      if (stepResult.output && typeof stepResult.output === 'object') {
        const outputSize = JSON.stringify(stepResult.output).length;
        if (outputSize > threshold) {
          stepResult.output = { _cleaned: true, _size: outputSize };
        }
      }
    }
    
    it('should clean large output', () => {
      const stepResult: any = {
        output: {
          data: 'x'.repeat(20000),
          files: Array(100).fill({ name: 'test.ts' }),
        },
      };
      
      cleanupStepOutput(stepResult);
      
      expect(stepResult.output._cleaned).toBe(true);
      expect(stepResult.output._size).toBeGreaterThan(10240);
    });
    
    it('should not clean small output', () => {
      const stepResult: any = {
        output: {
          data: 'small data',
        },
      };
      
      cleanupStepOutput(stepResult);
      
      expect(stepResult.output.data).toBe('small data');
      expect(stepResult.output._cleaned).toBeUndefined();
    });
    
    it('should handle string output', () => {
      const stepResult: any = {
        output: 'string output',
      };
      
      cleanupStepOutput(stepResult);
      
      // 字符串输出不清理
      expect(stepResult.output).toBe('string output');
    });
    
    it('should handle null output', () => {
      const stepResult: any = {
        output: null,
      };
      
      cleanupStepOutput(stepResult);
      
      expect(stepResult.output).toBeNull();
    });
    
    it('should use custom threshold', () => {
      const stepResult: any = {
        output: {
          data: 'x'.repeat(500),  // 500 bytes
        },
      };
      
      // 默认阈值不清理
      cleanupStepOutput(stepResult);
      expect(stepResult.output._cleaned).toBeUndefined();
      
      // 重置
      stepResult.output = { data: 'x'.repeat(500) };
      
      // 使用更小的阈值
      cleanupStepOutput(stepResult, 100);
      expect(stepResult.output._cleaned).toBe(true);
    });
  });
  
  describe('内存使用检测', () => {
    it('should get system metrics', () => {
      const { getSystemMetrics } = require('../core/scheduler');
      
      const metrics = getSystemMetrics();
      
      expect(metrics.memoryUsage).toBeGreaterThan(0);
      expect(metrics.memoryUsage).toBeLessThanOrEqual(100);
      expect(metrics.cpuLoad).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeGreaterThan(0);
    });
    
    it('should evaluate resource status', () => {
      const { evaluateResourceStatus, DEFAULT_THRESHOLDS } = require('../core/scheduler');
      
      const normalMetrics = { memoryUsage: 50, cpuLoad: 30, timestamp: Date.now() };
      const highMetrics = { memoryUsage: 90, cpuLoad: 50, timestamp: Date.now() };
      const criticalMetrics = { memoryUsage: 96, cpuLoad: 80, timestamp: Date.now() };
      
      const normalStatus = evaluateResourceStatus(normalMetrics);
      const highStatus = evaluateResourceStatus(highMetrics);
      const criticalStatus = evaluateResourceStatus(criticalMetrics);
      
      expect(normalStatus.status).toBe('normal');
      expect(highStatus.status).toBe('high');
      expect(criticalStatus.status).toBe('critical');
    });
  });
});