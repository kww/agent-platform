/**
 * 代码解析测试
 */

import { codeParseHandler, codeFingerprintHandler } from '../core/builtin-handlers';
import * as fs from 'fs';
import * as path from 'path';

describe('Code Parse Handler', () => {
  const testDir = '/tmp/test-code-parse';
  
  beforeAll(() => {
    // 创建测试目录和文件
    fs.mkdirSync(testDir, { recursive: true });
    
    // TypeScript 测试文件
    fs.writeFileSync(path.join(testDir, 'example.ts'), `
import { foo } from './foo';
import { bar, baz } from 'external-lib';

export interface User {
  id: string;
  name: string;
}

export function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}

export const calculate = (a: number, b: number): number => {
  return a + b;
};

export class UserService {
  private users: User[] = [];
  
  addUser(user: User) {
    this.users.push(user);
  }
  
  getUser(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
`);
  });
  
  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });
  
  test('should parse TypeScript file', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    expect(result.success).toBe(true);
    expect(result.language).toBe('typescript');
    expect(result.functions.length).toBeGreaterThan(0);
    expect(result.classes.length).toBeGreaterThan(0);
    expect(result.imports.length).toBeGreaterThan(0);
    expect(result.exports.length).toBeGreaterThan(0);
  });
  
  test('should extract functions', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    const functionNames = result.functions.map((f: any) => f.name);
    expect(functionNames).toContain('greet');
    expect(functionNames).toContain('calculate');
  });
  
  test('should extract classes', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    const classNames = result.classes.map((c: any) => c.name);
    expect(classNames).toContain('UserService');
    
    const userService = result.classes.find((c: any) => c.name === 'UserService');
    expect(userService.methods.length).toBeGreaterThan(0);
  });
  
  test('should extract imports', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    const importSources = result.imports.map((i: any) => i.source);
    expect(importSources).toContain('./foo');
    expect(importSources).toContain('external-lib');
  });
  
  test('should extract exports', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    const exportNames = result.exports.map((e: any) => e.name);
    expect(exportNames).toContain('User');
    expect(exportNames).toContain('greet');
    expect(exportNames).toContain('UserService');
  });
  
  test('should generate content hash', async () => {
    const result = await codeParseHandler({
      file_path: 'example.ts',
      project_path: testDir,
    });
    
    expect(result.content_hash).toBeDefined();
    expect(result.content_hash.length).toBe(64); // SHA-256
  });
});

describe('Code Fingerprint Handler', () => {
  const testDir = '/tmp/test-code-fingerprint';
  
  beforeEach(() => {
    // 每个测试前重置
    fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(testDir, '.agent'), { recursive: true });
    
    fs.writeFileSync(path.join(testDir, 'module.ts'), `
export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
`);
  });
  
  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });
  
  test('should generate fingerprint', async () => {
    const result = await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    expect(result.success).toBe(true);
    expect(result.fingerprint).toBeDefined();
    expect(result.content_hash).toBeDefined();
  });
  
  test('should detect new file', async () => {
    const result = await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    expect(result.change_level).toBe('STRUCTURAL');
    expect(result.details).toContain('new file');
  });
  
  test('should detect no change', async () => {
    // 第一次生成指纹
    await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    // 第二次相同内容
    const result = await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    expect(result.change_level).toBe('NONE');
  });
  
  test('should detect cosmetic change', async () => {
    // 生成初始指纹
    await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    // 添加注释（非结构性变更）
    fs.writeFileSync(path.join(testDir, 'module.ts'), `
// This is a comment
export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}
`);
    
    const result = await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    expect(result.change_level).toBe('COSMETIC');
  });
  
  test('should detect structural change', async () => {
    // 生成初始指纹
    await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    // 添加新函数（结构性变更）
    fs.writeFileSync(path.join(testDir, 'module.ts'), `
export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}

export function goodbye(name: string): string {
  return \`Goodbye, \${name}!\`;
}
`);
    
    const result = await codeFingerprintHandler({
      file_path: 'module.ts',
      project_path: testDir,
    });
    
    expect(result.change_level).toBe('STRUCTURAL');
    expect(result.details.some((d: string) => d.includes('new function'))).toBe(true);
  });
});
