/**
 * registry.ts 测试
 * 
 * 注意：此测试需要 agent-workflows 目录
 * 如果目录不存在，测试将被跳过
 */

import * as path from 'path';
import * as fs from 'fs';
import { listWorkflows, listTools } from '../core/registry';

// 检查 agent-workflows 是否存在
const workflowsPath = process.env.AGENT_WORKFLOWS_PATH || 
  path.resolve(__dirname, '../../../agent-workflows');
const hasAgentWorkflows = fs.existsSync(path.join(workflowsPath, 'workflows'));

// 如果 agent-workflows 不存在，跳过整个测试套件
const describeIfAvailable = hasAgentWorkflows ? describe : describe.skip;

describeIfAvailable('listWorkflows', () => {
  it('should list all workflows', async () => {
    const workflows = await listWorkflows();
    
    expect(workflows).toBeDefined();
    expect(workflows.length).toBeGreaterThan(0);
    
    // 检查必需字段
    const wf = workflows[0];
    expect(wf.id).toBeDefined();
    expect(wf.name).toBeDefined();
    expect(wf.path).toBeDefined();
  });

  it('should include wf-dev workflow', async () => {
    const workflows = await listWorkflows();
    const wfDev = workflows.find(w => w.id === 'wf-dev');
    
    expect(wfDev).toBeDefined();
    expect(wfDev?.name).toBeDefined();
  });
});

describeIfAvailable('listTools', () => {
  it('should list all tools', async () => {
    const tools = await listTools();
    
    expect(tools).toBeDefined();
    expect(tools.length).toBeGreaterThan(0);
    
    // 检查必需字段
    const tool = tools[0];
    expect(tool.name).toBeDefined();
    expect(tool.path).toBeDefined();
  });

  it('should include file-read tool', async () => {
    const tools = await listTools();
    const fileRead = tools.find(t => t.name === 'file-read');
    
    expect(fileRead).toBeDefined();
  });
});

// 如果没有 agent-workflows，添加一个提示测试
if (!hasAgentWorkflows) {
  describe('Registry Tests', () => {
    it('skipped - agent-workflows not found', () => {
      console.log('⏭️  Skipping registry tests: agent-workflows directory not found');
    });
  });
}
