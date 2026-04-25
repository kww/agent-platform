/**
 * Module Schema
 * 
 * 定义模块的标准格式，用于：
 * - 模块级别的设计规范
 * - 模块间依赖检查
 * - 模块职责验证
 */

import { z } from 'zod';

/**
 * 接口定义
 */
export const InterfaceSchema = z.object({
  name: z.string().describe('接口名称'),
  type: z.enum(['public', 'internal', 'private']).describe('接口可见性'),
  description: z.string().optional().describe('接口说明'),
  methods: z.array(z.object({
    name: z.string(),
    params: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean().optional().default(true),
    })).optional(),
    returnType: z.string().optional(),
  })).optional().describe('方法列表'),
});

/**
 * 事件定义
 */
export const EventSchema = z.object({
  name: z.string().describe('事件名称'),
  type: z.enum(['emit', 'listen', 'both']).describe('事件类型'),
  payload: z.string().optional().describe('事件载荷类型'),
  description: z.string().optional().describe('事件说明'),
});

/**
 * 配置项定义
 */
export const ConfigSchema = z.object({
  name: z.string().describe('配置名称'),
  type: z.string().describe('配置类型'),
  required: z.boolean().optional().default(false),
  default: z.unknown().optional().describe('默认值'),
  description: z.string().optional().describe('配置说明'),
});

/**
 * 模块依赖关系（详细版）
 */
export const DependencySchema = z.object({
  module: z.string().describe('依赖模块名称'),
  type: z.enum(['import', 'inject', 'event', 'api']).describe('依赖类型'),
  interface: z.string().optional().describe('使用的接口'),
  description: z.string().optional().describe('依赖说明'),
  critical: z.boolean().optional().default(false).describe('是否关键依赖'),
});

/**
 * 模块完整 Schema
 */
export const ModuleDetailSchema = z.object({
  // 基本信息
  name: z.string().describe('模块名称'),
  path: z.string().describe('模块路径'),
  version: z.string().optional().describe('模块版本'),
  description: z.string().describe('模块描述'),
  
  // 职责
  responsibilities: z.array(z.string()).min(1).describe('模块职责列表'),
  
  // 接口
  interfaces: z.array(InterfaceSchema).optional().describe('暴露的接口'),
  
  // 事件
  events: z.array(EventSchema).optional().describe('模块事件'),
  
  // 依赖
  dependencies: z.array(DependencySchema).optional().describe('模块依赖'),
  
  // 配置
  config: z.array(ConfigSchema).optional().describe('模块配置'),
  
  // 限制
  constraints: z.object({
    maxDependencies: z.number().optional().describe('最大依赖数'),
    maxLines: z.number().optional().describe('最大代码行数'),
    allowedImports: z.array(z.string()).optional().describe('允许导入的模块'),
    forbiddenImports: z.array(z.string()).optional().describe('禁止导入的模块'),
  }).optional().describe('模块约束'),
  
  // 元数据
  metadata: z.object({
    owner: z.string().optional().describe('模块负责人'),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional(),
});

/**
 * 模块验证结果
 */
export interface ModuleValidationResult {
  valid: boolean;
  errors: Array<{
    path: string;
    message: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
  }>;
  metrics?: {
    responsibilityCount: number;
    interfaceCount: number;
    dependencyCount: number;
  };
}

/**
 * 验证模块定义
 */
export function validateModule(data: unknown): ModuleValidationResult {
  const result = ModuleDetailSchema.safeParse(data);
  
  if (result.success) {
    const warnings: ModuleValidationResult['warnings'] = [];
    const { data: module } = result;
    
    // 检查职责数量
    if (module.responsibilities.length > 5) {
      warnings.push({
        path: 'responsibilities',
        message: `职责过多（${module.responsibilities.length} 个），建议拆分模块`,
      });
    }
    
    // 检查依赖数量
    const depCount = module.dependencies?.length || 0;
    if (depCount > 10) {
      warnings.push({
        path: 'dependencies',
        message: `依赖过多（${depCount} 个），可能违反单一职责原则`,
      });
    }
    
    // 检查是否有接口
    const ifaceCount = module.interfaces?.length || 0;
    if (ifaceCount === 0) {
      warnings.push({
        path: 'interfaces',
        message: '模块没有定义任何接口，可能是内部模块',
      });
    }
    
    return {
      valid: true,
      errors: [],
      warnings,
      metrics: {
        responsibilityCount: module.responsibilities.length,
        interfaceCount: ifaceCount,
        dependencyCount: depCount,
      },
    };
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
