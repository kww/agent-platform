/**
 * API Schema
 * 
 * 定义 API 的标准格式，用于：
 * - API 设计规范
 * - 接口一致性检查
 * - 文档自动生成
 */

import { z } from 'zod';

/**
 * 参数位置
 */
export const ParamLocationSchema = z.enum(['path', 'query', 'header', 'body']);

/**
 * 参数定义
 */
export const ParamSchema = z.object({
  name: z.string().describe('参数名称'),
  type: z.string().describe('参数类型'),
  location: ParamLocationSchema.describe('参数位置'),
  required: z.boolean().optional().default(true),
  description: z.string().optional().describe('参数说明'),
  example: z.unknown().optional().describe('参数示例'),
  constraints: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
  }).optional().describe('参数约束'),
});

/**
 * 响应定义
 */
export const ResponseSchema = z.object({
  status: z.number().describe('HTTP 状态码'),
  description: z.string().optional().describe('响应说明'),
  body: z.object({
    type: z.string().describe('响应体类型'),
    schema: z.unknown().optional().describe('响应体 Schema'),
    example: z.unknown().optional().describe('响应示例'),
  }).optional(),
  headers: z.record(z.string()).optional().describe('响应头'),
});

/**
 * 错误定义
 */
export const ErrorSchema = z.object({
  code: z.string().describe('错误码'),
  message: z.string().describe('错误消息'),
  description: z.string().optional().describe('错误详情'),
});

/**
 * 认证类型
 */
export const AuthTypeSchema = z.enum(['none', 'bearer', 'apikey', 'oauth2', 'basic']);

/**
 * API 端点定义
 */
export const EndpointSchema = z.object({
  // 基本信息
  name: z.string().describe('端点名称'),
  path: z.string().describe('API 路径，如 /users/:id'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP 方法'),
  description: z.string().optional().describe('端点说明'),
  
  // 标签
  tags: z.array(z.string()).optional().describe('API 标签'),
  
  // 参数
  params: z.array(ParamSchema).optional().describe('参数列表'),
  
  // 请求体
  requestBody: z.object({
    type: z.string(),
    schema: z.unknown().optional(),
    example: z.unknown().optional(),
  }).optional().describe('请求体'),
  
  // 响应
  responses: z.array(ResponseSchema).min(1).describe('响应列表'),
  
  // 错误
  errors: z.array(ErrorSchema).optional().describe('错误列表'),
  
  // 认证
  auth: z.object({
    type: AuthTypeSchema,
    required: z.boolean().optional().default(true),
    scopes: z.array(z.string()).optional(),
  }).optional().describe('认证配置'),
  
  // 限制
  rateLimit: z.object({
    requests: z.number().describe('请求数'),
    window: z.number().describe('时间窗口（秒）'),
  }).optional().describe('速率限制'),
  
  // 弃用信息
  deprecated: z.object({
    since: z.string().describe('弃用版本'),
    removal: z.string().optional().describe('移除版本'),
    replacement: z.string().optional().describe('替代方案'),
  }).optional().describe('弃用信息'),
});

/**
 * API 文档完整 Schema
 */
export const ApiSchema = z.object({
  // 基本信息
  name: z.string().describe('API 名称'),
  version: z.string().describe('API 版本'),
  description: z.string().optional().describe('API 描述'),
  baseUrl: z.string().optional().describe('基础 URL'),
  
  // 端点
  endpoints: z.array(EndpointSchema).describe('端点列表'),
  
  // 认证
  auth: z.object({
    type: AuthTypeSchema,
    description: z.string().optional(),
  }).optional().describe('认证配置'),
  
  // 元数据
  metadata: z.object({
    author: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }).optional(),
});

/**
 * API 验证结果
 */
export interface ApiValidationResult {
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
    endpointCount: number;
    deprecatedCount: number;
    authRequiredCount: number;
  };
}

/**
 * 验证 API 定义
 */
export function validateApi(data: unknown): ApiValidationResult {
  const result = ApiSchema.safeParse(data);
  
  if (result.success) {
    const warnings: ApiValidationResult['warnings'] = [];
    const { data: api } = result;
    
    // 检查端点数量
    if (api.endpoints.length === 0) {
      warnings.push({
        path: 'endpoints',
        message: 'API 没有定义任何端点',
      });
    }
    
    // 检查弃用端点
    const deprecatedCount = api.endpoints.filter(e => e.deprecated).length;
    if (deprecatedCount > 0) {
      warnings.push({
        path: 'endpoints',
        message: `有 ${deprecatedCount} 个端点已弃用`,
      });
    }
    
    // 检查缺少认证的端点
    const noAuthCount = api.endpoints.filter(e => !e.auth || e.auth.type === 'none').length;
    if (noAuthCount > 0 && api.auth?.type !== 'none') {
      warnings.push({
        path: 'endpoints',
        message: `有 ${noAuthCount} 个端点没有配置认证`,
      });
    }
    
    return {
      valid: true,
      errors: [],
      warnings,
      metrics: {
        endpointCount: api.endpoints.length,
        deprecatedCount,
        authRequiredCount: api.endpoints.length - noAuthCount,
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
