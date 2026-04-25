/**
 * ARCHITECTURE.md Schema
 * 
 * 定义架构文档的标准格式
 */

import { z } from 'zod';

/**
 * 模块依赖关系
 */
export const ModuleDependencySchema = z.object({
  name: z.string().describe('依赖模块名称'),
  type: z.enum(['sync', 'async', 'event']).describe('依赖类型'),
  description: z.string().optional().describe('依赖说明'),
});

/**
 * 模块定义（简化版）
 */
export const ModuleSchema = z.object({
  name: z.string().describe('模块名称'),
  path: z.string().describe('模块路径'),
  responsibilities: z.array(z.string()).describe('模块职责'),
  dependencies: z.array(ModuleDependencySchema).optional().describe('模块依赖'),
});

/**
 * 技术栈定义
 */
export const TechStackSchema = z.object({
  frontend: z.array(z.string()).optional().describe('前端技术栈'),
  backend: z.array(z.string()).optional().describe('后端技术栈'),
  database: z.array(z.string()).optional().describe('数据库'),
  infrastructure: z.array(z.string()).optional().describe('基础设施'),
});

/**
 * 架构决策记录（ADR）
 */
export const DecisionSchema = z.object({
  id: z.string().describe('决策 ID，如 ADR-001'),
  title: z.string().describe('决策标题'),
  status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']).describe('决策状态'),
  context: z.string().describe('决策背景'),
  decision: z.string().describe('决策内容'),
  consequences: z.string().describe('决策影响'),
  date: z.string().optional().describe('决策日期'),
});

/**
 * ARCHITECTURE.md 完整 Schema
 */
export const ArchitectureSchema = z.object({
  // 基本信息
  name: z.string().describe('项目名称'),
  version: z.string().describe('架构版本，如 1.0.0'),
  description: z.string().optional().describe('项目描述'),
  
  // 技术栈
  techStack: TechStackSchema.optional().describe('技术栈'),
  
  // 模块
  modules: z.array(ModuleSchema).describe('模块列表'),
  
  // 架构决策
  decisions: z.array(DecisionSchema).optional().describe('架构决策记录'),
  
  // 元数据
  metadata: z.object({
    author: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional().describe('元数据'),
});

/**
 * 架构文档验证结果
 */
export interface ArchitectureValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * 验证架构文档
 */
export function validateArchitecture(data: unknown): ArchitectureValidationResult {
  const result = ArchitectureSchema.safeParse(data);
  
  if (result.success) {
    const warnings: ArchitectureValidationResult['warnings'] = [];
    
    // 检查可选字段
    if (!result.data.description) {
      warnings.push({ path: 'description', message: '建议添加项目描述' });
    }
    if (!result.data.techStack) {
      warnings.push({ path: 'techStack', message: '建议定义技术栈' });
    }
    if (!result.data.decisions || result.data.decisions.length === 0) {
      warnings.push({ path: 'decisions', message: '建议记录架构决策' });
    }
    
    return { valid: true, errors: [], warnings };
  }
  
  return {
    valid: false,
    errors: result.error.errors.map(e => ({
      path: e.path.join('.'),
      message: e.message,
    })),
    warnings: [],
  };
}
