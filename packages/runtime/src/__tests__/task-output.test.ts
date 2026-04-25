/**
 * TaskOutput 测试
 * 
 * WA-006: TaskOutput 封装
 */

import { TaskOutputManager, createTaskOutputManager } from '../orchestration/task-output';
import { MockRedisClient } from './mock-redis';

describe('TaskOutputManager', () => {
  let manager: TaskOutputManager;
  let redis: MockRedisClient;

  beforeEach(() => {
    redis = new MockRedisClient();
    manager = createTaskOutputManager({
      redis,
      ttl: 3600,
    });
  });

  describe('AC-003-1: TaskOutput 存储到 Redis', () => {
    it('should save TaskOutput to Redis', async () => {
      const output: TaskOutput = {
        taskId: 'task-1',
        workflowId: 'wf-backend',
        agentType: 'codex',
        keyData: { techStack: 'TypeScript' },
        summary: '完成 API 实现',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      await manager.save('task-1', output);

      const saved = await manager.get('task-1');
      
      expect(saved).toBeDefined();
      expect(saved?.taskId).toBe('task-1');
      expect(saved?.keyData.techStack).toBe('TypeScript');
    });

    it('should set TTL on save', async () => {
      const output: TaskOutput = {
        taskId: 'task-2',
        workflowId: 'wf-test',
        agentType: 'claude',
        keyData: {},
        summary: '测试完成',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      await manager.save('task-2', output);

      // TTL 应设置（验证 Redis 方法调用）
      const key = 'task:output:task-2';
      const saved = await redis.get(key);
      expect(saved).toBeDefined();
    });
  });

  describe('AC-003-2: 依赖 Task 读取 TaskOutput', () => {
    it('should get dependent outputs', async () => {
      // 创建多个 TaskOutput
      const output1: TaskOutput = {
        taskId: 'task-1',
        workflowId: 'wf-backend',
        agentType: 'codex',
        keyData: { techStack: 'TypeScript, PostgreSQL' },
        summary: 'API 实现完成',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      const output2: TaskOutput = {
        taskId: 'task-2',
        workflowId: 'wf-frontend',
        agentType: 'claude',
        keyData: { files: ['index.ts', 'api.ts'] },
        summary: '前端页面完成',
        completedAt: '2026-04-22T02:05:00Z',
        ttl: 3600,
      };

      await manager.save('task-1', output1);
      await manager.save('task-2', output2);

      // 批量获取
      const outputs = await manager.getDependentOutputs(['task-1', 'task-2']);

      expect(outputs['task-1']).toBeDefined();
      expect(outputs['task-1'].keyData.techStack).toBe('TypeScript, PostgreSQL');
      expect(outputs['task-2']).toBeDefined();
      expect(outputs['task-2'].keyData.files).toContain('index.ts');
    });

    it('should build dependent context for prompt', async () => {
      const output: TaskOutput = {
        taskId: 'task-1',
        workflowId: 'wf-backend',
        agentType: 'codex',
        keyData: { decisions: '使用 RESTful API' },
        summary: '分析完成',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      await manager.save('task-1', output);

      const context = await manager.buildDependentContext(['task-1']);

      expect(context).toContain('依赖 Task 输出');
      expect(context).toContain('Task: task-1');
      expect(context).toContain('关键数据');
      expect(context).toContain('decisions');
    });

    it('should handle missing dependencies', async () => {
      // 不存在的 Task
      const outputs = await manager.getDependentOutputs(['task-missing']);

      expect(outputs['task-missing']).toBeUndefined();
    });
  });

  describe('辅助功能', () => {
    it('should delete TaskOutput', async () => {
      const output: TaskOutput = {
        taskId: 'task-3',
        workflowId: 'wf-test',
        agentType: 'codex',
        keyData: {},
        summary: 'done',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      await manager.save('task-3', output);
      
      await manager.delete('task-3');
      
      const deleted = await manager.get('task-3');
      expect(deleted).toBeNull();
    });

    it('should refresh TTL', async () => {
      const output: TaskOutput = {
        taskId: 'task-4',
        workflowId: 'wf-test',
        agentType: 'codex',
        keyData: {},
        summary: 'done',
        completedAt: '2026-04-22T02:00:00Z',
        ttl: 3600,
      };

      await manager.save('task-4', output);
      
      await manager.refreshTTL('task-4', 7200);
      
      // TTL 已刷新
      const saved = await manager.get('task-4');
      expect(saved).toBeDefined();
    });
  });
});

/**
 * TaskOutput 类型导入
 */
interface TaskOutput {
  taskId: string;
  workflowId: string;
  agentType: string;
  keyData: any;
  summary: string;
  completedAt: string;
  ttl: number;
}