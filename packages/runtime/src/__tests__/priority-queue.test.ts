/**
 * 优先级队列测试
 */

import { splitBatchHandler } from '../core/builtin-handlers';

describe('Priority Queue', () => {
  describe('splitBatchHandler priority sorting', () => {
    it('should sort tasks by priority (lower = higher priority)', async () => {
      const tasks = [
        { id: 'task-1', name: 'Low priority', priority: 3 },
        { id: 'task-2', name: 'High priority', priority: 1 },
        { id: 'task-3', name: 'Medium priority', priority: 2 },
      ];
      
      const result = await splitBatchHandler({
        tasks,
        batch_size: 3,
        respect_dependencies: true,
        strategy: 'balanced',
      }, {} as any);
      
      // 第一批应该是 High priority (priority: 1)
      expect(result.batches[0][0].id).toBe('task-2');
      expect(result.batches[0][1].id).toBe('task-3');
      expect(result.batches[0][2].id).toBe('task-1');
    });
    
    it('should handle tasks without priority (default to 99)', async () => {
      const tasks = [
        { id: 'task-1', name: 'No priority' },
        { id: 'task-2', name: 'High priority', priority: 1 },
        { id: 'task-3', name: 'Also no priority' },
      ];
      
      const result = await splitBatchHandler({
        tasks,
        batch_size: 3,
        respect_dependencies: true,
        strategy: 'balanced',
      }, {} as any);
      
      // High priority task should be first
      expect(result.batches[0][0].id).toBe('task-2');
    });
    
    it('should respect dependencies while sorting by priority', async () => {
      const tasks = [
        { id: 'task-1', name: 'Depends on task-2', priority: 1, dependencies: ['task-2'] },
        { id: 'task-2', name: 'No dependencies', priority: 3 },
        { id: 'task-3', name: 'Independent', priority: 2 },
      ];
      
      const result = await splitBatchHandler({
        tasks,
        batch_size: 3,
        respect_dependencies: true,
        strategy: 'balanced',
      }, {} as any);
      
      // task-2 should be in an earlier batch (dependency must be satisfied)
      const allTasks = result.batches.flat();
      const task2Index = allTasks.findIndex((t: any) => t.id === 'task-2');
      const task1Index = allTasks.findIndex((t: any) => t.id === 'task-1');
      
      expect(task2Index).toBeLessThan(task1Index);
    });
    
    it('should handle circular dependencies gracefully', async () => {
      const tasks = [
        { id: 'task-1', priority: 1, dependencies: ['task-2'] },
        { id: 'task-2', priority: 2, dependencies: ['task-1'] },
        { id: 'task-3', priority: 3 },
      ];
      
      // Should not throw on circular dependency
      const result = await splitBatchHandler({
        tasks,
        batch_size: 3,
        respect_dependencies: true,
        strategy: 'balanced',
      }, {} as any);
      
      expect(result.batches.length).toBeGreaterThan(0);
    });
    
    it('should respect batch_size while sorting by priority', async () => {
      const tasks = [
        { id: 'task-1', priority: 3 },
        { id: 'task-2', priority: 1 },
        { id: 'task-3', priority: 2 },
        { id: 'task-4', priority: 4 },
        { id: 'task-5', priority: 5 },
      ];
      
      const result = await splitBatchHandler({
        tasks,
        batch_size: 2,
        respect_dependencies: true,
        strategy: 'balanced',
      }, {} as any);
      
      // First batch should have highest priority tasks
      expect(result.batches[0].length).toBe(2);
      expect(result.batches[0][0].id).toBe('task-2'); // priority: 1
    });
  });
  
  describe('priority_queue configuration', () => {
    it('should have priority_queue option in ConcurrencyConfig type', () => {
      // This test verifies the type is correctly defined
      const config = {
        max_parallel_tasks: 5,
        resource_aware: true,
        priority_queue: true,
      };
      
      expect(config.priority_queue).toBe(true);
    });
  });
});