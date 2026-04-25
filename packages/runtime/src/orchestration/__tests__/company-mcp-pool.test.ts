/**
 * 公司 MCP 资源池测试
 */

import { CompanyMCPPool, createCompanyMCPPool } from '../company-mcp-pool';
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

describe('CompanyMCPPool', () => {
  let pool: CompanyMCPPool;
  let mockRedis: MockRedis;
  let mockContextSharer: ContextSharer;

  beforeEach(() => {
    mockRedis = new MockRedis();
    mockContextSharer = new ContextSharer({
      redis: mockRedis,
      executionId: 'test-execution',
    });
    
    pool = createCompanyMCPPool({
      contextSharer: mockContextSharer,
    });
  });

  describe('Private MCP CRUD', () => {
    it('should add private MCP', async () => {
      const mcp = await pool.addPrivateMCP('company-1', {
        key: 'internal-api',
        name: '内部 API',
        transport: 'http',
        url: 'https://internal.company.com/api',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      expect(mcp).toBeDefined();
      expect(mcp.id).toMatch(/^mcp-/);
      expect(mcp.companyId).toBe('company-1');
      expect(mcp.source).toBe('private');
    });

    it('should validate MCP config', async () => {
      await expect(pool.addPrivateMCP('company-1', {
        key: 'invalid-mcp',
        name: '无效 MCP',
        transport: 'stdio',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      })).rejects.toThrow('stdio MCP 需要指定 command');
    });

    it('should update MCP', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'internal-api',
        name: '内部 API',
        transport: 'http',
        url: 'https://internal.company.com/api',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      const updated = await pool.updateMCP('company-1', 'internal-api', {
        name: '更新后的 API',
      });

      expect(updated?.name).toBe('更新后的 API');
    });

    it('should disable MCP', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'internal-api',
        name: '内部 API',
        transport: 'http',
        url: 'https://internal.company.com/api',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      const disabled = await pool.disableMCP('company-1', 'internal-api');
      expect(disabled).toBe(true);

      const mcp = await pool.getMCP('company-1', 'internal-api');
      expect(mcp?.enabled).toBe(false);
    });

    it('should delete private MCP', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'internal-api',
        name: '内部 API',
        transport: 'http',
        url: 'https://internal.company.com/api',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      const deleted = await pool.deletePrivateMCP('company-1', 'internal-api');
      expect(deleted).toBe(true);

      const mcp = await pool.getMCP('company-1', 'internal-api');
      expect(mcp).toBeNull();
    });
  });

  describe('Role permissions', () => {
    it('should check role permission', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'restricted-api',
        name: '受限 API',
        transport: 'http',
        url: 'https://internal.company.com/api',
        enabled: true,
        allowedRoles: ['developer', 'architect'],
        // status: 'active',
        // usageCount: 0,
      });

      const hasPermission1 = await pool.hasPermission('company-1', 'developer', 'restricted-api');
      expect(hasPermission1).toBe(true);

      const hasPermission2 = await pool.hasPermission('company-1', 'tester', 'restricted-api');
      expect(hasPermission2).toBe(false);
    });

    it('should allow all roles when allowedRoles is empty', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'open-api',
        name: '开放 API',
        transport: 'http',
        url: 'https://api.company.com',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      const hasPermission = await pool.hasPermission('company-1', 'any-role', 'open-api');
      expect(hasPermission).toBe(true);
    });

    it('should get role MCPs', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'api-1',
        name: 'API 1',
        transport: 'http',
        url: 'https://api1.company.com',
        enabled: true,
        allowedRoles: ['developer'],
        // status: 'active',
        // usageCount: 0,
      });

      await pool.addPrivateMCP('company-1', {
        key: 'api-2',
        name: 'API 2',
        transport: 'http',
        url: 'https://api2.company.com',
        enabled: true,
        allowedRoles: ['architect'],
        // status: 'active',
        // usageCount: 0,
      });

      const developerMCPs = await pool.getRoleMCPs('company-1', 'developer');
      expect(developerMCPs).toHaveLength(1);
      expect(developerMCPs[0].key).toBe('api-1');
    });
  });

  describe('Usage statistics', () => {
    it('should record MCP usage', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'test-api',
        name: '测试 API',
        transport: 'http',
        url: 'https://api.company.com',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      await pool.recordUsage('company-1', 'test-api', 'get-data', 'role-1', 'meeting-1', {
        success: true,
        duration: 50,
      });

      const mcp = await pool.getMCP('company-1', 'test-api');
      expect(mcp?.usageCount).toBe(1);
      expect(mcp?.lastUsedAt).toBeDefined();
    });

    it('should get usage statistics', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'test-api',
        name: '测试 API',
        transport: 'http',
        url: 'https://api.company.com',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
      });

      await pool.recordUsage('company-1', 'test-api', 'get-data', 'role-1', 'meeting-1', {
        success: true,
        duration: 50,
      });

      await pool.recordUsage('company-1', 'test-api', 'post-data', 'role-1', 'meeting-1', {
        success: false,
        duration: 100,
        error: '请求失败',
      });

      const stats = await pool.getUsageStats('company-1', 'test-api');
      expect(stats.totalUsage).toBe(2);
      expect(stats.successRate).toBe(0.5);
      expect(stats.avgDuration).toBe(75);
      expect(stats.byTool['get-data']).toBe(1);
      expect(stats.byTool['post-data']).toBe(1);
    });
  });

  describe('Encryption', () => {
    it('should encrypt sensitive env vars', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'secure-api',
        name: '安全 API',
        transport: 'http',
        url: 'https://api.company.com',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
        env: {
          API_KEY: 'secret-key-123',
          API_URL: 'https://api.company.com',
        },
      });

      const mcp = await pool.getMCP('company-1', 'secure-api');
      expect(mcp?.env?.['API_KEY']).toMatch(/^enc:/);
      expect(mcp?.env?.['API_URL']).toBe('https://api.company.com');
    });

    it('should decrypt env vars', async () => {
      await pool.addPrivateMCP('company-1', {
        key: 'secure-api',
        name: '安全 API',
        transport: 'http',
        url: 'https://api.company.com',
        enabled: true,
        // status: 'active',
        // usageCount: 0,
        env: {
          API_KEY: 'secret-key-123',
        },
      });

      const mcp = await pool.getMCP('company-1', 'secure-api');
      const decrypted = pool.decryptEnvVars(mcp?.env ?? {});
      expect(decrypted['API_KEY']).toBe('secret-key-123');
    });
  });
});
