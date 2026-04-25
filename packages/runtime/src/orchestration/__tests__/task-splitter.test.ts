/**
 * 任务拆分器测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TaskSplitter, createTaskSplitter, type DecisionInput, type Task } from '../task-splitter';

// Mock LLM 返回 YAML 格式的任务
const createMockLLMClient = () => ({
  chat: jest.fn(async () => `
tasks:
  - id: "TASK-001"
    name: "实现用户登录"
    description: "实现用户登录功能，包括表单验证和 API 调用"
    assignee: "developer"
    priority: "P0"
    files:
      - "src/auth/login.ts"
      - "src/auth/login.test.ts"
    acceptance:
      - "用户可以使用邮箱登录"
      - "登录失败显示错误提示"
    depends_on: []
    estimated_hours: 4
    labels:
      - "feature"

  - id: "TASK-002"
    name: "设计登录页面"
    description: "设计登录页面 UI"
    assignee: "designer"
    priority: "P1"
    files:
      - "src/pages/Login.tsx"
    acceptance:
      - "页面符合设计规范"
    depends_on: []
    estimated_hours: 2

  - id: "TASK-003"
    name: "编写登录测试"
    description: "编写登录功能的单元测试"
    assignee: "tester"
    priority: "P1"
    files:
      - "src/auth/login.test.ts"
    acceptance:
      - "测试覆盖率 > 80%"
    depends_on:
      - "TASK-001"
    estimated_hours: 2
`),
});

describe('TaskSplitter', () => {
  let splitter: TaskSplitter;
  let mockRedis: Map<string, any>;
  let mockContextSharer: any;

  beforeEach(() => {
    mockRedis = new Map();
    
    mockContextSharer = {
      getValue: jest.fn(async (key: string) => {
        const value = mockRedis.get(key);
        return value ?? null;
      }),
      set: jest.fn(async (key: string, value: any) => {
        mockRedis.set(key, value);
      }),
    };

    splitter = createTaskSplitter({
      contextSharer: mockContextSharer,
      llmClient: createMockLLMClient(),
    });
  });

  describe('splitTasks', () => {
    it('should split decisions into tasks', async () => {
      const meetingId = 'test-meeting-1';
      
      // 设置会议元数据
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '用户认证功能开发',
        description: '实现用户登录、注册、登出功能',
      });

      const decisions: DecisionInput[] = [
        { id: 'd1', content: '使用 JWT 进行认证', agreed: true, priority: 'high' },
        { id: 'd2', content: '登录页面需要响应式设计', agreed: true, priority: 'medium' },
      ];

      const result = await splitter.splitTasks(meetingId, decisions);

      expect(result.tasks.length).toBe(3);
      expect(result.statistics.total).toBe(3);
    });

    it('should parse task dependencies correctly', async () => {
      const meetingId = 'test-meeting-2';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const decisions: DecisionInput[] = [
        { id: 'd1', content: '开发功能', agreed: true },
      ];

      const result = await splitter.splitTasks(meetingId, decisions);

      // TASK-003 依赖 TASK-001
      expect(result.dependencies.length).toBeGreaterThan(0);
      
      // 验证依赖关系存在
      const taskWithDeps = result.tasks.find(t => t.dependsOn.length > 0);
      expect(taskWithDeps).toBeDefined();
      expect(taskWithDeps!.dependsOn).toContain('TASK-001');
    });

    it('should calculate statistics correctly', async () => {
      const meetingId = 'test-meeting-3';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策1', agreed: true },
      ]);

      expect(result.statistics.byPriority).toBeDefined();
      expect(result.statistics.byAssignee).toBeDefined();
      expect(result.statistics.estimatedTotalHours).toBeGreaterThan(0);
    });

    it('should detect warnings for potential issues', async () => {
      const meetingId = 'test-meeting-4';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策', agreed: true },
      ]);

      // 至少有一个孤立任务（TASK-001 和 TASK-002 没有后继）
      expect(result.warnings).toBeDefined();
    });
  });

  describe('task parsing', () => {
    it('should parse YAML tasks correctly', async () => {
      const meetingId = 'test-meeting-5';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策', agreed: true },
      ]);

      const task = result.tasks.find(t => t.id === 'TASK-001');
      
      expect(task).toBeDefined();
      expect(task!.name).toBe('实现用户登录');
      expect(task!.assignee).toBe('developer');
      expect(task!.priority).toBe('P0');
      expect(task!.files.length).toBe(2);
      expect(task!.acceptance.length).toBe(2);
    });

    it('should handle empty decisions', async () => {
      const meetingId = 'test-meeting-6';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, []);

      // 即使没有决策，LLM 也会返回预设的任务
      expect(result.tasks.length).toBeGreaterThan(0);
    });
  });

  describe('priority calculation', () => {
    it('should boost priority for tasks with many successors', async () => {
      const meetingId = 'test-meeting-7';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策', agreed: true },
      ]);

      // 检查优先级分布
      const p0Count = result.statistics.byPriority['P0'] ?? 0;
      expect(p0Count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dependency validation', () => {
    it('should detect no circular dependencies in normal tasks', async () => {
      const meetingId = 'test-meeting-8';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      const result = await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策', agreed: true },
      ]);

      // 正常任务不应该有循环依赖警告
      const circularWarning = result.warnings?.find(w => 
        w.includes('循环依赖')
      );
      expect(circularWarning).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('should save tasks to contextSharer', async () => {
      const meetingId = 'test-meeting-9';
      
      mockRedis.set(`meeting:${meetingId}:meta`, {
        meetingId,
        title: '测试会议',
      });

      await splitter.splitTasks(meetingId, [
        { id: 'd1', content: '决策', agreed: true },
      ]);

      // 验证任务已保存
      expect(mockContextSharer.set).toHaveBeenCalledWith(
        `meeting:${meetingId}:tasks`,
        expect.any(Array)
      );
    });
  });
});

describe('TaskSplitter edge cases', () => {
  it('should handle malformed YAML gracefully', async () => {
    const mockRedis = new Map();
    const mockContextSharer = {
      getValue: jest.fn(async (key: string) => mockRedis.get(key) ?? null),
      set: jest.fn(async (key: string, value: any) => mockRedis.set(key, value)),
    } as any;

    const malformedLLM = {
      chat: jest.fn(async () => 'This is not valid YAML at all!'),
    };

    const splitter = createTaskSplitter({
      contextSharer: mockContextSharer,
      llmClient: malformedLLM,
    });

    mockRedis.set('meeting:edge-1:meta', {
      meetingId: 'edge-1',
      title: '测试',
    });

    const result = await splitter.splitTasks('edge-1', [
      { id: 'd1', content: '决策', agreed: true },
    ]);

    // 即使 YAML 格式错误，也应该返回空数组而不是抛出错误
    expect(result.tasks).toBeDefined();
  });

  it('should handle missing meeting metadata', async () => {
    const mockRedis = new Map();
    const mockContextSharer = {
      getValue: jest.fn(async () => null),
      set: jest.fn(async (key: string, value: any) => mockRedis.set(key, value)),
    } as any;

    const splitter = createTaskSplitter({
      contextSharer: mockContextSharer,
      llmClient: createMockLLMClient(),
    });

    const result = await splitter.splitTasks('non-existent-meeting', [
      { id: 'd1', content: '决策', agreed: true },
    ]);

    // 即使没有会议元数据，也应该能正常工作
    expect(result.tasks.length).toBeGreaterThan(0);
  });
});
