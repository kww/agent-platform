/**
 * Spec 统一验证器
 * 
 * 提供统一的 Spec 验证入口
 */

import { 
  ArchitectureSchema, 
  validateArchitecture,
  type ArchitectureValidationResult 
} from './schemas/architecture';

import { 
  ModuleDetailSchema, 
  validateModule,
  type ModuleValidationResult 
} from './schemas/module';

import { 
  ApiSchema, 
  validateApi,
  type ApiValidationResult 
} from './schemas/api';

export { ArchitectureSchema, ModuleDetailSchema, ApiSchema };

/**
 * Spec 类型
 */
export type SpecType = 'architecture' | 'module' | 'api';

/**
 * 统一验证结果
 */
export interface SpecValidationResult {
  valid: boolean;
  type: SpecType;
  errors: Array<{
    path: string;
    message: string;
  }>;
  warnings: Array<{
    path: string;
    message: string;
  }>;
  metrics?: Record<string, number>;
}

/**
 * 验证 Spec
 * 
 * @param type Spec 类型
 * @param data Spec 数据
 * @returns 验证结果
 */
export function validateSpec(type: SpecType, data: unknown): SpecValidationResult {
  switch (type) {
    case 'architecture': {
      const result = validateArchitecture(data);
      return {
        valid: result.valid,
        type,
        errors: result.errors,
        warnings: result.warnings,
      };
    }
    
    case 'module': {
      const result = validateModule(data);
      return {
        valid: result.valid,
        type,
        errors: result.errors,
        warnings: result.warnings,
        metrics: result.metrics,
      };
    }
    
    case 'api': {
      const result = validateApi(data);
      return {
        valid: result.valid,
        type,
        errors: result.errors,
        warnings: result.warnings,
        metrics: result.metrics,
      };
    }
    
    default:
      return {
        valid: false,
        type,
        errors: [{ path: 'type', message: `未知的 Spec 类型: ${type}` }],
        warnings: [],
      };
  }
}

/**
 * 批量验证
 */
export function validateSpecs(specs: Array<{ type: SpecType; data: unknown }>): {
  valid: boolean;
  results: SpecValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
} {
  const results = specs.map(({ type, data }) => validateSpec(type, data));
  
  const passed = results.filter(r => r.valid).length;
  const warnings = results.reduce((sum, r) => sum + r.warnings.length, 0);
  
  return {
    valid: results.every(r => r.valid),
    results,
    summary: {
      total: specs.length,
      passed,
      failed: specs.length - passed,
      warnings,
    },
  };
}

/**
 * Spec 完整性检查
 */
export function checkSpecCompleteness(type: SpecType, data: unknown): {
  complete: boolean;
  missing: string[];
  optional: string[];
} {
  const missing: string[] = [];
  const optional: string[] = [];
  
  if (type === 'architecture') {
    const arch = data as Record<string, unknown>;
    if (!arch.description) optional.push('description');
    if (!arch.techStack) optional.push('techStack');
    if (!arch.decisions || (arch.decisions as unknown[])?.length === 0) {
      optional.push('decisions');
    }
  }
  
  if (type === 'module') {
    const mod = data as Record<string, unknown>;
    if (!mod.version) optional.push('version');
    if (!mod.interfaces || (mod.interfaces as unknown[])?.length === 0) {
      optional.push('interfaces');
    }
    if (!mod.config || (mod.config as unknown[])?.length === 0) {
      optional.push('config');
    }
  }
  
  if (type === 'api') {
    const api = data as Record<string, unknown>;
    if (!api.description) optional.push('description');
    if (!api.baseUrl) optional.push('baseUrl');
  }
  
  return {
    complete: missing.length === 0,
    missing,
    optional,
  };
}
