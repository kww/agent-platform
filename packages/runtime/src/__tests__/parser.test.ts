/**
 * parser.ts 测试
 * 
 * 注意：此测试需要 agent-workflows 目录
 * 如果目录不存在，测试将被跳过
 */

import * as path from 'path';
import * as fs from 'fs';
import { parseWorkflow, parseTool, validateWorkflow } from '../core/parser';

// 检查 agent-workflows 是否存在
const workflowsPath = process.env.AGENT_WORKFLOWS_PATH || 
  path.resolve(__dirname, '../../../agent-workflows');
const hasAgentWorkflows = fs.existsSync(path.join(workflowsPath, 'workflows'));

// 如果 agent-workflows 不存在，跳过整个测试套件
const describeIfAvailable = hasAgentWorkflows ? describe : describe.skip;

describeIfAvailable('parseWorkflow', () => {
  it('should parse wf-dev workflow', () => {
    const workflow = parseWorkflow('wf-dev');
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('wf-dev');
    expect(workflow.name).toBeDefined();
    expect(workflow.steps).toBeDefined();
    expect(workflow.steps?.length || 0).toBeGreaterThan(0);
  });

  it('should throw error for non-existent workflow', () => {
    expect(() => parseWorkflow('non-existent')).toThrow('Workflow not found');
  });

  it('should parse wf-full workflow with phases', () => {
    const workflow = parseWorkflow('wf-full');
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('wf-full');
    // 新架构：支持 phases 字段
    expect(workflow.phases || workflow.steps).toBeDefined();
  });

  it('should parse wf-e2e-test workflow', () => {
    const workflow = parseWorkflow('wf-e2e-test');
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('wf-e2e-test');
  });
  
  it('should parse wf-planning workflow', () => {
    const workflow = parseWorkflow('wf-planning');
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('wf-planning');
  });
  
  it('should parse wf-review workflow', () => {
    const workflow = parseWorkflow('wf-review');
    
    expect(workflow).toBeDefined();
    expect(workflow.id).toBe('wf-review');
  });
});

describeIfAvailable('parseTool', () => {
  it('should parse file-read tool', () => {
    const tool = parseTool('file-read');
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('file-read');
    expect(tool.description).toBeDefined();
    expect(tool.input).toBeDefined();
  });

  it('should parse spawn-codex tool', () => {
    const tool = parseTool('spawn-codex');
    
    expect(tool).toBeDefined();
    expect(tool.name).toBe('spawn-codex');
  });

  it('should throw error for non-existent tool', () => {
    expect(() => parseTool('non-existent')).toThrow('Tool not found');
  });
});

describeIfAvailable('validateWorkflow', () => {
  it('should validate wf-dev workflow', () => {
    const result = validateWorkflow('wf-dev');
    
    expect(result.valid).toBe(true);
  });

  it('should validate wf-full workflow', () => {
    const result = validateWorkflow('wf-full');
    
    expect(result.valid).toBe(true);
  });
  
  it('should validate wf-e2e-test workflow', () => {
    const result = validateWorkflow('wf-e2e-test');
    
    expect(result.valid).toBe(true);
  });
  
  it('should validate wf-planning workflow', () => {
    const result = validateWorkflow('wf-planning');
    
    expect(result.valid).toBe(true);
  });
  
  it('should validate wf-review workflow', () => {
    const result = validateWorkflow('wf-review');
    
    expect(result.valid).toBe(true);
  });

  it('should fail validation for non-existent workflow', () => {
    const result = validateWorkflow('non-existent');
    
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
  });
});

// 如果没有 agent-workflows，添加一个提示测试
if (!hasAgentWorkflows) {
  describe('Parser Tests', () => {
    it('skipped - agent-workflows not found', () => {
      console.log('⏭️  Skipping parser tests: agent-workflows directory not found');
    });
  });
}
