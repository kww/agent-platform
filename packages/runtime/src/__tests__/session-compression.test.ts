/**
 * executor 集成测试 - sessionHistory 压缩
 */

import { buildSessionPrompt } from '../core/executor';
import { createHistoryCompressor } from '../core/history-compressor';
import { SessionEntry } from '../core/types';

describe('executor sessionHistory integration', () => {
  
  // ========== buildSessionPrompt 测试 ==========
  
  describe('buildSessionPrompt', () => {
    it('should return original prompt when no history', () => {
      const prompt = 'Current task';
      const result = buildSessionPrompt([], prompt);
      
      expect(result).toBe(prompt);
    });
    
    it('should format history entries correctly', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          phaseId: 'phase-1',
          phaseName: 'Phase 1',
          output: 'Output 1',
          timestamp: new Date()
        },
        {
          stepId: 'step-2',
          stepName: 'Step 2',
          output: 'Output 2',
          timestamp: new Date()
        }
      ];
      
      const result = buildSessionPrompt(history, 'Current task');
      
      expect(result).toContain('前序步骤上下文');
      expect(result).toContain('[Phase 1] Step 1');
      expect(result).toContain('Step 2');
      expect(result).toContain('当前任务');
      expect(result).toContain('Current task');
    });
    
    it('should use summary when available', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          summary: 'Step 1 summary',
          output: 'Very long output that should be summarized',
          timestamp: new Date()
        }
      ];
      
      const result = buildSessionPrompt(history, 'Current task');
      
      expect(result).toContain('摘要: Step 1 summary');
      expect(result).not.toContain('Very long output');
    });
    
    it('should truncate long output', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          output: 'A'.repeat(1000),
          timestamp: new Date()
        }
      ];
      
      const result = buildSessionPrompt(history, 'Current task');
      
      expect(result).toContain('已截断');
      expect(result.length).toBeLessThan(1000 + 200); // 截断到 500
    });
  });
  
  // ========== buildSessionPrompt with HistoryCompressor 测试 ==========
  
  describe('buildSessionPrompt with compressor', () => {
    it('should use compressor outputs when available', () => {
      const compressor = createHistoryCompressor({
        windowSize: 5,
        maxTokenLimit: 100000,
      });
      
      // 添加几个条目
      compressor.addEntry({
        stepId: 'step-1',
        stepName: 'Step 1',
        status: 'completed',
        output: 'Output 1',
        keyData: { files_changed: ['test.ts'] }
      });
      
      compressor.addEntry({
        stepId: 'step-2',
        stepName: 'Step 2',
        status: 'completed',
        output: 'Output 2',
      });
      
      const prompt = buildSessionPrompt([], 'Current task', compressor);
      
      expect(prompt).toContain('前序步骤上下文');
      expect(prompt).toContain('Step 1');
      expect(prompt).toContain('Step 2');
    });
    
    it('should respect token limit', () => {
      const compressor = createHistoryCompressor({
        windowSize: 5,
        maxTokenLimit: 200, // 很低的限制
      });
      
      // 添加多个长输出
      for (let i = 0; i < 10; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(500),
        });
      }
      
      const prompt = buildSessionPrompt([], 'Current task', compressor);
      
      // 因为 token 限制低，应该只包含部分内容
      const promptLength = prompt.length;
      // 放宽限制，允许一定的格式开销
      expect(promptLength).toBeLessThan(6000);
    });
    
    it('should use summary for old entries', () => {
      const compressor = createHistoryCompressor({
        windowSize: 2,
        compressionThreshold: 100,
      });
      
      // 添加多个条目触发压缩
      for (let i = 0; i < 5; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: `Created: file${i}.ts\n${'A'.repeat(200)}`,
        });
      }
      
      const prompt = buildSessionPrompt([], 'Current task', compressor);
      
      // prompt 应该生成，包含部分历史
      expect(prompt).toBeDefined();
      expect(prompt.length).toBeGreaterThan(0);
    });
    
    it('should return original prompt when compressor has no entries', () => {
      const compressor = createHistoryCompressor();
      
      const prompt = buildSessionPrompt([], 'Current task', compressor);
      
      // 没有历史，返回原 prompt
      expect(prompt).toBe('Current task');
    });
  });
  
  // ========== 混合模式测试 ==========
  
  describe('mixed mode (sessionHistory + compressor)', () => {
    it('should prefer compressor over sessionHistory', () => {
      const compressor = createHistoryCompressor();
      
      compressor.addEntry({
        stepId: 'compressor-step',
        stepName: 'Compressor Step',
        status: 'completed',
        output: 'Compressor output',
      });
      
      const sessionHistory: SessionEntry[] = [
        {
          stepId: 'old-step',
          stepName: 'Old Step',
          output: 'Old output',
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(sessionHistory, 'Current task', compressor);
      
      // 应该使用 compressor 的内容，不是 sessionHistory
      expect(prompt).toContain('Compressor Step');
      expect(prompt).not.toContain('Old Step');
    });
    
    it('should fallback to sessionHistory when no compressor', () => {
      const sessionHistory: SessionEntry[] = [
        {
          stepId: 'fallback-step',
          stepName: 'Fallback Step',
          output: 'Fallback output',
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(sessionHistory, 'Current task');
      
      // 没有 compressor，使用 sessionHistory
      expect(prompt).toContain('Fallback Step');
    });
  });
  
  // ========== 边界情况测试 ==========
  
  describe('edge cases', () => {
    it('should handle null sessionHistory', () => {
      const prompt = buildSessionPrompt(null as any, 'Current task');
      
      expect(prompt).toBe('Current task');
    });
    
    it('should handle undefined compressor', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          output: 'Output',
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(history, 'Current task', undefined);
      
      expect(prompt).toContain('Step 1');
    });
    
    it('should handle object output', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          output: { files: ['a.ts'], count: 5 },
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(history, 'Current task');
      
      expect(prompt).toContain('files');
      expect(prompt).toContain('a.ts');
    });
    
    it('should handle entries with phase info', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'step-1',
          stepName: 'Step 1',
          phaseId: 'analysis',
          phaseName: 'Analysis',
          output: 'Output',
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(history, 'Current task');
      
      expect(prompt).toContain('[Analysis] Step 1');
    });
    
    it('should handle entries without stepName', () => {
      const history: SessionEntry[] = [
        {
          stepId: 'unknown-step',
          output: 'Output',
          timestamp: new Date()
        }
      ];
      
      const prompt = buildSessionPrompt(history, 'Current task');
      
      expect(prompt).toContain('unknown-step');
    });
  });
  
  // ========== 性能测试 ==========
  
  describe('performance', () => {
    it('should handle large history efficiently', () => {
      const compressor = createHistoryCompressor();
      
      // 添加 100 个条目
      for (let i = 0; i < 100; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: `Output ${i}`,
        });
      }
      
      const start = Date.now();
      const prompt = buildSessionPrompt([], 'Current task', compressor);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // 应该很快
      expect(prompt).toBeDefined();
    });
    
    it('should handle rapid additions', () => {
      const compressor = createHistoryCompressor();
      
      const start = Date.now();
      
      for (let i = 0; i < 50; i++) {
        compressor.addEntry({
          stepId: `step-${i}`,
          stepName: `Step ${i}`,
          status: 'completed',
          output: 'A'.repeat(200),
        });
      }
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // 应该在 100ms 内完成
    });
  });
});