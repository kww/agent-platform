/**
 * Spec Schema 入口
 * 
 * 导出 validate 函数供 @dommaker/harness 动态加载
 */

import { validateArchitecture, type ArchitectureValidationResult } from './architecture';
import { validateModule, type ModuleValidationResult } from './module';
import { validateApi, type ApiValidationResult } from './api';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';

export * from './architecture';
export * from './module';
export * from './api';

/**
 * Spec 类型
 */
export type SpecType = 'architecture' | 'module' | 'api';

/**
 * 验证结果（兼容 harness 的 SpecValidationResult）
 */
export interface SpecValidationResult {
  valid: boolean;
  file: string;
  type: SpecType;
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    path: string;
    message: string;
    severity: 'warning';
  }>;
  metrics?: Record<string, number>;
}

/**
 * Schema 名称
 */
export const name = 'agent-runtime-specs';

/**
 * Schema 版本
 */
export const version = '1.0.0';

/**
 * 检测 Spec 类型
 */
function detectSpecType(filePath: string): SpecType {
  const basename = path.basename(filePath).toLowerCase();
  
  if (basename === 'architecture.md') {
    return 'architecture';
  }
  
  if (filePath.includes('module') || filePath.includes('modules')) {
    return 'module';
  }
  
  if (filePath.includes('api') || filePath.includes('apis')) {
    return 'api';
  }
  
  return 'architecture'; // 默认
}

/**
 * 解析文件内容
 */
async function parseContent(content: string, filePath: string): Promise<unknown> {
  if (filePath.endsWith('.md')) {
    // Markdown 文件暂不解析，后续可添加 frontmatter 支持
    return { raw: content };
  }
  
  if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    return yaml.load(content);
  }
  
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  
  return { raw: content };
}

/**
 * 统一验证函数（供 harness 调用）
 * 
 * @param content 文件内容
 * @param filePath 文件路径
 * @returns 验证结果
 */
export async function validate(content: string, filePath: string): Promise<SpecValidationResult> {
  const specType = detectSpecType(filePath);
  
  try {
    const data = await parseContent(content, filePath);
    
    // 根据类型验证
    let result: ArchitectureValidationResult | ModuleValidationResult | ApiValidationResult;
    
    switch (specType) {
      case 'architecture':
        result = validateArchitecture(data);
        break;
      
      case 'module':
        result = validateModule(data);
        break;
      
      case 'api':
        result = validateApi(data);
        break;
      
      default:
        return {
          valid: false,
          file: filePath,
          type: specType,
          errors: [{
            path: '',
            message: `未知的 Spec 类型: ${specType}`,
            severity: 'error',
          }],
          warnings: [],
        };
    }
    
    return {
      valid: result.valid,
      file: filePath,
      type: specType,
      errors: result.errors.map(e => ({
        path: e.path,
        message: e.message,
        severity: 'error' as const,
      })),
      warnings: result.warnings.map(w => ({
        path: w.path,
        message: w.message,
        severity: 'warning' as const,
      })),
      metrics: 'metrics' in result ? result.metrics : undefined,
    };
  } catch (error) {
    return {
      valid: false,
      file: filePath,
      type: specType,
      errors: [{
        path: '',
        message: `解析失败: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
      }],
      warnings: [],
    };
  }
}

/**
 * 默认导出
 */
export default {
  name,
  version,
  validate,
};
