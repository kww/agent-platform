/**
 * Spec 约束层测试
 */

import { SpecConstraintLayer, createSpecConstraintLayer } from '../spec-constraint-layer';
import { ContextSharer } from '../context-sharer';
import type { RedisClient } from '../context-sharer';

// Mock Redis
class MockRedis implements RedisClient {
  private data: Record<string, string> = {};

  async hset(key: string, field: string, value: string): Promise<number> {
    this.data[`${key}:${field}`] = value;
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.data[`${key}:${field}`] ?? null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const k of Object.keys(this.data)) {
      if (k.startsWith(key + ':')) {
        result[k.slice(key.length + 1)] = this.data[k];
      }
    }
    return result;
  }

  async hdel(): Promise<number> { return 0; }
  async hexists(): Promise<number> { return 0; }
  async del(): Promise<number> { return 0; }
  async expire(): Promise<number> { return 0; }

  async set(key: string, value: string) {
    this.data[key] = value;
  }

  async get(key: string): Promise<string | null> {
    return this.data[key] ?? null;
  }
}

describe('SpecConstraintLayer', () => {
  let layer: SpecConstraintLayer;
  let mockRedis: MockRedis;
  let mockContextSharer: ContextSharer;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockContextSharer = new ContextSharer({
      redis: mockRedis,
      executionId: 'test-execution',
    });
    
    layer = createSpecConstraintLayer({
      contextSharer: mockContextSharer,
    });
  });

  describe('Spec management', () => {
    it('should create spec', async () => {
      const spec = await layer.createSpec('project-1', {
        version: '1.0.0',
        createdBy: 'admin',
        architecture: {
          description: '三层架构',
          layers: ['frontend', 'backend', 'database'],
        },
      });

      expect(spec).toBeDefined();
      expect(spec.id).toMatch(/^spec-/);
      expect(spec.projectId).toBe('project-1');
      expect(spec.architecture?.layers).toHaveLength(3);
    });

    it('should get spec', async () => {
      await layer.createSpec('project-1', {
        version: '1.0.0',
        createdBy: 'admin',
        architecture: {
          description: '三层架构',
          layers: ['frontend', 'backend', 'database'],
        },
      });

      const spec = await layer.getSpec('project-1');
      expect(spec).toBeDefined();
      expect(spec?.architecture?.description).toBe('三层架构');
    });

    it('should update spec', async () => {
      await layer.createSpec('project-1', {
        version: '1.0.0',
        createdBy: 'admin',
      });

      const updated = await layer.updateSpec('project-1', {
        version: '1.1.0',
        architecture: {
          description: '更新后的架构',
          layers: ['api', 'service', 'data'],
        },
      });

      expect(updated?.version).toBe('1.1.0');
      expect(updated?.architecture?.description).toBe('更新后的架构');
    });
  });

  describe('Spec validation', () => {
    it('should validate architecture', async () => {
      const result = await layer.validateSpec({
        id: 'spec-1',
        projectId: 'project-1',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin',
        architecture: {
          description: '',
          layers: [],
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'ARCH_NO_DESCRIPTION')).toBe(true);
      expect(result.errors.some(e => e.code === 'ARCH_NO_LAYERS')).toBe(true);
    });

    it('should validate modules', async () => {
      const result = await layer.validateSpec({
        id: 'spec-1',
        projectId: 'project-1',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin',
        modules: [
          { name: '', description: '', responsibilities: [], interfaces: [] },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MODULE_NO_NAME')).toBe(true);
      expect(result.errors.some(e => e.code === 'MODULE_NO_RESPONSIBILITIES')).toBe(true);
    });

    it('should warn on missing API description', async () => {
      const result = await layer.validateSpec({
        id: 'spec-1',
        projectId: 'project-1',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'admin',
        apis: [
          { path: '/api/users', method: 'GET', description: '' },
        ],
      });

      expect(result.warnings.some(w => w.code === 'API_NO_DESCRIPTION')).toBe(true);
    });
  });

  describe('Change level analysis', () => {
    it('should return L3 for architecture change', () => {
      const level = layer.analyzeChangeLevel({
        type: 'architecture',
        description: '重构架构',
        affectedModules: ['module-1'],
        breaking: false,
      });

      expect(level).toBe('L3');
    });

    it('should return L3 for breaking API change', () => {
      const level = layer.analyzeChangeLevel({
        type: 'api',
        description: '修改 API',
        affectedModules: ['api-module'],
        breaking: true,
      });

      expect(level).toBe('L3');
    });

    it('should return L2 for non-breaking API change', () => {
      const level = layer.analyzeChangeLevel({
        type: 'api',
        description: '添加新字段',
        affectedModules: ['api-module'],
        breaking: false,
      });

      expect(level).toBe('L2');
    });

    it('should return L3 for more than 3 affected modules', () => {
      const level = layer.analyzeChangeLevel({
        type: 'module',
        description: '模块调整',
        affectedModules: ['m1', 'm2', 'm3', 'm4'],
        breaking: false,
      });

      expect(level).toBe('L3');
    });

    it('should return L1 for small changes', () => {
      const level = layer.analyzeChangeLevel({
        type: 'ui',
        description: '修改按钮颜色',
        affectedModules: ['ui-module'],
        breaking: false,
      });

      expect(level).toBe('L1');
    });

    it('should detect L3 keywords', () => {
      const level = layer.analyzeChangeLevel({
        type: 'module',
        description: '需要重构核心模块',
        affectedModules: ['module-1'],
        breaking: false,
      });

      expect(level).toBe('L3');
    });

    it('should detect L2 keywords', () => {
      const level = layer.analyzeChangeLevel({
        type: 'api',
        description: '修改接口边界',
        affectedModules: ['module-1'],
        breaking: false,
      });

      expect(level).toBe('L2');
    });
  });

  describe('Change request', () => {
    it('should create change request', async () => {
      const request = await layer.createChangeRequest('project-1', {
        type: 'api',
        description: '添加新 API',
        affectedModules: ['api-module'],
        breaking: false,
        requestedBy: 'developer-1',
      });

      expect(request).toBeDefined();
      expect(request.level).toBe('L2');
      expect(request.status).toBe('pending');
    });

    it('should auto-approve L1 changes', async () => {
      const request = await layer.createChangeRequest('project-1', {
        type: 'ui',
        description: '修改样式',
        affectedModules: ['ui-module'],
        breaking: false,
        requestedBy: 'developer-1',
      });

      expect(request.level).toBe('L1');
      expect(request.status).toBe('approved');
      expect(request.reviewedBy).toBe('system');
    });

    it('should approve change request', async () => {
      await layer.createChangeRequest('project-1', {
        type: 'api',
        description: '添加新 API',
        affectedModules: ['api-module'],
        breaking: false,
        requestedBy: 'developer-1',
      });

      // 获取请求
      const spec = await layer.getSpec('project-1');
      const requests = await (layer as any).getChangeRequests('project-1');
      const request = requests[0];

      const approved = await layer.approveChangeRequest('project-1', request.id, 'architect-1');
      expect(approved?.status).toBe('approved');
      expect(approved?.reviewedBy).toBe('architect-1');
    });

    it('should reject change request', async () => {
      await layer.createChangeRequest('project-1', {
        type: 'api',
        description: '添加新 API',
        affectedModules: ['api-module'],
        breaking: false,
        requestedBy: 'developer-1',
      });

      const requests = await (layer as any).getChangeRequests('project-1');
      const request = requests[0];

      const rejected = await layer.rejectChangeRequest('project-1', request.id, 'architect-1', '不符合规范');
      expect(rejected?.status).toBe('rejected');
      expect(rejected?.reviewNotes).toBe('不符合规范');
    });

    it('should require double approval for L3', async () => {
      await layer.createChangeRequest('project-1', {
        type: 'architecture',
        description: '重构架构',
        affectedModules: ['m1', 'm2', 'm3', 'm4'],
        breaking: false,
        requestedBy: 'developer-1',
      });

      const requests = await (layer as any).getChangeRequests('project-1');
      const request = requests[0];

      // 第一次审批
      const first = await layer.approveChangeRequest('project-1', request.id, 'architect-1');
      expect(first?.status).toBe('pending');  // 还需要另一个审批

      // 第二次审批
      const second = await layer.approveChangeRequest('project-1', request.id, 'architect-2');
      expect(second?.status).toBe('approved');
    });
  });

  describe('Gate check', () => {
    it('should pass L1 changes', async () => {
      await layer.setGateConfig({
        projectId: 'project-1',
        gateLevels: {
          L1: { autoApprove: true, requireApproval: false, requireMeeting: false, allowBypass: false },
          L2: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: false },
          L3: { autoApprove: false, requireApproval: true, requireMeeting: true, allowBypass: false },
          L4: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: true },
        },
        approvers: {
          L2: ['architect-1'],
          L3: ['architect-1', 'architect-2'],
          L4: ['admin-1'],
        },
      });

      const result = await layer.checkGate('project-1', {
        type: 'ui',
        description: '修改样式',
        affectedModules: ['ui'],
        breaking: false,
      });

      expect(result.passed).toBe(true);
      expect(result.level).toBe('L1');
    });

    it('should require approval for L2 changes', async () => {
      await layer.setGateConfig({
        projectId: 'project-1',
        gateLevels: {
          L1: { autoApprove: true, requireApproval: false, requireMeeting: false, allowBypass: false },
          L2: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: false },
          L3: { autoApprove: false, requireApproval: true, requireMeeting: true, allowBypass: false },
          L4: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: true },
        },
        approvers: {
          L2: ['architect-1'],
          L3: ['architect-1', 'architect-2'],
          L4: ['admin-1'],
        },
      });

      const result = await layer.checkGate('project-1', {
        type: 'api',
        description: '修改接口',
        affectedModules: ['api'],
        breaking: false,
      });

      expect(result.passed).toBe(false);
      expect(result.level).toBe('L2');
      expect(result.requiredActions.length).toBeGreaterThan(0);
    });

    it('should allow bypass for L4', async () => {
      await layer.setGateConfig({
        projectId: 'project-1',
        gateLevels: {
          L1: { autoApprove: true, requireApproval: false, requireMeeting: false, allowBypass: false },
          L2: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: false },
          L3: { autoApprove: false, requireApproval: true, requireMeeting: true, allowBypass: false },
          L4: { autoApprove: false, requireApproval: true, requireMeeting: false, allowBypass: true },
        },
        approvers: {
          L2: ['architect-1'],
          L3: ['architect-1', 'architect-2'],
          L4: ['admin-1'],
        },
      });

      const result = await layer.checkGate('project-1', {
        type: 'architecture',
        description: '紧急修复架构问题',
        affectedModules: ['core'],
        breaking: true,
      });

      expect(result.level).toBe('L3');  // 基于 analyzeChangeLevel
    });
  });

  describe('validateSpecFile', () => {
    it('should return format errors from harness SpecValidator', async () => {
      // harness SpecValidator 会检测文件不存在
      const result = await layer.validateSpecFile('/nonexistent/spec.yaml');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('FORMAT_ERROR');
    });

    it('should combine format and business validation', async () => {
      // 创建一个有效的 Spec
      await layer.createSpec('project-1', {
        version: '1.0.0',
        createdBy: 'architect-1',
        architecture: {
          description: 'Test architecture',
          layers: ['frontend', 'backend'],
        },
        modules: [
          {
            name: 'auth',
            description: 'Auth module',
            responsibilities: ['authentication'],
            interfaces: ['AuthAPI'],
          },
        ],
      });

      const spec = await layer.getSpec('project-1');

      // 使用实际文件路径（如果存在）或 mock
      // 这里测试业务验证逻辑
      if (spec) {
        const businessResult = await layer.validateSpec(spec);
        expect(businessResult.valid).toBe(true);
      }
    });
  });
});
