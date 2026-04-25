/**
 * ContextBridge 测试
 */

import { ContextBridge, createContextBridge, TOKEN_BUDGET } from '../context-bridge';
import type { ContextSharer, MeetingMeta, MeetingContextProgressive } from '../context-sharer';

// Mock ContextSharer
const createMockContextSharer = () => {
  const data = new Map<string, any>();

  return {
    data,
    setTestData: (key: string, value: any) => data.set(key, value),
    set: jest.fn(async (key: string, value: any) => { data.set(key, value); }),
    getValue: jest.fn(async <T>(key: string): Promise<T | null> => data.get(key) ?? null),
    get: jest.fn(async (key: string) => {
      const value = data.get(key);
      return value ? { value } : null;
    }),
    getMeetingMeta: jest.fn(async (meetingId: string): Promise<MeetingMeta | null> => 
      data.get(`meeting:${meetingId}:meta`) ?? null
    ),
    getMeetingDecisions: jest.fn(async (meetingId: string) => 
      data.get(`meeting:${meetingId}:decisions`) ?? null
    ),
    getMeetingSummary: jest.fn(async (meetingId: string) => 
      data.get(`meeting:${meetingId}:summary`) ?? null
    ),
    getMeetingMessages: jest.fn(async (meetingId: string) => 
      data.get(`meeting:${meetingId}:messages`) ?? null
    ),
    getMeetingContext: jest.fn(async (meetingId: string, stage: 1 | 2 | 3 | 4): Promise<MeetingContextProgressive> => ({
      stage,
      meta: data.get(`meeting:${meetingId}:meta`) ?? null,
      decisions: data.get(`meeting:${meetingId}:decisions`) ?? null,
      summary: data.get(`meeting:${meetingId}:summary`) ?? null,
      messages: data.get(`meeting:${meetingId}:messages`) ?? null,
    })),
  } as any;
};

// Mock SkillExecutor
const createMockSkillExecutor = () => ({
  execute: jest.fn(async (config: any) => ({
    success: true,
    output: { result: 'mock-output' },
    tokenUsage: { input: 100, output: 50, total: 150 },
  })),
});

describe('ContextBridge', () => {
  let bridge: ContextBridge;
  let contextSharer: ReturnType<typeof createMockContextSharer>;
  let skillExecutor: ReturnType<typeof createMockSkillExecutor>;

  beforeEach(() => {
    contextSharer = createMockContextSharer();
    skillExecutor = createMockSkillExecutor();

    bridge = createContextBridge({
      contextSharer,
      skillExecutor,
    });
  });

  describe('extract', () => {
    it('should extract meeting context with stage 1', async () => {
      // 设置测试数据
      contextSharer.setTestData('meeting:test-123:meta', {
        meetingId: 'test-123',
        title: 'Test Meeting',
        startedAt: '2026-04-16T10:00:00Z',
      });

      const result = await bridge.extract('test-123', 1);

      expect(result.meetingId).toBe('test-123');
      expect(result.stage).toBe(1);
      expect(result.progressiveContext.meta).toBeTruthy();
      expect(result.progressiveContext.meta?.title).toBe('Test Meeting');
    });

    it('should extract decisions with stage 2', async () => {
      // 设置测试数据
      contextSharer.setTestData('meeting:test-123:meta', {
        meetingId: 'test-123',
        title: 'Test Meeting',
      });
      contextSharer.setTestData('meeting:test-123:decisions', [
        { id: 'd1', content: 'Use PostgreSQL', agreed: true },
        { id: 'd2', content: 'Use React', agreed: true },
      ]);

      const result = await bridge.extract('test-123', 2);

      expect(result.progressiveContext.decisions).toHaveLength(2);
      expect(result.entriesCount).toBeGreaterThan(0);
    });
  });

  describe('transform', () => {
    it('should transform to role context', async () => {
      const rawContext = {
        meetingId: 'test-123',
        stage: 2 as const,
        progressiveContext: {
          stage: 2 as const,
          meta: {
            meetingId: 'test-123',
            title: 'Test Meeting',
          },
          decisions: [
            { id: 'd1', content: 'API: /auth/login', agreed: true },
          ],
          summary: null,
          messages: null,
        },
        entriesCount: 2,
        extractedAt: '2026-04-16T10:00:00Z',
      };

      const roleContext = await bridge.transform(rawContext, 'frontend-dev', 'task-456');

      expect(roleContext.roleId).toBe('frontend-dev');
      expect(roleContext.taskId).toBe('task-456');
      expect(roleContext.meetingMeta?.title).toBe('Test Meeting');
      expect(roleContext.roleSpecific.apiContracts).toBeDefined();
    });
  });

  describe('prune', () => {
    it('should not prune if within budget', async () => {
      const roleContext = {
        roleId: 'frontend-dev',
        taskId: 'task-456',
        meetingMeta: { meetingId: 'test-123', title: 'Test' },
        decisions: [{ id: 'd1', content: 'Decision', agreed: true }],
        summary: 'Short summary',
        roleSpecific: {},
      };

      const result = await bridge.prune(roleContext, 10000);

      expect(result.pruned).toBe(false);
      expect(result.prunedCount).toBe(0);
    });

    it('should prune if exceeds budget', async () => {
      const roleContext = {
        roleId: 'frontend-dev',
        taskId: 'task-456',
        meetingMeta: { meetingId: 'test-123', title: 'Test' },
        decisions: [
          { id: 'd1', content: 'A'.repeat(10000), agreed: true },
          { id: 'd2', content: 'B'.repeat(10000), agreed: true },
        ],
        summary: 'S'.repeat(20000),
        roleSpecific: {},
      };

      const result = await bridge.prune(roleContext, 1000);

      expect(result.pruned).toBe(true);
      expect(result.prunedCount).toBeGreaterThan(0);
    });
  });

  describe('execute', () => {
    it('should execute skill agent with context', async () => {
      // 设置测试数据
      contextSharer.setTestData('meeting:test-123:meta', {
        meetingId: 'test-123',
        title: 'Test Meeting',
      });
      contextSharer.setTestData('meeting:test-123:decisions', [
        { id: 'd1', content: 'Use React', agreed: true },
      ]);

      const result = await bridge.execute({
        meetingId: 'test-123',
        taskId: 'task-456',
        roleId: 'frontend-dev',
        skillId: 'implement-ui',
        tokenBudget: 5000,
      });

      expect(result.success).toBe(true);
      expect(result.roleId).toBe('frontend-dev');
      expect(result.skillId).toBe('implement-ui');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
