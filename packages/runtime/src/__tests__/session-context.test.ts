/**
 * Workflow Session 上下文测试
 */

import { buildSessionPrompt } from '../core/executor';
import { SessionEntry } from '../core/types';

describe('buildSessionPrompt', () => {
  test('should return original prompt when no history', () => {
    const prompt = '原始任务描述';
    const result = buildSessionPrompt([], prompt);

    expect(result).toBe(prompt);
  });

  test('should return original prompt when history is null', () => {
    const prompt = '原始任务描述';
    const result = buildSessionPrompt(null as any, prompt);

    expect(result).toBe(prompt);
  });

  test('should build session prompt with single entry', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'analyze-requirements',
        stepName: '需求分析',
        phaseName: '分析阶段',
        output: '需求文档内容',
        timestamp: new Date()
      }
    ];

    const prompt = '设计架构';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('## 📋 前序步骤上下文');
    expect(result).toContain('[分析阶段] 需求分析');
    expect(result).toContain('输出: 需求文档内容');
    expect(result).toContain('## 🎯 当前任务');
    expect(result).toContain('设计架构');
  });

  test('should build session prompt with multiple entries', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'step1',
        stepName: '步骤1',
        output: '输出1',
        timestamp: new Date()
      },
      {
        stepId: 'step2',
        stepName: '步骤2',
        output: '输出2',
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('步骤1');
    expect(result).toContain('步骤2');
    expect(result).toContain('输出1');
    expect(result).toContain('输出2');
  });

  test('should handle object output', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'step1',
        stepName: '步骤1',
        output: { key: 'value', nested: { a: 1 } },
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('key');
    expect(result).toContain('value');
  });

  test('should truncate long output', () => {
    const longOutput = 'a'.repeat(600);
    const history: SessionEntry[] = [
      {
        stepId: 'step1',
        stepName: '步骤1',
        output: longOutput,
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('...(已截断)');
    expect(result.length).toBeLessThan(longOutput.length + 200);
  });

  test('should use summary when available', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'step1',
        stepName: '步骤1',
        summary: '这是摘要',
        output: '详细输出',
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('摘要: 这是摘要');
    expect(result).not.toContain('输出: 详细输出');
  });

  test('should handle entry without stepName', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'step-123',
        output: '输出',
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('step-123');
  });

  test('should handle phase name', () => {
    const history: SessionEntry[] = [
      {
        stepId: 'step1',
        stepName: '步骤1',
        phaseId: 'phase-1',
        phaseName: '设计阶段',
        output: '输出',
        timestamp: new Date()
      }
    ];

    const prompt = '当前任务';
    const result = buildSessionPrompt(history, prompt);

    expect(result).toContain('[设计阶段]');
  });
});
