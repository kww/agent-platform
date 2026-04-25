/**
 * 经济适配器测试
 */

import { EconomyAdapter, createEconomyAdapter } from '../economy-adapter';
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

describe('EconomyAdapter', () => {
  let adapter: EconomyAdapter;
  let mockRedis: MockRedis;
  let mockContextSharer: ContextSharer;

  beforeEach(async () => {
    mockRedis = new MockRedis();
    mockContextSharer = new ContextSharer({
      redis: mockRedis,
      executionId: 'test-execution',
    });
    
    // 初始化测试数据
    await mockContextSharer.set('company:company-1', {
      id: 'company-1',
      balance: 100000,
    });

    await mockContextSharer.set('role:role-1', {
      id: 'role-1',
      name: 'Developer',
      balance: 5000,
      debt: 0,
      salary: 10000,
      tasksCompleted: 5,
      companyId: 'company-1',
      companyBalance: 100000,
    });

    await mockContextSharer.set('company:company-1:roles', [
      {
        id: 'role-1',
        name: 'Developer',
        balance: 5000,
        debt: 0,
        salary: 10000,
        tasksCompleted: 5,
      },
    ]);

    adapter = createEconomyAdapter({
      contextSharer: mockContextSharer,
    });
  });

  describe('Task settlement', () => {
    it('should settle task completion', async () => {
      const result = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature: Add login',
        qualityScore: 4,
        userSatisfaction: true,
      });

      expect(result.success).toBe(true);
      expect(result.role.balanceAfter).toBeGreaterThan(result.role.balanceBefore);
      expect(result.details.taskCost).toBeGreaterThan(0);
      expect(result.details.roleIncome).toBeGreaterThan(0);
    });

    it('should calculate different costs for different task types', async () => {
      const featureResult = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature: Add feature',
      });

      const bugfixResult = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-2',
        taskName: 'Fix: Bug fix',
      });

      expect(featureResult.details.taskCost).not.toEqual(bugfixResult.details.taskCost);
    });

    it('should apply quality score multiplier', async () => {
      const highQuality = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature',
        qualityScore: 5,
      });

      const lowQuality = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-2',
        taskName: 'Feature',
        qualityScore: 1,
      });

      expect(highQuality.details.taskCost).toBeGreaterThan(lowQuality.details.taskCost);
    });

    it('should apply satisfaction multiplier', async () => {
      const satisfied = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature',
        userSatisfaction: true,
      });

      const unsatisfied = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-2',
        taskName: 'Feature',
        userSatisfaction: false,
      });

      expect(satisfied.details.taskCost).toBeGreaterThan(unsatisfied.details.taskCost);
    });

    it('should add user reward', async () => {
      const result = await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature',
        userReward: 1000,
      });

      expect(result.details.userReward).toBe(1000);
    });
  });

  describe('Monthly salary', () => {
    it('should settle monthly salary', async () => {
      const result = await adapter.settleMonthlySalary('company-1');

      expect(result.success).toBe(true);
      expect(result.company.totalSalaryPaid).toBe(10000);
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].balanceAfter).toBeGreaterThan(result.roles[0].balanceBefore);
    });

    it('should fail if insufficient balance', async () => {
      // 设置公司余额不足
      await mockContextSharer.set('company:company-1', {
        id: 'company-1',
        balance: 5000,  // 少于工资 10000
      });

      const result = await adapter.settleMonthlySalary('company-1');

      expect(result.success).toBe(false);
      expect(result.company.totalSalaryPaid).toBe(0);
    });
  });

  describe('Balance check', () => {
    it('should return true if balance is sufficient', async () => {
      const result = await adapter.checkBalance('company-1', 50000);

      expect(result.canAfford).toBe(true);
      expect(result.currentBalance).toBe(100000);
      expect(result.shortfall).toBe(0);
    });

    it('should return false if balance is insufficient', async () => {
      const result = await adapter.checkBalance('company-1', 150000);

      expect(result.canAfford).toBe(false);
      expect(result.shortfall).toBe(50000);
    });
  });

  describe('Advance and repayment', () => {
    it('should grant advance request', async () => {
      const result = await adapter.requestAdvance('role-1', 1000);

      expect(result.success).toBe(true);
      expect(result.role.balanceAfter).toBe(result.role.balanceBefore + 1000);
      expect(result.debt).toBe(1000);
    });

    it('should deny advance if insufficient company balance', async () => {
      await mockContextSharer.set('company:company-1', {
        id: 'company-1',
        balance: 500,
      });

      const result = await adapter.requestAdvance('role-1', 1000);

      expect(result.success).toBe(false);
    });

    it('should repay debt', async () => {
      // 先预支
      await adapter.requestAdvance('role-1', 1000);

      // 再还款
      const result = await adapter.repayDebt('role-1', 500);

      expect(result.success).toBe(true);
      expect(result.role.debtAfter).toBe(500);
    });

    it('should repay full debt if amount not specified', async () => {
      await adapter.requestAdvance('role-1', 1000);

      const result = await adapter.repayDebt('role-1');

      expect(result.success).toBe(true);
      expect(result.role.debtAfter).toBe(0);
    });
  });

  describe('Deposit', () => {
    it('should deposit to company', async () => {
      const result = await adapter.deposit('company-1', 50000);

      expect(result.success).toBe(true);
      expect(result.balanceAfter).toBe(result.balanceBefore + 50000);
    });
  });

  describe('Statistics', () => {
    it('should return economy stats', async () => {
      const stats = await adapter.getEconomyStats('company-1');

      expect(stats.company.balance).toBe(100000);
      expect(stats.roles).toHaveLength(1);
      expect(stats.roles[0].salary).toBe(10000);
    });

    it('should get transactions', async () => {
      await adapter.settleTaskCompletion({
        roleId: 'role-1',
        taskId: 'task-1',
        taskName: 'Feature',
      });

      const transactions = await adapter.getTransactions('company-1');

      expect(transactions.length).toBeGreaterThan(0);
      expect(transactions[0].type).toBe('task_settlement');
    });
  });
});
