import { resolveInput } from '../core/executor';
import { ExecutionContext, StepResult } from '../core/types';

describe('resolveInput', () => {
  let context: ExecutionContext;

  beforeEach(() => {
    context = {
      executionId: 'test-exec',
      workflow: {} as any,
      inputs: {
        requirement: 'test requirement',
        project_path: '/tmp/test'
      },
      outputs: {
        'requirements.md': '# Requirements',
        'architecture.md': '# Architecture'
      },
      steps: [
        {
          stepId: 'analyze-requirements',
          status: 'completed',
          output: '# Requirements\n\n## Feature A\n## Feature B'
        },
        {
          stepId: 'design-architecture',
          status: 'completed',
          output: {
            tech_stack: ['TypeScript', 'React'],
            modules: ['frontend', 'backend']
          }
        }
      ] as StepResult[],
      workdir: '/tmp/test',
      eventEmitter: {} as any
    };
  });

  describe('步骤输出引用', () => {
    it('应该解析 ${steps.xxx.output} 字符串输出', () => {
      const input = {
        requirements: '${steps.analyze-requirements.output}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.requirements).toBe('# Requirements\n\n## Feature A\n## Feature B');
    });

    it('应该解析 ${steps.xxx.output} 对象输出', () => {
      const input = {
        architecture: '${steps.design-architecture.output}'
      };
      
      const result = resolveInput(input, context);
      
      // 对象输出会被解析为对象
      expect(result.architecture.tech_stack).toContain('TypeScript');
      expect(result.architecture.tech_stack).toContain('React');
      expect(result.architecture.modules).toContain('frontend');
    });

    it('应该解析 ${steps.xxx.outputs.field} 深度引用', () => {
      const input = {
        tech_stack: '${steps.design-architecture.outputs.tech_stack}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.tech_stack).toContain('TypeScript');
    });

    it('步骤不存在时返回空字符串', () => {
      const input = {
        value: '${steps.non-existent.output}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.value).toBe('');
    });
  });

  describe('输入变量引用', () => {
    it('应该解析 {{inputs.xxx}} 格式', () => {
      const input = {
        req: '{{inputs.requirement}}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.req).toBe('test requirement');
    });

    it('应该解析 ${var} 简单格式', () => {
      const input = {
        path: '${project_path}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.path).toBe('/tmp/test');
    });
  });

  describe('输出变量引用', () => {
    it('应该解析 {{outputs.xxx}} 格式', () => {
      const input = {
        doc: '{{outputs.requirements.md}}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.doc).toBe('# Requirements');
    });
  });

  describe('嵌套对象处理', () => {
    it('应该递归处理嵌套对象', () => {
      const input = {
        config: {
          requirements: '${steps.analyze-requirements.output}',
          path: '{{inputs.project_path}}'
        }
      };
      
      const result = resolveInput(input, context);
      
      expect(result.config.requirements).toContain('Feature A');
      expect(result.config.path).toBe('/tmp/test');
    });
  });

  describe('混合变量', () => {
    it('应该正确处理混合变量格式', () => {
      const input = {
        text: 'Project: {{inputs.project_path}}, Req: ${steps.analyze-requirements.output}'
      };
      
      const result = resolveInput(input, context);
      
      expect(result.text).toContain('/tmp/test');
      expect(result.text).toContain('Feature A');
    });
  });
});
