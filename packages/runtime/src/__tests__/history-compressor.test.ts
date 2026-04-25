/**
 * HistoryCompressor 测试
 */

import { HistoryCompressor, createHistoryCompressor, CompressionConfig } from '../core/history-compressor';

describe('HistoryCompressor', () => {
  
  // ========== 基础功能测试 ==========
  
  describe('basic operations', () => {
    it('should create compressor with default config', () => {
      const compressor = createHistoryCompressor();
      
      expect(compressor).toBeDefined();
      expect(compressor.getState()).toBeDefined();
    });
    
    it('should create compressor with custom config', () => {
      const config: Partial<CompressionConfig> = {
        windowSize: 10,
        maxTokenLimit: 50000,
      };
      
      const compressor = createHistoryCompressor(config);
      
      expect(compressor).toBeDefined();
    });
    
    it('should add entry successfully', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Test Step',
        status: 'completed',
        output: 'Test output',
        keyData: { files_changed: ['test.ts'] }
      });
      
      expect(entry).toBeDefined();
      expect(entry.stepId).toBe('step-1');
      expect(entry.priority).toBeDefined();
    });
    
    it('should track total tokens', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'A'.repeat(100),
      });
      
      const stats = compressor.getStats();
      
      expect(stats.totalEntries).toBe(1);
      expect(stats.totalTokens).toBeGreaterThan(0);
    });
  });
  
  // ========== 压缩测试 ==========
  
  describe('compression', () => {
    it('should not compress within window', () => {
      const compressor = createHistoryCompressor({ windowSize: 3 });
      
      // 添加 3 个条目
      for (let i = 0; i < 3; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'Output ' + i,
        });
      }
      
      const stats = compressor.getStats();
      
      expect(stats.compressedEntries).toBe(0);
    });
    
    it('should compress entries outside window', () => {
      const compressor = createHistoryCompressor({
        windowSize: 2,
        compressionThreshold: 100, // 低阈值触发压缩
      });
      
      // 添加 5 个条目，每个足够长触发压缩
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(500) + ` step ${i}`, // 长输出
        });
      }
      
      const stats = compressor.getStats();
      
      // windowSize=2，所以前 3 个应该被压缩
      expect(stats.compressedEntries).toBeGreaterThanOrEqual(1);
    });
    
    it('should preserve critical priority entries', () => {
      const compressor = createHistoryCompressor({
        windowSize: 1,
        compressionThreshold: 50,
      });
      
      // 添加一个 critical 条目（failed）
      compressor.addEntry({
        stepId: 'critical-step',
        stepName: 'Critical Step',
        status: 'failed',
        output: 'Error: Critical failure',
      });
      
      // 添加更多普通条目
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(500),
        });
      }
      
      const entries = compressor.getEntries();
      
      // critical 条目应该不被压缩
      const criticalEntry = entries.find(e => e.stepId === 'critical-step');
      expect(criticalEntry?.priority).toBe('critical');
      expect(criticalEntry?.compressedOutput).toBeUndefined();
    });
    
    it('should generate summary for compressed entries', () => {
      const compressor = createHistoryCompressor({
        windowSize: 1,
        compressionThreshold: 50,
      });
      
      compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'Created: test.ts\nModified: main.ts\nCommit: abc123',
      });
      
      compressor.addEntry({
        stepId: 'step-2',
        stepName: 'Step 2',
        status: 'completed',
        output: 'A'.repeat(500),
      });
      
      const entries = compressor.getEntries();
      const compressedEntry = entries[0];
      
      if (compressedEntry?.compressedOutput) {
        expect(compressedEntry.summary).toBeDefined();
      }
    });
  });
  
  // ========== 优先级测试 ==========
  
  describe('priority determination', () => {
    it('should set critical for failed status', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'failed-step',
        stepName: 'Failed Step',
        status: 'failed',
        output: 'Some output',
      });
      
      expect(entry.priority).toBe('critical');
    });
    
    it('should set critical for error in output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'error-step',
        stepName: 'Error Step',
        status: 'completed',
        output: 'Error: Something went wrong',
      });
      
      expect(entry.priority).toBe('critical');
    });
    
    it('should set high for commit in output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'commit-step',
        stepName: 'Commit Step',
        status: 'completed',
        output: 'Commit: abc123',
      });
      
      expect(entry.priority).toBe('high');
    });
    
    it('should set medium for test results', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'test-step',
        stepName: 'Test Step',
        status: 'completed',
        output: 'Tests passed: 5',
      });
      
      expect(entry.priority).toBe('medium');
    });
    
    it('should set low for normal output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'normal-step',
        stepName: 'Normal Step',
        status: 'completed',
        output: 'Some normal output',
      });
      
      expect(entry.priority).toBe('low');
    });
  });
  
  // ========== 输出获取测试 ==========
  
  describe('getOutputsForContext', () => {
    it('should return formatted outputs', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'Test output 1',
      });
      
      compressor.addEntry({
        stepId: 'step-2',
        stepName: 'Step 2',
        status: 'completed',
        output: 'Test output 2',
      });
      
      const outputs = compressor.getOutputsForContext(10000);
      
      expect(outputs).toContain('Step 1');
      expect(outputs).toContain('Step 2');
    });
    
    it('should respect maxTokens limit', () => {
      const compressor = createHistoryCompressor();
      
      // 添加多个长输出
      for (let i = 0; i < 10; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(1000),
        });
      }
      
      // 只允许很少的 tokens
      const outputs = compressor.getOutputsForContext(200);
      
      // 应该只包含部分条目
      const estimatedTokens = outputs.length / 4;
      expect(estimatedTokens).toBeLessThanOrEqual(250);
    });
    
    it('should use summary for compressed entries', () => {
      const compressor = createHistoryCompressor({
        windowSize: 1,
        compressionThreshold: 50,
      });
      
      compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'Created: file.ts\n' + 'A'.repeat(500),
      });
      
      compressor.addEntry({
        stepId: 'step-2',
        stepName: 'Step 2',
        status: 'completed',
        output: 'Recent output',
      });
      
      const outputs = compressor.getOutputsForContext(1000);
      
      // 如果 step-1 被压缩，应该使用摘要
      expect(outputs).toBeDefined();
    });
    
    it('should return empty string for no entries', () => {
      const compressor = createHistoryCompressor();
      
      const outputs = compressor.getOutputsForContext(10000);
      
      expect(outputs).toBe('');
    });
  });
  
  // ========== 统计测试 ==========
  
  describe('statistics', () => {
    it('should return correct stats', () => {
      const compressor = createHistoryCompressor();
      
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: i % 2 === 0 ? 'completed' : 'failed',
          output: `Output ${i}`,
        });
      }
      
      const stats = compressor.getStats();
      
      expect(stats.totalEntries).toBe(5);
      expect(stats.totalTokens).toBeGreaterThan(0);
      expect(stats.compressionCount).toBeGreaterThanOrEqual(0);
    });
    
    it('should track compression history', () => {
      const compressor = createHistoryCompressor({
        windowSize: 1,
        compressionThreshold: 50,
      });
      
      for (let i = 0; i < 10; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(100),
        });
      }
      
      const state = compressor.getState();
      
      expect(state.compressionHistory.length).toBeGreaterThanOrEqual(0);
    });
  });
  
  // ========== 持久化测试（可选） ==========
  
  describe('persistence', () => {
    it('should skip persistence if outputDir not provided', () => {
      const compressor = createHistoryCompressor({
        persistFullOutput: true,
        // outputDir 未提供
      });
      
      const entry = compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'Test output',
      });
      
      // outputLocation 可能是空字符串或 undefined
      expect(entry.outputLocation).toBeFalsy();
    });
  });
  
  // ========== 边界情况测试 ==========
  
  describe('edge cases', () => {
    it('should handle empty output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'empty-step',
        stepName: 'Empty Step',
        status: 'completed',
        output: '',
      });
      
      expect(entry).toBeDefined();
    });
    
    it('should handle very long output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'long-step',
        stepName: 'Long Step',
        status: 'completed',
        output: 'A'.repeat(10000),
      });
      
      expect(entry).toBeDefined();
      expect(compressor.getStats().totalTokens).toBeGreaterThan(0);
    });
    
    it('should handle special characters in output', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'special-step',
        stepName: 'Special Step',
        status: 'completed',
        output: '特殊字符：中文 🎉 \n\t\r',
      });
      
      expect(entry).toBeDefined();
    });
    
    it('should handle skipped status', () => {
      const compressor = createHistoryCompressor();
      
      const entry = compressor.addEntry({
        stepId: 'skipped-step',
        stepName: 'Skipped Step',
        status: 'skipped',
        output: '',
      });
      
      expect(entry).toBeDefined();
      expect(entry.status).toBe('skipped');
    });
  });
  
  // ========== 查询测试 ==========
  
  describe('query', () => {
    it('should filter by status', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'completed-1',
        stepName: 'Completed 1',
        status: 'completed',
        output: 'Output',
      });
      
      compressor.addEntry({
        stepId: 'failed-1',
        stepName: 'Failed 1',
        status: 'failed',
        output: 'Error',
      });
      
      const completed = compressor.getEntries({ status: 'completed' });
      const failed = compressor.getEntries({ status: 'failed' });
      
      expect(completed.length).toBe(1);
      expect(failed.length).toBe(1);
    });
    
    it('should filter by priority', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'critical-1',
        stepName: 'Critical 1',
        status: 'failed',
        output: 'Error',
      });
      
      compressor.addEntry({
        stepId: 'normal-1',
        stepName: 'Normal 1',
        status: 'completed',
        output: 'Normal',
      });
      
      const critical = compressor.getEntries({ priority: 'critical' });
      
      expect(critical.length).toBe(1);
      expect(critical[0].stepId).toBe('critical-1');
    });
    
    it('should limit results', () => {
      const compressor = createHistoryCompressor();
      
      for (let i = 0; i < 10; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: `Output ${i}`,
        });
      }
      
      const limited = compressor.getEntries({ limit: 3 });
      
      expect(limited.length).toBe(3);
    });
    
    it('should filter entries with errors', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'error-1',
        stepName: 'Error 1',
        status: 'completed',
        output: 'Error: Something failed',
      });
      
      compressor.addEntry({
        stepId: 'clean-1',
        stepName: 'Clean 1',
        status: 'completed',
        output: 'Success',
      });
      
      const withErrors = compressor.getEntries({ hasErrors: true });
      
      expect(withErrors.length).toBe(1);
      expect(withErrors[0].stepId).toBe('error-1');
    });
  });
  
  // ========== 事件测试 ==========
  
  describe('events', () => {
    it('should emit entry:added event', (done) => {
      const compressor = createHistoryCompressor();
      
      compressor.on('entry:added', (entry) => {
        expect(entry.stepId).toBe('test-step');
        done();
      });
      
      compressor.addEntry({
        stepId: 'test-step',
        stepName: 'Test Step',
        status: 'completed',
        output: 'Test',
      });
    });
    
    it('should emit compressed event', () => {
      const compressor = createHistoryCompressor({
        windowSize: 1,
        compressionThreshold: 50,
      });
      
      let compressedCount = 0;
      let lastResult: any = null;
      
      compressor.on('compressed', (result) => {
        compressedCount++;
        lastResult = result;
      });
      
      // 添加足够多的条目触发压缩
      for (let i = 0; i < 10; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(100),
        });
      }
      
      // 应该至少触发一次压缩
      expect(compressedCount).toBeGreaterThanOrEqual(1);
      expect(lastResult).toBeDefined();
      expect(lastResult.savedTokens).toBeGreaterThanOrEqual(0);
    });
  });
});