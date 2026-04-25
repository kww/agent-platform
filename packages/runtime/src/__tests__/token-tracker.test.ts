import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectTokenTracker, getProjectTokenTracker, CONTEXT_THRESHOLDS } from '../core/project-token-tracker';
import { MODEL_TOKEN_LIMITS } from '../core/token-tracker';

describe('ProjectTokenTracker', () => {
  let tempDir: string;
  let tracker: ProjectTokenTracker;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-tracker-test-'));
    tracker = new ProjectTokenTracker({
      projectPath: tempDir,
      projectName: 'test-project',
      maxRecentExecutions: 10,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('recordExecution', () => {
    it('should record execution with tokens', () => {
      const record = tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [
            { stepId: 'step-1', inputTokens: 2000, outputTokens: 500, totalTokens: 2500 },
            { stepId: 'step-2', inputTokens: 2000, outputTokens: 500, totalTokens: 2500 },
          ],
        },
      });

      expect(record.executionId).toBe('exec-001');
      expect(record.workflowType).toBe('development');
      expect(record.totalTokens).toBe(5000);
      expect(record.inputTokens).toBe(4000);
      expect(record.outputTokens).toBe(1000);
    });

    it('should update total stats', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [],
        },
      });

      const usage = tracker.getTotalUsage();
      expect(usage.executions).toBe(1);
      expect(usage.tokens).toBe(5000);
      expect(usage.duration).toBe(1000);
    });

    it('should categorize by workflow type', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-bugfix',
        duration: 500,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 3000,
          steps: [],
        },
      });

      const bugfixStats = tracker.getByWorkflowType('bugfix');
      expect(bugfixStats?.count).toBe(1);
      expect(bugfixStats?.totalTokens).toBe(3000);
    });

    it('should track step stats', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [
            { stepId: 'plan', inputTokens: 2000, outputTokens: 500, totalTokens: 2500 },
          ],
        },
      });

      const stepStats = tracker.getStepStatsSorted();
      expect(stepStats.length).toBeGreaterThan(0);
      expect(stepStats[0].stepId).toBe('plan');
      expect(stepStats[0].totalTokens).toBe(2500);
    });

    it('should limit recent executions', () => {
      for (let i = 0; i < 15; i++) {
        tracker.recordExecution({
          executionId: `exec-${i}`,
          workflowId: 'wf-full',
          duration: 100,
          tokenUsage: {
            model: 'claude-3-opus',
            used: 100,
            steps: [],
          },
        });
      }

      const recent = tracker.getRecentExecutions();
      expect(recent.length).toBe(10); // maxRecentExecutions = 10
    });
  });

  describe('getContextUsage', () => {
    it('should return normal status when usage is low', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 1000,
          steps: [],
        },
      });

      const usage = tracker.getContextUsage('claude-3-opus', 0);
      expect(usage.status).toBe('normal');
      expect(usage.percentage).toBeLessThan(CONTEXT_THRESHOLDS.normal);
    });

    it('should return warning status when usage is moderate', () => {
      // claude-3-sonnet limit = 200000
      // warning starts at 70%, so 140000 / 200000 = 70%
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 140000,
          steps: [],
        },
      });

      const usage = tracker.getContextUsage('claude-3-sonnet', 0);
      expect(usage.status).toBe('warning');
      expect(usage.percentage).toBeGreaterThanOrEqual(CONTEXT_THRESHOLDS.warning);
    });

    it('should return critical status when usage is high', () => {
      // 170000 / 200000 = 85%, should be critical
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 170000,
          steps: [],
        },
      });

      const usage = tracker.getContextUsage('claude-3-sonnet', 0);
      expect(usage.status).toBe('critical');
      expect(usage.percentage).toBeGreaterThanOrEqual(CONTEXT_THRESHOLDS.critical);
    });

    it('should return exceeded status when usage exceeds limit', () => {
      // 210000 / 200000 = 105%, capped to 100%, should be exceeded
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 210000,
          steps: [],
        },
      });

      const usage = tracker.getContextUsage('claude-3-sonnet', 0);
      expect(usage.status).toBe('exceeded');
      expect(usage.percentage).toBe(100); // capped at 100
    });

    it('should include current execution tokens', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 50000,
          steps: [],
        },
      });

      const usage = tracker.getContextUsage('claude-3-sonnet', 30000);
      expect(usage.currentExecutionTokens).toBe(30000);
      expect(usage.totalUsed).toBe(80000);
    });
  });

  describe('getRecommendedModel', () => {
    it('should return null when context is sufficient', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 1000,
          steps: [],
        },
      });

      const recommended = tracker.getRecommendedModel('claude-3-sonnet', 0);
      expect(recommended).toBeNull();
    });

    it('should recommend larger model when context exceeds', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 180000,
          steps: [],
        },
      });

      const recommended = tracker.getRecommendedModel('claude-3-sonnet', 0);
      expect(recommended).toBeTruthy();
      // claude-3-opus has larger context (200k vs 160k for sonnet)
      expect(recommended).toBe('claude-3-opus');
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 60000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [
            { stepId: 'plan', inputTokens: 2000, outputTokens: 500, totalTokens: 2500 },
          ],
        },
      });

      const report = tracker.generateReport();
      expect(report).toContain('# 📊 项目 Token 使用报告');
      expect(report).toContain('test-project');
      expect(report).toContain('总 Token');
      expect(report).toContain('消耗最多的步骤');
    });
  });

  describe('generateSummary', () => {
    it('should generate short summary', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 60000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [],
        },
      });

      const summary = tracker.generateSummary();
      expect(summary).toContain('📊 Token 总计:');
      expect(summary).toContain('5,000');
      expect(summary).toContain('1 次执行');
    });
  });

  describe('clear', () => {
    it('should clear all stats', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [],
        },
      });

      tracker.clear();

      const usage = tracker.getTotalUsage();
      expect(usage.executions).toBe(0);
      expect(usage.tokens).toBe(0);
    });
  });

  describe('merge', () => {
    it('should merge stats from another tracker', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [],
        },
      });

      const otherTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'other-tracker-'));
      const otherTracker = new ProjectTokenTracker({ projectPath: otherTempDir });
      otherTracker.recordExecution({
        executionId: 'exec-002',
        workflowId: 'wf-bugfix',
        duration: 500,
        tokenUsage: {
          model: 'claude-3-sonnet',
          used: 3000,
          steps: [],
        },
      });

      const otherStats = otherTracker.getStats();
      tracker.merge(otherStats);

      const usage = tracker.getTotalUsage();
      expect(usage.executions).toBe(2);
      expect(usage.tokens).toBe(8000);

      fs.rmSync(otherTempDir, { recursive: true, force: true });
    });
  });

  describe('persistence', () => {
    it('should save and load stats', () => {
      tracker.recordExecution({
        executionId: 'exec-001',
        workflowId: 'wf-full',
        duration: 1000,
        tokenUsage: {
          model: 'claude-3-opus',
          used: 5000,
          steps: [],
        },
      });

      // Create new tracker from same path
      const newTracker = new ProjectTokenTracker({ projectPath: tempDir });
      const usage = newTracker.getTotalUsage();
      expect(usage.executions).toBe(1);
      expect(usage.tokens).toBe(5000);
    });
  });
});

describe('getProjectTokenTracker', () => {
  it('should return same tracker for same path', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'singleton-test-'));
    
    const tracker1 = getProjectTokenTracker(tempDir);
    const tracker2 = getProjectTokenTracker(tempDir);
    
    expect(tracker1).toBe(tracker2);
    
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('MODEL_TOKEN_LIMITS', () => {
  it('should have limits for common models', () => {
    expect(MODEL_TOKEN_LIMITS['claude-3-opus']).toBeGreaterThan(0);
    expect(MODEL_TOKEN_LIMITS['claude-3-sonnet']).toBeGreaterThan(0);
    expect(MODEL_TOKEN_LIMITS['default']).toBeGreaterThan(0);
  });
});

describe('CONTEXT_THRESHOLDS', () => {
  it('should have correct threshold values', () => {
    expect(CONTEXT_THRESHOLDS.normal).toBe(50);
    expect(CONTEXT_THRESHOLDS.warning).toBe(70);
    expect(CONTEXT_THRESHOLDS.critical).toBe(85);
  });
});