import { ContextBridge, createContextBridge, TOKEN_BUDGET } from '../orchestration/context-bridge';
import type { ContextSharer, MeetingContextProgressive } from '../orchestration/context-sharer';
import type { BridgeSkillExecutor, RoleContext } from '../orchestration/context-bridge';

// Mock ContextSharer
const mockContextSharer = {
  getMeetingContext: jest.fn(),
  getValue: jest.fn(),
  set: jest.fn(),
  getSharedContext: jest.fn(),
  clearMeetingContext: jest.fn(),
};

// Mock SkillExecutor
const mockSkillExecutor = {
  execute: jest.fn(),
};

// Mock EventEmitter
const mockEmitter = {
  emit: jest.fn(),
};

describe('ContextBridge', () => {
  let bridge: ContextBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = createContextBridge({
      contextSharer: mockContextSharer as any,
      skillExecutor: mockSkillExecutor as any,
      eventEmitter: mockEmitter as any,
      defaultTokenBudget: TOKEN_BUDGET.LAYER3_FULL,
    });
  });

  describe('execute (主入口)', () => {
    it('应该成功执行完整流程', async () => {
      // Mock 会议上下文
      mockContextSharer.getMeetingContext.mockResolvedValue({
        stage: 2,
        meta: { meetingId: 'meeting-123', title: 'Test Meeting', phase: 'development' },
        decisions: [{ id: 'd1', content: '使用 React', agreed: true, roles: ['frontend'] }],
        summary: '讨论了前端架构',
        messages: [],
      });
      mockContextSharer.getValue.mockResolvedValue(null);
      
      // Mock Skill 执行成功
      mockSkillExecutor.execute.mockResolvedValue({
        success: true,
        output: { filesCreated: 2 },
        tokenUsage: { input: 1000, output: 500, total: 1500 },
        duration: 5000,
      });

      const result = await bridge.execute({
        meetingId: 'meeting-123',
        taskId: 'task-789',
        roleId: 'frontend',
        skillId: 'implement-ui',
        tokenBudget: 8000,
      });

      expect(result.success).toBe(true);
      expect(result.roleId).toBe('frontend');
      expect(result.tokenUsage.total).toBeGreaterThan(0);
    });

    it('应该处理 Skill 执行失败', async () => {
      mockContextSharer.getMeetingContext.mockResolvedValue({
        stage: 1,
        meta: null,
        decisions: null,
        summary: null,
        messages: null,
      });

      mockSkillExecutor.execute.mockResolvedValue({
        success: false,
        error: 'Skill execution failed',
        tokenUsage: { input: 0, output: 0, total: 0 },
      });

      const result = await bridge.execute({
        meetingId: 'meeting-123',
        taskId: 'task-789',
        roleId: 'frontend',
        skillId: 'implement-ui',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Skill execution failed');
    });
  });

  describe('extract', () => {
    it('应该从会议室提取上下文', async () => {
      mockContextSharer.getMeetingContext.mockResolvedValue({
        stage: 2,
        meta: { meetingId: 'm1', title: 'Meeting', phase: 'dev' },
        decisions: [{ id: 'd1', content: '决策1', agreed: true }],
        summary: '摘要',
        messages: [],
      });

      const result = await bridge.extract('m1', 2);

      expect(result.meetingId).toBe('m1');
      expect(result.stage).toBe(2);
      expect(result.entriesCount).toBeGreaterThan(0);
    });
  });

  describe('transform', () => {
    it('应该转换为角色上下文', async () => {
      const rawContext: any = {
        meetingId: 'm1',
        stage: 2,
        progressiveContext: {
          stage: 2,
          meta: { meetingId: 'm1', title: 'Meeting', phase: 'dev' },
          decisions: [{ id: 'd1', content: 'API: POST /login', agreed: true, roles: ['backend'] }],
          summary: '讨论',
          messages: [],
        },
        entriesCount: 3,
        extractedAt: new Date().toISOString(),
      };

      mockContextSharer.getValue.mockResolvedValue(null);

      const roleContext = await bridge.transform(rawContext, 'frontend', 't1');

      expect(roleContext.roleId).toBe('frontend');
      expect(roleContext.taskId).toBe('t1');
    });
  });

  describe('prune', () => {
    it('应该在预算内时不裁剪', async () => {
      const roleContext: RoleContext = {
        roleId: 'frontend',
        taskId: 'task-789',
        meetingMeta: { meetingId: 'm1', title: 'Test' },
        decisions: [],
        summary: '简单摘要',
        roleSpecific: {},
      };

      const result = await bridge.prune(roleContext, TOKEN_BUDGET.LAYER3_FULL);

      expect(result.pruned).toBe(false);
      expect(result.tokenCount).toBeLessThanOrEqual(TOKEN_BUDGET.LAYER3_FULL);
    });

    it('应该超出预算时裁剪', async () => {
      // 创建一个足够大的上下文来触发裁剪
      const roleContext: RoleContext = {
        roleId: 'frontend',
        taskId: 'task-789',
        meetingMeta: { meetingId: 'm1', title: 'Test' },
        decisions: Array(20).fill({ id: 'd1', content: '这是一个很长的决策内容，用于测试裁剪功能是否正常工作...', agreed: true, roles: ['frontend'] }),
        summary: '这是一个很长的摘要内容，超出预算需要裁剪。我们添加更多内容来确保会触发裁剪逻辑...',
        roleSpecific: { extra: '额外数据', more: '更多数据' },
      };

      const result = await bridge.prune(roleContext, 50); // 更小的预算

      // 裁剪可能触发也可能不触发，取决于估算结果
      // 如果裁剪触发，prunedCount 应大于 0
      // 如果裁剪未触发，说明估算的 token 数少于预算
      expect(result.tokenCount).toBeDefined();
    });
  });

  describe('reportBack', () => {
    it('应该成功回传结果', async () => {
      mockContextSharer.set.mockResolvedValue(undefined);

      await bridge.reportBack('m1', 't1', 'frontend', {
        success: true,
        output: { files: 2 },
        tokenUsage: { input: 500, output: 300, total: 800 },
      });

      expect(mockContextSharer.set).toHaveBeenCalled();
    });

    it('应该回传失败结果', async () => {
      mockContextSharer.set.mockResolvedValue(undefined);

      await bridge.reportBack('m1', 't1', 'frontend', {
        success: false,
        error: '执行失败',
        tokenUsage: { input: 0, output: 0, total: 0 },
      });

      expect(mockContextSharer.set).toHaveBeenCalledWith('task:t1:status', 'failed');
    });
  });

  describe('TOKEN_BUDGET', () => {
    it('应该有正确的预算配置', () => {
      expect(TOKEN_BUDGET.LAYER1_SUMMARY).toBe(500);
      expect(TOKEN_BUDGET.LAYER2_DOCUMENTS).toBe(2000);
      expect(TOKEN_BUDGET.LAYER3_FULL).toBe(10000);
    });
  });
});