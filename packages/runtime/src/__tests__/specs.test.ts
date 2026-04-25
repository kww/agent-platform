/**
 * Spec Schema 单元测试
 */

import { 
  ArchitectureSchema, 
  validateArchitecture,
  ModuleDetailSchema,
  validateModule,
  ApiSchema,
  validateApi,
  validateSpec,
  validateSpecs,
  checkSpecCompleteness,
} from '../specs';

describe('Architecture Schema', () => {
  it('should validate valid architecture', () => {
    const arch = {
      name: 'test-project',
      version: '1.0.0',
      modules: [
        {
          name: 'core',
          path: '/src/core',
          responsibilities: ['核心逻辑'],
        },
      ],
    };
    
    const result = validateArchitecture(arch);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
  
  it('should reject missing required fields', () => {
    const arch = {
      name: 'test-project',
      // missing version and modules
    };
    
    const result = ArchitectureSchema.safeParse(arch);
    expect(result.success).toBe(false);
  });
  
  it('should warn about missing optional fields', () => {
    const arch = {
      name: 'test-project',
      version: '1.0.0',
      modules: [],
    };
    
    const result = validateArchitecture(arch);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('Module Schema', () => {
  it('should validate valid module', () => {
    const module = {
      name: 'user-service',
      path: '/src/services/user',
      description: '用户服务模块',
      responsibilities: ['用户管理', '认证授权'],
    };
    
    const result = validateModule(module);
    expect(result.valid).toBe(true);
    expect(result.metrics?.responsibilityCount).toBe(2);
  });
  
  it('should warn about too many responsibilities', () => {
    const module = {
      name: 'kitchen-sink',
      path: '/src/kitchen-sink',
      description: '大杂烩模块',
      responsibilities: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    };
    
    const result = validateModule(module);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.path === 'responsibilities')).toBe(true);
  });
  
  it('should warn about too many dependencies', () => {
    const module = {
      name: 'coupled-module',
      path: '/src/coupled',
      description: '高耦合模块',
      responsibilities: ['核心逻辑'],
      dependencies: Array(12).fill({ module: 'dep', type: 'import' }),
    };
    
    const result = validateModule(module);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.path === 'dependencies')).toBe(true);
  });
});

describe('API Schema', () => {
  it('should validate valid API', () => {
    const api = {
      name: 'user-api',
      version: '1.0.0',
      endpoints: [
        {
          name: 'get-user',
          path: '/users/:id',
          method: 'GET',
          responses: [{ status: 200 }],
        },
      ],
    };
    
    const result = validateApi(api);
    expect(result.valid).toBe(true);
    expect(result.metrics?.endpointCount).toBe(1);
  });
  
  it('should warn about deprecated endpoints', () => {
    const api = {
      name: 'legacy-api',
      version: '2.0.0',
      endpoints: [
        {
          name: 'old-endpoint',
          path: '/old',
          method: 'GET',
          responses: [{ status: 200 }],
          deprecated: { since: '1.5.0' },
        },
      ],
    };
    
    const result = validateApi(api);
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.message.includes('已弃用'))).toBe(true);
  });
});

describe('Unified Validator', () => {
  it('should validate architecture spec', () => {
    const data = {
      name: 'test',
      version: '1.0.0',
      modules: [],
    };
    
    const result = validateSpec('architecture', data);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('architecture');
  });
  
  it('should validate module spec', () => {
    const data = {
      name: 'test-module',
      path: '/test',
      description: 'test',
      responsibilities: ['test'],
    };
    
    const result = validateSpec('module', data);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('module');
  });
  
  it('should validate api spec', () => {
    const data = {
      name: 'test-api',
      version: '1.0.0',
      endpoints: [],
    };
    
    const result = validateSpec('api', data);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('api');
  });
});

describe('Batch Validation', () => {
  it('should validate multiple specs', () => {
    const specs = [
      {
        type: 'architecture' as const,
        data: { name: 'test', version: '1.0.0', modules: [] },
      },
      {
        type: 'module' as const,
        data: { name: 'test', path: '/test', description: 'test', responsibilities: ['test'] },
      },
    ];
    
    const result = validateSpecs(specs);
    expect(result.valid).toBe(true);
    expect(result.summary.total).toBe(2);
    expect(result.summary.passed).toBe(2);
  });
});

describe('Completeness Check', () => {
  it('should check architecture completeness', () => {
    const arch = {
      name: 'test',
      version: '1.0.0',
      modules: [],
    };
    
    const result = checkSpecCompleteness('architecture', arch);
    expect(result.complete).toBe(true);
    expect(result.optional.length).toBeGreaterThan(0);
  });
});
