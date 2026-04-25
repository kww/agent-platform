/**
 * 压力测试 - agent-runtime 核心组件
 */

import { performance } from 'perf_hooks';
import { getStep, listStepsSync } from '../core/registry';
import { createStepCache } from '../core/cache';
import { EventEmitter } from '../core/events';

describe('压力测试', () => {
  describe('Step 查找压力测试', () => {
    it('高频调用 listStepsSync 不应该内存泄漏', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 执行 1000 次调用
      for (let i = 0; i < 1000; i++) {
        listStepsSync();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const growth = finalMemory - initialMemory;
      const growthMB = growth / 1024 / 1024;
      
      console.log(`[listStepsSync x1000] 内存增长: ${growthMB.toFixed(2)} MB`);
      
      // 内存增长应该可控（< 150MB，listStepsSync 会缓存大量文件内容）
      expect(growthMB).toBeLessThan(150);
    });
    
    it('并发调用 getStep 应该正确处理', async () => {
      const steps = listStepsSync();
      if (steps.length === 0) {
        console.log('[getStep 并发] 跳过：没有已注册的步骤');
        return;
      }
      
      const concurrentCalls = 100;
      const errors: Error[] = [];
      
      // 并发调用
      const promises = Array.from({ length: concurrentCalls }, async () => {
        try {
          const step = steps[Math.floor(Math.random() * steps.length)];
          getStep(step.name);
        } catch (err) {
          errors.push(err as Error);
        }
      });
      
      await Promise.all(promises);
      
      console.log(`[getStep 并发 x${concurrentCalls}] 错误数: ${errors.length}`);
      
      // 不应该有错误
      expect(errors.length).toBe(0);
    });
  });
  
  describe('Cache 压力测试', () => {
    it('大量写入不应该内存泄漏', async () => {
      const cache = createStepCache({ maxSize: 10000, defaultTtl: 60000, enableGitHash: false });
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 写入 10000 个条目
      for (let i = 0; i < 10000; i++) {
        cache.set(`stress-key-${i}`, { data: `value-${i}`, timestamp: Date.now() });
      }
      
      const afterWriteMemory = process.memoryUsage().heapUsed;
      const writeGrowth = (afterWriteMemory - initialMemory) / 1024 / 1024;
      
      console.log(`[Cache 写入 10000 条] 内存增长: ${writeGrowth.toFixed(2)} MB`);
      
      // 清空缓存
      cache.clear();
      
      // 强制 GC（如果可用）
      if (global.gc) {
        global.gc();
      }
      
      const afterClearMemory = process.memoryUsage().heapUsed;
      const clearGrowth = (afterClearMemory - initialMemory) / 1024 / 1024;
      
      console.log(`[Cache 清空后] 内存增长: ${clearGrowth.toFixed(2)} MB`);
      
      // 清空后内存应该释放（允许一些残留，GC 可能未立即执行）
      expect(clearGrowth).toBeLessThan(writeGrowth * 1.5);
    });
    
    it('高频读写不应该崩溃', async () => {
      const cache = createStepCache({ maxSize: 1000, defaultTtl: 60000, enableGitHash: false });
      
      const iterations = 5000;
      const errors: Error[] = [];
      
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        try {
          // 随机读写
          const key = `key-${Math.floor(Math.random() * 1000)}`;
          if (Math.random() > 0.5) {
            cache.set(key, { value: i });
          } else {
            cache.get(key);
          }
        } catch (err) {
          errors.push(err as Error);
        }
      }
      
      const duration = performance.now() - start;
      const opsPerSecond = (iterations / duration) * 1000;
      
      console.log(`[Cache 高频读写 x${iterations}] 耗时: ${duration.toFixed(0)}ms, OPS: ${opsPerSecond.toFixed(0)}, 错误: ${errors.length}`);
      
      expect(errors.length).toBe(0);
      expect(opsPerSecond).toBeGreaterThan(1000);
    });
  });
  
  describe('EventEmitter 压力测试', () => {
    it('大量事件监听不应该内存泄漏', async () => {
      const emitter = new EventEmitter();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // 添加大量监听器
      for (let i = 0; i < 1000; i++) {
        emitter.on(`event-${i % 100}`, () => {});
      }
      
      const afterOnMemory = process.memoryUsage().heapUsed;
      const onGrowth = (afterOnMemory - initialMemory) / 1024 / 1024;
      
      console.log(`[EventEmitter 添加 1000 监听器] 内存增长: ${onGrowth.toFixed(2)} MB`);
      
      // 移除所有监听器
      emitter.removeAllListeners();
      
      const afterOffMemory = process.memoryUsage().heapUsed;
      const offGrowth = (afterOffMemory - initialMemory) / 1024 / 1024;
      
      console.log(`[EventEmitter 移除监听器后] 内存增长: ${offGrowth.toFixed(2)} MB`);
      
      // 移除后内存应该减少（允许一些残留）
      expect(offGrowth).toBeLessThan(onGrowth * 2);
    });
    
    it('高频事件触发不应该崩溃', async () => {
      const emitter = new EventEmitter();
      
      let callCount = 0;
      emitter.on('test', () => {
        callCount++;
      });
      
      const iterations = 10000;
      const start = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        emitter.emit('test', { data: i });
      }
      
      const duration = performance.now() - start;
      const eventsPerSecond = (iterations / duration) * 1000;
      
      console.log(`[EventEmitter 触发 x${iterations}] 耗时: ${duration.toFixed(0)}ms, EPS: ${eventsPerSecond.toFixed(0)}`);
      
      expect(callCount).toBe(iterations);
      expect(eventsPerSecond).toBeGreaterThan(10000);
    });
  });
  
  describe('JSON 处理压力测试', () => {
    it('大对象序列化不应该崩溃', async () => {
      const iterations = 100;
      const durations: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const largeObject = {
          id: i,
          data: Array.from({ length: 10000 }, (_, j) => ({
            key: `key-${j}`,
            value: `value-${j}`,
            nested: { a: 1, b: 2, c: 3 },
          })),
        };
        
        const start = performance.now();
        const json = JSON.stringify(largeObject);
        durations.push(performance.now() - start);
        
        // 验证可以解析回来
        const parsed = JSON.parse(json);
        expect(parsed.id).toBe(i);
      }
      
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`[JSON 序列化 ~1MB x${iterations}] 平均耗时: ${avg.toFixed(2)}ms`);
      
      expect(avg).toBeLessThan(50);
    });
  });
});