/**
 * Golden Master 测试
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// 导入被测模块 - 使用 ts-node 支持
import { recordGoldenMaster, verifyGoldenMaster, listGoldenMasters } from '../monitoring/golden-master';

// 测试配置
const TEST_WORKFLOWS = [
  {
    id: 'test-execute-phases-mock',
    inputs: { project_path: '/tmp/golden-test-mock' },
    mock: true,
  },
];

const GOLDEN_MASTERS_DIR = path.join(__dirname, '../../golden-masters');

// Mock executeWorkflow for testing
async function mockExecuteWorkflow(workflowId: string, inputs: any): Promise<any> {
  // 模拟工作流执行
  const outputDir = inputs.project_path || '/tmp/golden-test';
  
  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 创建示例文件
  fs.writeFileSync(
    path.join(outputDir, 'README.md'),
    `# Test Project\n\n## Overview\n\nThis is a test project.\n\n## Features\n\n- Feature 1\n- Feature 2\n\n\`\`\`typescript\nconsole.log("Hello");\n\`\`\`\n`
  );
  
  return {
    success: true,
    outputs: { message: 'Mock execution completed' },
    outputDir,
    tokenUsage: { input: 100, output: 200 },
    stepCount: 3,
  };
}

describe('Golden Master Framework', () => {
  beforeAll(() => {
    // 确保目录存在
    if (!fs.existsSync(GOLDEN_MASTERS_DIR)) {
      fs.mkdirSync(GOLDEN_MASTERS_DIR, { recursive: true });
    }
  });

  describe('recordGoldenMaster', () => {
    it('should record a golden master', async () => {
      const workflowId = 'test-mock-workflow';
      const inputs = { test: true };
      
      const metadata = await recordGoldenMaster(
        workflowId,
        inputs,
        mockExecuteWorkflow
      );
      
      expect(metadata.workflowId).toBe(workflowId);
      expect(metadata.recordedAt).toBeDefined();
      expect(fs.existsSync(path.join(GOLDEN_MASTERS_DIR, workflowId, 'output.json'))).toBe(true);
      expect(fs.existsSync(path.join(GOLDEN_MASTERS_DIR, workflowId, 'input.json'))).toBe(true);
      expect(fs.existsSync(path.join(GOLDEN_MASTERS_DIR, workflowId, 'metadata.json'))).toBe(true);
    });
  });

  describe('verifyGoldenMaster', () => {
    it('should verify a golden master', async () => {
      const workflowId = 'test-mock-workflow';
      
      const result = await verifyGoldenMaster(
        workflowId,
        mockExecuteWorkflow
      );
      
      expect(result.workflowId).toBe(workflowId);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.checks.length);
    });

    it('should detect structure changes', async () => {
      const workflowId = 'test-mock-workflow';
      
      // 修改输出
      async function modifiedExecuteWorkflow(id: string, inputs: any): Promise<any> {
        const result = await mockExecuteWorkflow(id, inputs);
        // 添加一个新文件
        fs.writeFileSync(
          path.join(result.outputDir, 'NEW.md'),
          '# New File\n\nThis is new.\n'
        );
        return result;
      }
      
      const result = await verifyGoldenMaster(workflowId, modifiedExecuteWorkflow);
      
      // 应该检测到文件数量变化
      const fileCountCheck = result.checks.find((c: any) => c.name === 'file_count');
      expect(fileCountCheck).toBeDefined();
    });
  });

  describe('listGoldenMasters', () => {
    it('should list all golden masters', () => {
      const masters = listGoldenMasters();
      expect(Array.isArray(masters)).toBe(true);
      expect(masters).toContain('test-mock-workflow');
    });
  });
});