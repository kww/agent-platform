/**
 * TaskWorker 测试
 * 
 * WA-002: TaskWorker 并发检查（0.5h）
 */

import { TaskWorker, createTaskWorker } from '../orchestration/task-worker';
import { TaskQueue, createTaskQueue } from '../orchestration/task-queue';
import { MockRedisClient } from './mock-redis';

describe('TaskWorker', () => {
  let worker: TaskWorker;
  let queue: TaskQueue;
  let redis: MockRedisClient;

  beforeEach(() => {
    redis = new MockRedisClient();
    queue = createTaskQueue({
      redis,
      maxConcurrency: 2,
      perTypeConcurrency: 1,
    });
    worker = createTaskWorker({
      queue,
      redis,
      checkInterval: 100,  // 100ms for testing
    });
  });

  afterEach(() => {
    worker.stop();
  });

  describe('并发检查', () => {
    it('should check global concurrency before executing', async () => {
      // 创建 3 个 Task
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');
      const task3 = createTask('task-3', 'codex');

      // 添加到 pending
      await redis.rpush('tasks:pending', JSON.stringify(task1));
      await redis.rpush('tasks:pending', JSON.stringify(task2));
      await redis.rpush('tasks:pending', JSON.stringify(task3));

      // 启动 worker
      worker.start();

      // 等待处理
      await sleep(300);

      // 应只有 2 个 running（maxConcurrency）
      expect(await queue.getRunningCount()).toBeLessThanOrEqual(2);
    });

    it('should check perTypeConcurrency before executing', async () => {
      // 创建 2 个 codex Task
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'codex');

      await redis.rpush('tasks:pending', JSON.stringify(task1));
      await redis.rpush('tasks:pending', JSON.stringify(task2));

      worker.start();
      await sleep(300);

      // 应只有 1 个 codex running（perTypeConcurrency）
      expect(await queue.getTypeCount('codex')).toBeLessThanOrEqual(1);
    });

    it('should wait for slot when concurrency full', async () => {
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');
      const task3 = createTask('task-3', 'codex');

      await redis.rpush('tasks:pending', JSON.stringify(task1));
      await redis.rpush('tasks:pending', JSON.stringify(task2));
      await redis.rpush('tasks:pending', JSON.stringify(task3));

      worker.start();
      await sleep(300);

      // Task-3 应在 waiting
      expect(await queue.getWaitingCount()).toBeGreaterThan(0);
    });

    it('should process waiting tasks when slot available', async () => {
      const task1 = createTask('task-1', 'codex');
      const task2 = createTask('task-2', 'claude');
      const task3 = createTask('task-3', 'codex');

      await redis.rpush('tasks:pending', JSON.stringify(task1));
      await redis.rpush('tasks:pending', JSON.stringify(task2));
      await redis.rpush('tasks:pending', JSON.stringify(task3));

      worker.start();
      await sleep(300);

      // Task-1 完成，释放 slot
      await queue.complete('task-1');
      await sleep(300);

      // Task-3 应从 waiting 移入 running
      expect(await queue.getRunningCount()).toBe(2);
      expect(await queue.getWaitingCount()).toBe(0);
    });
  });

  describe('依赖检查', () => {
    it('should block task with unmet dependencies', async () => {
      const task1 = createTask('task-1', 'codex', []);
      const task2 = createTask('task-2', 'codex', ['task-1']);

      await redis.rpush('tasks:pending', JSON.stringify(task2));
      await redis.rpush('tasks:pending', JSON.stringify(task1));

      worker.start();
      await sleep(300);

      // Task-2 应在 waiting（依赖未满足）
      expect(await queue.getWaitingCount()).toBe(1);
    });

    it('should execute task when dependencies met', async () => {
      const task1 = createTask('task-1', 'codex', []);
      const task2 = createTask('task-2', 'claude', ['task-1']);

      await redis.rpush('tasks:pending', JSON.stringify(task2));
      await redis.rpush('tasks:pending', JSON.stringify(task1));

      worker.start();
      await sleep(300);

      // Task-1 完成
      await queue.complete('task-1');
      await sleep(300);

      // Task-2 应就绪
      expect(await queue.getRunningCount()).toBe(1);
      expect(await queue.getWaitingCount()).toBe(0);
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

interface Task {
  id: string;
  name: string;
  agentType: string;
  workflowId: string;
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed';
  waitFor: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}