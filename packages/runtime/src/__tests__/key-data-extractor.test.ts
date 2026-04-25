/**
 * key-data-extractor 测试
 */

import { extractKeyData, KeyData } from '../core/key-data-extractor';
import { StepDefinition, StepOutput } from '../core/types';

describe('extractKeyData', () => {
  
  // ========== JSON 解析测试 ==========
  
  describe('JSON parsing', () => {
    it('should extract from direct JSON output', () => {
      const output = JSON.stringify({
        files_changed: ['src/index.ts', 'src/utils.ts'],
        commit_hash: 'abc1234',
        tests_passed: true,
        summary: 'Added utility functions'
      });
      
      const result = extractKeyData(output);
      
      expect(result.files_changed).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(result.commit_hash).toBe('abc1234');
      expect(result.tests_passed).toBe(true);
      expect(result.summary).toBe('Added utility functions');
    });
    
    it('should extract from JSON in code block', () => {
      const output = `
Here are the results:

\`\`\`json
{
  "files_changed": ["src/test.ts"],
  "tests_passed_count": 5,
  "tests_failed_count": 0
}
\`\`\`
      `;
      
      const result = extractKeyData(output);
      
      expect(result.files_changed).toEqual(['src/test.ts']);
      expect(result.tests_passed_count).toBe(5);
      expect(result.tests_failed_count).toBe(0);
    });
    
    it('should handle nested JSON object', () => {
      const output = `
Output: {"files": ["a.ts", "b.ts"], "commit": "def5678"}
      `;
      
      const result = extractKeyData(output);
      
      // 别名映射：files → files_changed, commit → commit_hash
      expect(result.files_changed).toEqual(['a.ts', 'b.ts']);
      expect(result.commit_hash).toBe('def5678');
    });
  });
  
  // ========== 规则提取测试 ==========
  
  describe('rule extraction', () => {
    it('should extract files from text pattern', () => {
      const output = `
Created: src/new-file.ts
Modified: src/existing-file.ts
Deleted: src/old-file.ts
      `;
      
      const result = extractKeyData(output);
      
      expect(result.files_created).toBeDefined();
      expect(result.files_modified).toBeDefined();
      expect(result.files_deleted).toBeDefined();
    });
    
    it('should extract commit hash', () => {
      const output = `
Commit hash: a1b2c3d4e5f6
Committed successfully.
      `;
      
      const result = extractKeyData(output);
      
      expect(result.commit_hash).toBe('a1b2c3d4e5f6');
    });
    
    it('should extract test results', () => {
      const output = `
Tests: 10 passed, 2 failed
      `;
      
      const result = extractKeyData(output);
      
      expect(result.tests_passed_count).toBe(10);
      expect(result.tests_failed_count).toBe(2);
    });
    
    it('should extract status', () => {
      const output = `
Status: success
Task completed successfully.
      `;
      
      const result = extractKeyData(output);
      
      expect(result.status).toBe('success');
    });
    
    it('should extract error message', () => {
      const output = `
Error: Failed to compile src/main.ts
      `;
      
      const result = extractKeyData(output);
      
      expect(result.error_message).toContain('Failed to compile');
    });
  });
  
  // ========== StepOutput 定义匹配测试 ==========
  
  describe('step output definition', () => {
    it('should extract based on stepDef.outputs', () => {
      const output = `
custom_field: custom_value
files_changed: [src/a.ts]
      `;
      
      const stepDef: StepDefinition = {
        name: 'test-step',
        category: 'development',
        outputs: [
          { name: 'custom_field', type: 'string' }
        ],
        execute: { type: 'tool', tool: 'test' }
      };
      
      const result = extractKeyData(output, stepDef);
      
      expect(result.custom_field).toBe('custom_value');
    });
    
    it('should prioritize stepDef outputs over default rules', () => {
      const output = JSON.stringify({
        summary: 'Step-defined summary',
        files_changed: ['step-file.ts']
      });
      
      const stepDef: StepDefinition = {
        name: 'test-step',
        category: 'development',
        outputs: [
          { name: 'summary', type: 'string' },
          { name: 'files_changed', type: 'array' }
        ],
        execute: { type: 'tool', tool: 'test' }
      };
      
      const result = extractKeyData(output, stepDef);
      
      expect(result.summary).toBe('Step-defined summary');
      expect(result.files_changed).toEqual(['step-file.ts']);
    });
  });
  
  // ========== Summary 自动生成测试 ==========
  
  describe('summary generation', () => {
    it('should generate summary from keyData', () => {
      const output = JSON.stringify({
        files_changed: ['a.ts', 'b.ts', 'c.ts'],
        commit_hash: 'abc123',
        tests_passed: true
      });
      
      const result = extractKeyData(output);
      
      expect(result.summary).toContain('修改 3 个文件');
      expect(result.summary).toContain('提交 abc123');
      expect(result.summary).toContain('测试通过');
    });
    
    it('should use existing summary if provided', () => {
      const output = JSON.stringify({
        summary: 'User-provided summary',
        files_changed: ['a.ts']
      });
      
      const result = extractKeyData(output);
      
      expect(result.summary).toBe('User-provided summary');
    });
    
    it('should extract first important line for summary', () => {
      const output = `
Some log output
Some more logs
Completed: Feature implementation done
More logs after
      `;
      
      const result = extractKeyData(output);
      
      expect(result.summary).toContain('Completed');
    });
    
    it('should truncate long output for summary', () => {
      const output = 'A'.repeat(100);
      
      const result = extractKeyData(output);
      
      expect(result.summary?.length).toBeLessThanOrEqual(53); // 50 + '...'
    });
  });
  
  // ========== 边界情况测试 ==========
  
  describe('edge cases', () => {
    it('should handle empty output', () => {
      const result = extractKeyData('');
      
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
    
    it('should handle non-string output (object)', () => {
      const output = { files: ['test.ts'] };
      
      const result = extractKeyData(output);
      
      expect(result.files_changed).toEqual(['test.ts']);
    });
    
    it('should handle malformed JSON gracefully', () => {
      const output = `{ "files": ["a.ts", invalid json }`;
      
      const result = extractKeyData(output);
      
      // 应该不崩溃，尝试用规则提取
      expect(result).toBeDefined();
    });
    
    it('should handle output without recognizable patterns', () => {
      const output = `
This is just some random text
without any recognizable patterns
      `;
      
      const result = extractKeyData(output);
      
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
    });
    
    it('should not override existing values with undefined', () => {
      const output = JSON.stringify({
        files_changed: ['a.ts'],
        commit_hash: 'abc123'
      });
      
      const result = extractKeyData(output);
      
      // 只有明确匹配到的字段才设置
      expect(result.files_changed).toEqual(['a.ts']);
      expect(result.commit_hash).toBe('abc123');
      // 其他字段应该是 undefined
      expect(result.error_message).toBeUndefined();
    });
  });
  
  // ========== 类型转换测试 ==========
  
  describe('type conversion', () => {
    it('should convert boolean string correctly', () => {
      const output = 'Tests passed: true';
      
      const result = extractKeyData(output);
      
      expect(result.tests_passed).toBe(true);
    });
    
    it('should convert number string correctly', () => {
      const output = 'Passed: 15 tests';
      
      const result = extractKeyData(output);
      
      expect(result.tests_passed_count).toBe(15);
    });
    
    it('should convert array string correctly', () => {
      const output = 'files_changed: [a.ts, b.ts, c.ts]';
      
      const result = extractKeyData(output);
      
      expect(Array.isArray(result.files_changed)).toBe(true);
    });
  });
  
  // ========== 性能测试 ==========
  
  describe('performance', () => {
    it('should handle large output efficiently', () => {
      const largeOutput = 'Log line\n'.repeat(1000) + 
        JSON.stringify({ files_changed: ['test.ts'] });
      
      const start = Date.now();
      const result = extractKeyData(largeOutput);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // 应该在 100ms 内完成
      expect(result.files_changed).toEqual(['test.ts']);
    });
  });
});