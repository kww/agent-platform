/**
 * 性能基准测试 - 核心组件
 */

import { performance } from 'perf_hooks';
import { getStep, listStepsSync } from '../core/registry';
import { createStepCache } from '../core/cache';

describe('性能基准测试', () => {
  describe('Step 查找性能', () => {
    it('listStepsSync 首次调用后应该快速（预热后测试）', async () => {
      // 预热：首次调用会扫描文件系统
      listStepsSync();
      
      const durations: number[] = [];
      
      // 测试预热后的调用
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        listStepsSync();
        durations.push(performance.now() - start);
      }
      
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p99 = durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.99)];
      
      console.log('[listStepsSync] avg:', avg, 'ms, p99:', p99, 'ms');
      
      // 预热后应该更快（缓存生效）
      expect(avg).toBeLessThan(100);
    });
    
    it('getStep 首次调用后应该快速', async () => {
      const steps = listStepsSync();
      if (steps.length === 0) {
        console.log('[getStep] 跳过：没有已注册的步骤');
        return;
      }
      
      // 预热
      const firstStep = steps[0];
      getStep(firstStep.name);
      
      const durations: number[] = [];
      
      for (let i = 0; i < 100; i++) {
        const step = steps[Math.floor(Math.random() * steps.length)];
        const start = performance.now();
        getStep(step.name);
        durations.push(performance.now() - start);
      }
      
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      
      console.log('[getStep] avg:', avg, 'ms');
      
      expect(avg).toBeLessThan(50);
    });
  });
  
  describe('StepCache 性能', () => {
    it('缓存读写应该在 1ms 内完成', async () => {
      const cache = createStepCache({ maxSize: 1000, defaultTtl: 60000, enableGitHash: false });
      
      // 写入 100 个
      const writeDurations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        cache.set(`key-${i}`, { output: `result-${i}` });
        writeDurations.push(performance.now() - start);
      }
      
      // 读取 100 个
      const readDurations: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        cache.get(`key-${i}`);
        readDurations.push(performance.now() - start);
      }
      
      const writeAvg = writeDurations.reduce((a, b) => a + b, 0) / writeDurations.length;
      const readAvg = readDurations.reduce((a, b) => a + b, 0) / readDurations.length;
      
      console.log('[StepCache] write avg:', writeAvg, 'ms, read avg:', readAvg, 'ms');
      
      expect(writeAvg).toBeLessThan(1);
      expect(readAvg).toBeLessThan(1);
    });
  });
  
  describe('JSON 序列化性能', () => {
    it('大对象序列化应该在 10ms 内完成', async () => {
      // 模拟大型执行历史
      const largeObject = {
        executionId: 'test-exec',
        workflowId: 'test-wf',
        history: Array.from({ length: 100 }, (_, i) => ({
          stepId: `step-${i}`,
          output: JSON.stringify({ data: Array.from({ length: 1000 }, (_, j) => `item-${j}`) }),
          timestamp: Date.now(),
        })),
      };
      
      const start = performance.now();
      const json = JSON.stringify(largeObject);
      const duration = performance.now() - start;
      
      console.log('[JSON stringify ~100KB]:', duration, 'ms, size:', json.length);
      
      expect(duration).toBeLessThan(10);
    });
    
    it('大 JSON 解析应该在 10ms 内完成', async () => {
      const largeJson = JSON.stringify({
        executionId: 'test-exec',
        workflowId: 'test-wf',
        history: Array.from({ length: 100 }, (_, i) => ({
          stepId: `step-${i}`,
          output: JSON.stringify({ data: Array.from({ length: 1000 }, (_, j) => `item-${j}`) }),
          timestamp: Date.now(),
        })),
      });
      
      const start = performance.now();
      const obj = JSON.parse(largeJson);
      const duration = performance.now() - start;
      
      console.log('[JSON parse ~100KB]:', duration, 'ms');
      
      expect(duration).toBeLessThan(10);
    });
  });
});