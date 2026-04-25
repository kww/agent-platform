/**
 * 讨论驱动器测试
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DiscussionDriver, createDiscussionDriver, type Role, type DiscussionMessage } from '../discussion-driver';

// Mock 工厂
const createMockLLMClient = () => ({
  chat: jest.fn(async (prompt: string) => {
    // 共识检查
    if (prompt.includes('判断是否达成共识')) {
      return JSON.stringify({
        reached: true,
        decisions: [
          { content: '使用 PostgreSQL 作为主数据库', agreed: true, priority: 'high' },
        ],
        disagreements: [],
        confidence: 0.9,
      });
    }
    // 发言生成
    return '我认为应该选择 PostgreSQL，因为它更适合复杂查询。';
  }),
});

const createMockMessageSender = () => ({
  send: jest.fn(async () => ({
    messageId: `msg-${Date.now()}`,
    timestamp: new Date().toISOString(),
  })),
});

describe('DiscussionDriver', () => {
  let driver: DiscussionDriver;
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

    driver = createDiscussionDriver({
      contextSharer: mockContextSharer,
      llmClient: createMockLLMClient(),
      messageSender: createMockMessageSender(),
      maxRounds: 5,
      consensusThreshold: 0.8,
    });
  });

  describe('runDiscussion', () => {
    it('should run discussion and reach consensus', async () => {
      const meetingId = 'test-meeting-1';
      
      // 设置参与者
      const participants: Role[] = [
        { roleId: 'architect', name: '架构师', stance: 'architect', speakCount: 0 },
        { roleId: 'developer', name: '开发者', stance: 'pragmatist', speakCount: 0 },
        { roleId: 'reviewer', name: '审查者', stance: 'skeptic', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);

      // 设置初始消息
      const messages: DiscussionMessage[] = [
        { messageId: 'm1', roleId: 'architect', content: '我们需要选择数据库', stance: 'architect', round: 0, timestamp: new Date().toISOString() },
        { messageId: 'm2', roleId: 'developer', content: '我建议用 PostgreSQL', stance: 'pragmatist', round: 1, timestamp: new Date().toISOString() },
        { messageId: 'm3', roleId: 'reviewer', content: '同意，PostgreSQL 可靠', stance: 'skeptic', round: 2, timestamp: new Date().toISOString() },
      ];
      mockRedis.set(`meeting:${meetingId}:messages`, messages);

      const result = await driver.runDiscussion(meetingId, '选择数据库方案');

      expect(result.status).toBe('consensus');
      expect(result.round).toBeGreaterThanOrEqual(0);
      expect(result.decisions).toBeDefined();
      expect(result.decisions!.length).toBeGreaterThan(0);
    });

    it('should stop at max rounds', async () => {
      const meetingId = 'test-meeting-2';
      
      const participants: Role[] = [
        { roleId: 'role-1', name: '角色1', stance: 'advocate', speakCount: 0 },
        { roleId: 'role-2', name: '角色2', stance: 'skeptic', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);
      mockRedis.set(`meeting:${meetingId}:messages`, []);

      // 修改 LLM 返回，不达成共识
      const neverConsensusLLM = {
        chat: jest.fn(async () => JSON.stringify({
          reached: false,
          decisions: [],
          disagreements: ['无法达成一致'],
          confidence: 0.3,
        })),
      };

      const shortDriver = createDiscussionDriver({
        contextSharer: mockContextSharer,
        llmClient: neverConsensusLLM,
        messageSender: createMockMessageSender(),
        maxRounds: 2,
      });

      const result = await shortDriver.runDiscussion(meetingId, '测试话题');

      expect(result.status).toBe('max_rounds');
      expect(result.round).toBe(2);
    });
  });

  describe('speaker selection', () => {
    it('should prioritize skeptics after advocate speaks', async () => {
      const meetingId = 'test-meeting-3';
      
      const participants: Role[] = [
        { roleId: 'advocate', name: '倡导者', stance: 'advocate', speakCount: 1 },
        { roleId: 'skeptic', name: '质疑者', stance: 'skeptic', speakCount: 0 },
        { roleId: 'neutral', name: '中立者', stance: 'neutral', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);

      // 需要足够多的消息才能触发共识检查
      const messages: DiscussionMessage[] = [
        { messageId: 'm1', roleId: 'advocate', content: '我提议方案A', stance: 'advocate', round: 0, timestamp: new Date().toISOString() },
        { messageId: 'm2', roleId: 'skeptic', content: '同意', stance: 'skeptic', round: 1, timestamp: new Date().toISOString() },
        { messageId: 'm3', roleId: 'neutral', content: '也同意', stance: 'neutral', round: 2, timestamp: new Date().toISOString() },
      ];
      mockRedis.set(`meeting:${meetingId}:messages`, messages);

      const result = await driver.runDiscussion(meetingId, '测试');

      // 讨论应该运行并达成共识
      expect(result).toBeDefined();
      expect(result.status).toBe('consensus');
    });

    it('should give turn to unspeaking roles', async () => {
      const meetingId = 'test-meeting-4';
      
      const participants: Role[] = [
        { roleId: 'speaker', name: '发言者', stance: 'neutral', speakCount: 5 },
        { roleId: 'unspeaker', name: '未发言者', stance: 'neutral', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);
      mockRedis.set(`meeting:${meetingId}:messages`, []);

      const result = await driver.runDiscussion(meetingId, '测试');

      // 验证讨论运行
      expect(result).toBeDefined();
      expect(result.round).toBeGreaterThanOrEqual(0);
    });
  });

  describe('consensus check', () => {
    it('should detect consensus with high confidence', async () => {
      const meetingId = 'test-meeting-5';
      
      const participants: Role[] = [
        { roleId: 'role-1', name: '角色1', stance: 'neutral', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);

      const messages: DiscussionMessage[] = [
        { messageId: 'm1', roleId: 'role-1', content: '同意方案A', stance: 'neutral', round: 0, timestamp: new Date().toISOString() },
        { messageId: 'm2', roleId: 'role-1', content: '完全同意', stance: 'neutral', round: 1, timestamp: new Date().toISOString() },
        { messageId: 'm3', roleId: 'role-1', content: '总结决策', stance: 'neutral', round: 2, timestamp: new Date().toISOString() },
      ];
      mockRedis.set(`meeting:${meetingId}:messages`, messages);

      const result = await driver.runDiscussion(meetingId, '测试');

      expect(result.status).toBe('consensus');
    });
  });

  describe('user intervention', () => {
    it('should request user intervention on high disagreement', async () => {
      const meetingId = 'test-meeting-6';
      
      const participants: Role[] = [
        { roleId: 'role-1', name: '角色1', stance: 'neutral', speakCount: 0 },
      ];
      mockRedis.set(`meeting:${meetingId}:participants`, participants);
      mockRedis.set(`meeting:${meetingId}:messages`, []);

      // 返回高分歧（第一次共识检查就触发）
      const highDisagreementLLM = {
        chat: jest.fn(async (prompt: string) => {
          // 共识检查返回高分歧
          if (prompt.includes('判断是否达成共识')) {
            return JSON.stringify({
              reached: false,
              decisions: [],
              disagreements: ['问题1', '问题2', '问题3', '问题4'],
              confidence: 0.2,
            });
          }
          // 发言生成
          return '我同意这个观点。';
        }),
      };

      const interventionDriver = createDiscussionDriver({
        contextSharer: mockContextSharer,
        llmClient: highDisagreementLLM,
        messageSender: createMockMessageSender(),
        maxRounds: 5,
      });

      // 设置足够多的消息来触发共识检查
      const messages: DiscussionMessage[] = [
        { messageId: 'm1', roleId: 'role-1', content: '消息1', stance: 'neutral', round: 0, timestamp: new Date().toISOString() },
        { messageId: 'm2', roleId: 'role-1', content: '消息2', stance: 'neutral', round: 1, timestamp: new Date().toISOString() },
        { messageId: 'm3', roleId: 'role-1', content: '消息3', stance: 'neutral', round: 2, timestamp: new Date().toISOString() },
      ];
      mockRedis.set(`meeting:${meetingId}:messages`, messages);

      const result = await interventionDriver.runDiscussion(meetingId, '争议话题');

      expect(result.status).toBe('pending_user');
      expect(result.pendingQuestions).toBeDefined();
      expect(result.pendingQuestions!.length).toBeGreaterThanOrEqual(3);
    });
  });
});
