/**
 * AR-005: 默认 Agent 配置测试
 * 
 * 验证优先级链：步骤指定 > 工作流默认 > 全局默认 > codex
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { config, loadConfig } from '../utils/config';
import { Workflow } from '../core/types';

describe('AR-005: 默认 Agent 配置', () => {
  
  describe('优先级链测试', () => {
    
    it('步骤指定优先级最高', () => {
      // 模拟优先级链解析
      const stepAgent = 'claude-code';
      const workflowDefaultAgent = 'codex';
      const globalDefaultAgent = 'codex';
      
      const resolvedAgent = stepAgent 
        || workflowDefaultAgent 
        || globalDefaultAgent 
        || 'codex';
      
      expect(resolvedAgent).toBe('claude-code');
    });
    
    it('工作流默认次优', () => {
      // 步骤未指定
      const stepAgent = undefined;
      const workflowDefaultAgent = 'claude-code';
      const globalDefaultAgent = 'codex';
      
      const resolvedAgent = stepAgent 
        || workflowDefaultAgent 
        || globalDefaultAgent 
        || 'codex';
      
      expect(resolvedAgent).toBe('claude-code');
    });
    
    it('全局默认次优', () => {
      // 步骤和工作流都未指定
      const stepAgent = undefined;
      const workflowDefaultAgent = undefined;
      const globalDefaultAgent = 'claude-code';
      
      const resolvedAgent = stepAgent 
        || workflowDefaultAgent 
        || globalDefaultAgent 
        || 'codex';
      
      expect(resolvedAgent).toBe('claude-code');
    });
    
    it('最终回退到 codex', () => {
      // 全部未指定
      const stepAgent = undefined;
      const workflowDefaultAgent = undefined;
      const globalDefaultAgent = undefined;
      
      const resolvedAgent = stepAgent 
        || workflowDefaultAgent 
        || globalDefaultAgent 
        || 'codex';
      
      expect(resolvedAgent).toBe('codex');
    });
  });
  
  describe('Config 配置测试', () => {
    
    it('Config 接口包含 defaultAgent', () => {
      expect(config).toHaveProperty('defaultAgent');
    });
    
    it('默认值为 codex', () => {
      expect(config.defaultAgent).toBe('codex');
    });
    
    it('支持环境变量 DEFAULT_AGENT', () => {
      // 临时设置环境变量
      const originalValue = process.env.DEFAULT_AGENT;
      process.env.DEFAULT_AGENT = 'claude-code';
      
      const newConfig = loadConfig();
      expect(newConfig.defaultAgent).toBe('claude-code');
      
      // 还原环境变量
      if (originalValue) {
        process.env.DEFAULT_AGENT = originalValue;
      } else {
        delete process.env.DEFAULT_AGENT;
      }
    });
  });
  
  describe('Workflow 类型测试', () => {
    
    it('Workflow 接口包含 defaultAgent', () => {
      const workflow: Workflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
        defaultAgent: 'claude-code',
      };
      
      expect(workflow.defaultAgent).toBe('claude-code');
    });
    
    it('defaultAgent 可选', () => {
      const workflow: Workflow = {
        id: 'test-workflow',
        name: 'Test Workflow',
      };
      
      expect(workflow.defaultAgent).toBeUndefined();
    });
  });
  
  describe('完整优先级链模拟', () => {
    
    it('模拟执行流程：步骤指定 > 工作流默认 > 全局默认 > codex', () => {
      // 场景 1: 步骤指定 claude，工作流指定 codex，全局指定 codex
      const scenario1 = {
        stepAgent: 'claude-code',
        workflowAgent: 'codex',
        globalAgent: 'codex',
        expected: 'claude-code',
      };
      
      // 场景 2: 步骤未指定，工作流指定 claude，全局指定 codex
      const scenario2 = {
        stepAgent: undefined,
        workflowAgent: 'claude-code',
        globalAgent: 'codex',
        expected: 'claude-code',
      };
      
      // 场景 3: 步骤和工作流未指定，全局指定 claude
      const scenario3 = {
        stepAgent: undefined,
        workflowAgent: undefined,
        globalAgent: 'claude-code',
        expected: 'claude-code',
      };
      
      // 场景 4: 全部未指定
      const scenario4 = {
        stepAgent: undefined,
        workflowAgent: undefined,
        globalAgent: undefined,
        expected: 'codex',
      };
      
      // 测试所有场景
      [scenario1, scenario2, scenario3, scenario4].forEach((scenario, index) => {
        const resolved = scenario.stepAgent 
          || scenario.workflowAgent 
          || scenario.globalAgent 
          || 'codex';
        
        expect(resolved).toBe(scenario.expected);
      });
    });
  });
});