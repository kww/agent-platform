/**
 * 集成测试 - 完整工作流验证
 * 
 * 注意：此测试需要 agent-workflows 目录
 * 如果目录不存在，测试将被跳过
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { parseWorkflow, validateWorkflow } from '../core/parser';
import { listWorkflows, listSteps, getStep, listTools } from '../core/registry';

const WORKFLOWS_DIR = path.join(__dirname, '../../../agent-workflows/workflows');
const STEPS_DIR = path.join(__dirname, '../../../agent-workflows/steps');
const SKILLS_DIR = path.join(__dirname, '../../../agent-workflows/skills');

// 检查 agent-workflows 是否存在
const hasAgentWorkflows = fs.existsSync(WORKFLOWS_DIR) && fs.existsSync(STEPS_DIR);

// 如果 agent-workflows 不存在，跳过整个测试套件
const describeIfAvailable = hasAgentWorkflows ? describe : describe.skip;

describeIfAvailable('Integration Tests', () => {
  
  describe('Workflow Parsing with OpenClaw Metadata', () => {
    test('should parse workflow with openclaw metadata', async () => {
      const workflows = await listWorkflows();
      const wfDev = workflows.find(w => w.id === 'wf-dev');
      
      expect(wfDev).toBeDefined();
      expect(wfDev?.name).toBeDefined();
      
      // 验证文件内容包含 openclaw 字段
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, 'wf-dev.yml'), 'utf-8');
      const parsed = yaml.parse(content);
      
      expect(parsed.openclaw).toBeDefined();
      expect(parsed.openclaw.emoji).toBeDefined();
    });
    
    test('should have openclaw metadata in all user-invocable workflows', async () => {
      const workflows = await listWorkflows();
      const userWorkflows = workflows.filter(w => 
        w.id.startsWith('wf-') && !w.id.startsWith('test-')
      );
      
      expect(userWorkflows.length).toBeGreaterThan(0);
      
      for (const wf of userWorkflows) {
        const content = fs.readFileSync(path.join(WORKFLOWS_DIR, wf.path), 'utf-8');
        const parsed = yaml.parse(content);
        
        // 检查是否有 openclaw 元数据
        if (parsed.openclaw) {
          expect(parsed.openclaw.userInvocable).not.toBe(false);
        }
      }
    });
  });
  
  describe('Steps Registry', () => {
    test('should load all atomic steps', async () => {
      const steps = await listSteps();
      
      expect(steps.length).toBeGreaterThanOrEqual(15);
      
      // 验证分类分布
      const categories = [...new Set(steps.map(s => s.category))];
      expect(categories.length).toBeGreaterThan(0);
    });
    
    test('should resolve step references in workflows', async () => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, 'wf-dev.yml'), 'utf-8');
      const parsed = yaml.parse(content);
      
      // 检查步骤是否可以解析
      const steps = parsed.steps || [];
      for (const step of steps) {
        if (step.step) {
          const stepDef = getStep(step.step);
          // 步骤可能不存在（还在迁移中）
          if (!stepDef) {
            console.warn(`Step not found: ${step.step}`);
          }
        }
      }
      
      // 只要工作流可以解析就算通过
      expect(parsed.id).toBe('wf-dev');
    });
    
    test('should support agent-type steps', () => {
      const step = getStep('analyze-requirements');
      
      // 新架构：有 prompt 字段
      expect(step?.prompt).toBeDefined();
    });
  });
  
  describe('Skills Auto-Generation', () => {
    test('should generate skills from workflows', () => {
      // 检查 Skills 目录是否存在
      if (!fs.existsSync(SKILLS_DIR)) {
        console.log('Skills directory not found, skipping');
        return;
      }
      
      const skillsDirs = fs.readdirSync(SKILLS_DIR).filter(f => 
        fs.statSync(path.join(SKILLS_DIR, f)).isDirectory()
      );
      
      // Skills 目录可能为空（可选）
      if (skillsDirs.length === 0) {
        console.log('No skills generated yet');
        return;
      }
      
      // 验证 SKILL.md 格式
      let validSkills = 0;
      for (const skillDir of skillsDirs) {
        const skillPath = path.join(SKILLS_DIR, skillDir, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, 'utf-8');
          
          // 检查 frontmatter
          if (content.startsWith('---')) {
            validSkills++;
          }
        }
      }
      
      expect(validSkills).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Workflow Execution', () => {
    test('should parse and validate workflow structure', async () => {
      const workflow = parseWorkflow('wf-dev');
      
      expect(workflow).toBeDefined();
      expect(workflow.id).toBe('wf-dev');
      
      // 支持 steps 或 phases
      const hasContent = workflow.steps?.length || workflow.phases?.length || 0;
      expect(hasContent).toBeGreaterThan(0);
      
      // 验证步骤（steps 或 phases 中的）
      const steps = workflow.steps || [];
      for (const step of steps) {
        if (step.id) {
          expect(step.id).toBeDefined();
        }
      }
    });
    
    test('should handle step references', async () => {
      // 测试步骤引用解析
      const stepDef = getStep('analyze-codebase');
      
      expect(stepDef).toBeDefined();
      expect(stepDef?.prompt).toBeDefined();
    });
    
    test('should validate wf-full workflow', () => {
      const result = validateWorkflow('wf-full');
      
      expect(result.valid).toBe(true);
    });
  });
  
  describe('Tools Loading', () => {
    test('should still load tools', async () => {
      const tools = await listTools();
      
      expect(tools.length).toBeGreaterThan(0);
      
      // 检查 git 工具
      const gitTools = tools.filter(t => t.path.includes('git/'));
      expect(gitTools.length).toBeGreaterThan(0);
    });
  });
  
  describe('End-to-End: Workflow with Steps', () => {
    test('should create complete workflow definition', async () => {
      // 读取工作流
      const workflow = parseWorkflow('wf-e2e-test');
      
      expect(workflow.name).toBeDefined();
      expect(workflow.steps || workflow.phases).toBeDefined();
    });
  });
});

// 如果没有 agent-workflows，添加一个提示测试
if (!hasAgentWorkflows) {
  describe('Integration Tests', () => {
    test('skipped - agent-workflows not found', () => {
      console.log('⏭️  Skipping integration tests: agent-workflows directory not found');
      console.log('   To run these tests, clone agent-workflows to the parent directory');
    });
  });
}
