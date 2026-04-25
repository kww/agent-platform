/**
 * TaskQueue 测试
 * 
 * AC-001-1: maxConcurrency 配置生效
 * AC-001-2: perTypeConcurrency 配置生效
 * AC-001-3: Task 阻塞时移入 waitingQueue
 * AC-001-4: Task 完成时通知依赖 Task
 */

import { TaskQueue, createTaskQueue } from '../orchestration/task-queue';
import { MockRedisClient } from './mock-redis';

describe('TaskQueue', () => {
  let queue: TaskQueue;
  let redis: MockRedisClient;

  beforeEach(() => {
    redis = new MockRedisClient();
    queue = createTaskQueue({
      redis,
      maxConcurrency: 2,
      perTypeConcurrency: 1,
    });
  });

  describe('AC-001-1: maxConcurrency 配置生效', () => {
    it('should enforce maxConcurrency limit', async () => {
      // 创建 3 个 Task
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');
      const task3 = createTask('task-3', 'codex');

      // Task-1 入队
      await queue.enqueue(task1);
      expect(await queue.getRunningCount()).toBe(1);

      // Task-2 入队（达到 maxConcurrency）
      await queue.enqueue(task2);
      expect(await queue.getRunningCount()).toBe(2);

      // Task-3 入队（超过 maxConcurrency，应进入 waiting）
      await queue.enqueue(task3);
      expect(await queue.getRunningCount()).toBe(2);
      expect(await queue.getWaitingCount()).toBe(1);
    });

    it('should move waiting task to running when slot available', async () => {
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');
      const task3 = createTask('task-3', 'codex');

      await queue.enqueue(task1);
      await queue.enqueue(task2);
      await queue.enqueue(task3);

      // Task-1 完成，释放 slot
      await queue.complete('task-1');

      // Task-3 应从 waiting 移入 running
      expect(await queue.getRunningCount()).toBe(2);
      expect(await queue.getWaitingCount()).toBe(0);
    });
  });

  describe('AC-001-2: perTypeConcurrency 配置生效', () => {
    it('should enforce perTypeConcurrency limit', async () => {
      // 创建 2 个 codex Task
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'codex');

      // Task-1 入队
      await queue.enqueue(task1);
      expect(await queue.getTypeCount('codex')).toBe(1);

      // Task-2 入队（超过 perTypeConcurrency:1）
      await queue.enqueue(task2);
      expect(await queue.getTypeCount('codex')).toBe(1);
      expect(await queue.getWaitingCount()).toBe(1);
    });

    it('should allow different agent types to run concurrently', async () => {
      // 1 codex + 1 claude（不冲突）
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');

      await queue.enqueue(task1);
      await queue.enqueue(task2);

      expect(await queue.getTypeCount('codex')).toBe(1);
      expect(await queue.getTypeCount('claude')).toBe(1);
      expect(await queue.getRunningCount()).toBe(2);
    });
  });

  describe('AC-001-3: Task 阻塞时移入 waitingQueue', () => {
    it('should block task with unmet dependencies', async () => {
      const task1 = createTask('task-1', 'codex', []);
      const task2 = createTask('task-2', 'codex', ['task-1']);

      // Task-2 依赖 Task-1，应阻塞
      await queue.enqueue(task2);
      
      expect(await queue.getWaitingCount()).toBe(1);
      expect(await queue.getRunningCount()).toBe(0);
    });

    it('should move blocked task to running when dependencies met', async () => {
      const task1 = createTask('task-1', 'codex', []);
      const task2 = createTask('task-2', 'codex', ['task-1']);

      await queue.enqueue(task2);
      
      // Task-1 完成
      await queue.enqueue(task1);
      await queue.complete('task-1');

      // Task-2 应从 waiting 移入 running
      expect(await queue.getWaitingCount()).toBe(0);
      expect(await queue.getRunningCount()).toBe(1);
    });
  });

  describe('AC-001-4: Task 完成时通知依赖 Task', () => {
    it('should notify dependent tasks on completion', async () => {
      const task1 = createTask('task-1', 'codex', []);
      const task2 = createTask('task-2', 'codex', ['task-1']);
      const task3 = createTask('task-3', 'claude', ['task-1']);

      await queue.enqueue(task2);
      await queue.enqueue(task3);
      await queue.enqueue(task1);

      // Task-1 完成后，Task-2 和 Task-3 应自动入队到 running
      await queue.complete('task-1');

      // Task-2 和 Task-3 都应移入 running
      expect(await queue.getRunningCount()).toBe(2);
      expect(await queue.getWaitingCount()).toBe(0);
    });

    it('should save TaskOutput on completion', async () => {
      const task1 = createTask('task-1', 'codex', []);
      
      await queue.enqueue(task1);
      
      const output = { result: 'success', files: ['a.ts'] };
      await queue.complete('task-1', output);

      // TaskOutput 应存储到 Redis
      const savedOutput = await queue.getOutput('task-1');
      expect(savedOutput).toBeDefined();
      expect(savedOutput?.summary).toContain('success');
    });
  });
});

/**
 * 创建测试 Task
 */
function createTask(
  id: string,
  agentType: string,
  dependencies: string[] = []
): Task {
  return {
    id,
    name: `Task ${id}`,
    agentType,
    workflowId: `wf-${id}`,
    status: 'pending',
    waitFor: dependencies,
  };
}

/**
 * Task 类型
 */
interface Task {
  id: string;
  name: string;
  agentType: string;
  workflowId: string;
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed';
  waitFor: string[];
}