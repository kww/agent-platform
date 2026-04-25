import { FailureHandler } from '../orchestration/failure-handler';
import type { ContextSharer } from '../orchestration/context-sharer';
import { ErrorClassifier, ErrorType } from '@dommaker/harness';

// Mock ContextSharer
const mockContextSharer = {
  getMeetingContext: jest.fn(),
  getValue: jest.fn(),
  set: jest.fn(),
  getSharedContext: jest.fn(),
  clearMeetingContext: jest.fn(),
};

describe('FailureHandler', () => {
  let handler: FailureHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new FailureHandler({
      contextSharer: mockContextSharer as any,
      maxRetries: 3,
    });
  });

  // ============================================
  // 错误分类测试（使用 harness）
  // ============================================

  describe('错误分类', () => {
    it('应该正确分类测试错误', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Test assertion failed');
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe(ErrorType.TEST_FAILED);
    });

    it('应该正确分类网络错误', () => {
      const classifier = new ErrorClassifier();
      const error = new Error('Network timeout');
      
      const classification = classifier.classify(error);
      
      expect(classification.type).toBe(ErrorType.NETWORK_ERROR);
    });
  });

  // ============================================
  // 基础功能测试
  // ============================================

  describe('handle', () => {
    it('应该处理错误并返回结果', async () => {
      const error = new Error('Test error');
      
      const result = await handler.handle(error, {
        meetingId: 'm1',
        taskId: 't1',
        roleId: 'frontend',
        skillId: 'test',
      });

      expect(result).toBeDefined();
      expect(result.handled).toBe(true);
    });
  });
});