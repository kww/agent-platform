/**
 * ParallelExecutor 单元测试
 */

import { ParallelExecutor, batchArray, executeParallel, FailStrategy } from '../core/parallel-executor';
import { Step, StepResult } from '../core/types';

describe('ParallelExecutor', () => {
  
  describe('batchArray', () => {
    it('should batch array into correct sizes', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7];
      const batches = batchArray(arr, 3);
      
      expect(batches).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7],
      ]);
    });
    
    it('should handle empty array', () => {
      const batches = batchArray([], 3);
      expect(batches).toEqual([]);
    });
    
    it('should handle array smaller than batch size', () => {
      const batches = batchArray([1, 2], 5);
      expect(batches).toEqual([[1, 2]]);
    });
  });
  
  describe('execute', () => {
    
    // Mock executor function
    const createMockExecutor = (results: Record<string, any>, delays: Record<string, number> = {}) => {
      return async (step: Step): Promise<StepResult> => {
        const delay = delays[step.id] ?? 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (results[step.id] === 'error') {
          throw new Error(`Mock error for ${step.id}`);
        }
        
        return {
          stepId: step.id,
          status: 'completed',
          output: results[step.id],
        };
      };
    };
    
    it('should execute steps with concurrency limit', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
        { id: 's2', step: 'test' },
        { id: 's3', step: 'test' },
      ];
      
      const executor = new ParallelExecutor({ maxConcurrent: 2 });
      const result = await executor.execute(steps, createMockExecutor({ s1: 1, s2: 2, s3: 3 }));
      
      expect(result.status).toBe('all_success');
      expect(result.successes).toEqual(['s1', 's2', 's3']);
      expect(result.failures.length).toBe(0);
    });
    
    it('should handle empty steps', async () => {
      const executor = new ParallelExecutor();
      const result = await executor.execute([], createMockExecutor({}));
      
      expect(result.status).toBe('all_success');
      expect(result.successes).toEqual([]);
    });
    
    it('should continue on failure with failStrategy=continue', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
        { id: 's2', step: 'test' },
        { id: 's3', step: 'test' },
      ];
      
      const executor = new ParallelExecutor({ 
        maxConcurrent: 2,
        failStrategy: 'continue',
      });
      
      const result = await executor.execute(
        steps, 
        createMockExecutor({ s1: 1, s2: 'error', s3: 3 })
      );
      
      expect(result.status).toBe('partial_success');
      expect(result.successes).toEqual(['s1', 's3']);
      expect(result.failures.length).toBe(1);
      expect(result.failures[0].stepId).toBe('s2');
    });
    
    it('should throw on failure with failStrategy=all', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
        { id: 's2', step: 'test' },
        { id: 's3', step: 'test' },
      ];
      
      const executor = new ParallelExecutor({ 
        maxConcurrent: 2,
        failStrategy: 'all',
      });
      
      await expect(
        executor.execute(steps, createMockExecutor({ s1: 1, s2: 'error', s3: 3 }))
      ).rejects.toThrow('Mock error for s2');
    });
    
    it('should return best-effort results with failStrategy=best-effort', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
        { id: 's2', step: 'test' },
        { id: 's3', step: 'test' },
      ];
      
      const executor = new ParallelExecutor({ 
        maxConcurrent: 2,
        failStrategy: 'best-effort',
      });
      
      const result = await executor.execute(
        steps, 
        createMockExecutor({ s1: 1, s2: 'error', s3: 3 })
      );
      
      expect(result.status).toBe('partial_success');
      expect(result.successes).toEqual(['s1', 's3']);
      expect(result.failures.length).toBe(1);
    });
    
    it('should timeout long-running steps', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
      ];
      
      const executor = new ParallelExecutor({ 
        maxConcurrent: 1,
        timeout: 100,  // 100ms timeout
        failStrategy: 'all',  // 失败时抛出错误
      });
      
      // Mock executor with 200ms delay
      const slowExecutor = async (step: Step): Promise<StepResult> => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return { stepId: step.id, status: 'completed' };
      };
      
      await expect(executor.execute(steps, slowExecutor)).rejects.toThrow('timeout');
    });
    
    it('should track progress with onProgress callback', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
        { id: 's2', step: 'test' },
      ];
      
      const progressEvents: any[] = [];
      
      const executor = new ParallelExecutor({ 
        maxConcurrent: 1,
        onProgress: (info) => progressEvents.push(info),
      });
      
      await executor.execute(steps, createMockExecutor({ s1: 1, s2: 2 }));
      
      // Should have 4 events: start + success for each step
      expect(progressEvents.length).toBe(4);
      expect(progressEvents[0].status).toBe('start');
      expect(progressEvents[1].status).toBe('success');
    });
  });
  
  describe('executeParallel convenience function', () => {
    it('should execute steps with default options', async () => {
      const steps: Step[] = [
        { id: 's1', step: 'test' },
      ];
      
      const mockExecutor = async (step: Step): Promise<StepResult> => ({
        stepId: step.id,
        status: 'completed',
      });
      
      const result = await executeParallel(steps, mockExecutor);
      
      expect(result.status).toBe('all_success');
    });
  });
});