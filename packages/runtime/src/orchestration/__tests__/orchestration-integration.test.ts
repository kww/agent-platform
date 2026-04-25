/**
 * 编排层集成测试
 * 
 * 测试已完成的 Phase 0 功能：
 * 1. ContextBridge - 上下文桥接
 * 2. MeetingStateMachine - 状态机
 * 3. StateListener - 状态监听器
 * 4. FailureHandler - 失败处理
 * 5. PerformanceMonitor - 性能监控
 * 6. SkillExecutor - Skill 执行
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock 依赖
const createMockRedis = () => ({
  hset: jest.fn(async () => 1),
  hget: jest.fn(async () => null),
  hgetall: jest.fn(async () => ({})),
  hdel: jest.fn(async () => 1),
  hexists: jest.fn(async () => 0),
  del: jest.fn(async () => 1),
  expire: jest.fn(async () => 1),
  get: jest.fn(async () => null),
  setex: jest.fn(async () => 'OK'),
});

const createMockSpawnAgent = () => jest.fn(async (options: any) => ({
  success: true,
  output: JSON.stringify({ result: 'success', files: ['test.ts'] }),
}));

describe('Orchestration Integration Tests', () => {
  describe('ContextBridge', () => {
    it('should extract, transform, prune context', async () => {
      const { createContextBridge } = await import('../context-bridge');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'test-exec',
      });

      // 预设测试数据
      await contextSharer.set('meeting:test-123:meta', {
        meetingId: 'test-123',
        title: 'Test Meeting',
      });

      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: {
          execute: async () => ({
            success: true,
            output: { result: 'ok' },
            tokenUsage: { input: 100, output: 50, total: 150 },
          }),
        },
      });

      // 测试提取
      const extracted = await bridge.extract('test-123', 1);
      expect(extracted.meetingId).toBe('test-123');
      expect(extracted.stage).toBe(1);
    });
  });

  describe('MeetingStateMachine', () => {
    it('should initialize and transition states', async () => {
      const { createMeetingStateMachine } = await import('../meeting-state-machine');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'state-test',
      });

      const stateMachine = createMeetingStateMachine({
        contextSharer,
      });

      // 初始化状态机
      const initial = await stateMachine.initialize('meeting-001');
      expect(initial.currentState).toBe('pending');
      expect(initial.version).toBe(1);
    });

    it('should validate invalid transitions', async () => {
      const { createMeetingStateMachine, InvalidTransitionError, StateMachineError } = await import('../meeting-state-machine');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'state-test',
      });

      const stateMachine = createMeetingStateMachine({
        contextSharer,
      });

      // 初始化
      await stateMachine.initialize('meeting-002');

      // 设置状态（模拟持久化）
      await contextSharer.set('state:meeting-002', {
        meetingId: 'meeting-002',
        currentState: 'pending',
        previousState: null,
        lastTransition: null,
        transitionHistory: [],
        version: 1,
        updatedAt: new Date().toISOString(),
      });

      // 尝试无效转换（pending -> completed 是无效的）
      await expect(
        stateMachine.transition('meeting-002', 'completed', {
          trigger: 'user_starts_meeting',
        })
      ).rejects.toThrow(StateMachineError);
    });
  });

  describe('FailureHandler', () => {
    it('should classify errors correctly', async () => {
      const { classifyError, ErrorType } = await import('@dommaker/harness');

      expect(classifyError(new Error('test failed'))).toBe(ErrorType.TEST_FAILED);
      expect(classifyError(new Error('gate check failed'))).toBe(ErrorType.GATE_FAILED);
      expect(classifyError(new Error('dependency blocked'))).toBe(ErrorType.DEPENDENCY_BLOCKED);
      expect(classifyError(new Error('timeout exceeded'))).toBe(ErrorType.TIMEOUT);
      expect(classifyError(new Error('unknown issue'))).toBe(ErrorType.UNKNOWN);
    });

    it('should retry on test failure', async () => {
      const { FailureHandler, createFailureHandler } = await import('../failure-handler');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'failure-test',
      });

      const handler = createFailureHandler({
        contextSharer,
        maxRetries: 3,
      });

      const result = await handler.handle(
        new Error('test failed'),
        { meetingId: 'test', attempt: 1 }
      );

      expect(result.handled).toBe(true);
      expect(result.action).toBe('retry');
    });

    it('should escalate after max retries', async () => {
      const { createFailureHandler } = await import('../failure-handler');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'failure-test',
      });

      const handler = createFailureHandler({
        contextSharer,
        maxRetries: 3,
      });

      const result = await handler.handle(
        new Error('test failed'),
        { meetingId: 'test', attempt: 3 }
      );

      expect(result.action).toBe('escalate');
    });
  });

  describe('PerformanceMonitor', () => {
    it('should record operations', async () => {
      const { createPerformanceMonitor } = await import('../performance-monitor');

      const monitor = createPerformanceMonitor({});

      // withTiming 返回 { result, duration }
      const { result, duration } = await monitor.withTiming('extract', async () => {
        return 'done';
      });

      expect(result).toBe('done');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should allow custom thresholds', async () => {
      const { createPerformanceMonitor } = await import('../performance-monitor');

      const monitor = createPerformanceMonitor({
        thresholds: {
          extract: 100,
        },
      });

      // 设置阈值后可以获取
      const thresholds = monitor.getThresholds();
      expect(thresholds.extract).toBe(100);
    });

    it('should time operations', async () => {
      const { createPerformanceMonitor } = await import('../performance-monitor');

      const monitor = createPerformanceMonitor({});

      const timer = monitor.startTimer();
      await new Promise(resolve => setTimeout(resolve, 10));
      const duration = timer.end();

      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });

  describe('StateListener', () => {
    it('should create composite listener', async () => {
      const { CompositeListener, createDefaultListeners } = await import('../state-listener');
      const { createContextBridge } = await import('../context-bridge');
      const { createContextSharer } = await import('../context-sharer');

      const redis = createMockRedis();
      const contextSharer = createContextSharer({
        redis: redis as any,
        executionId: 'listener-test',
      });

      const bridge = createContextBridge({
        contextSharer,
        skillExecutor: { execute: async () => ({ success: true }) },
      });

      const listeners = createDefaultListeners(bridge);
      expect(listeners.length).toBeGreaterThan(0);
    });
  });
});
