/**
 * 经济适配器
 * 
 * 功能：
 * 1. 封装对 agent-studio EconomyService 的调用
 * 2. 提供 agent-runtime 统一的经济操作接口
 * 3. 记录审计日志
 */

import type { ContextSharer } from './context-sharer';
import type { AuditChain } from './audit-chain';

// ==================== 类型定义 ====================

/**
 * 任务完成结算输入
 */
export interface TaskCompletionInput {
  roleId: string;
  taskId: string;
  taskName: string;
  qualityScore?: number;
  userSatisfaction?: boolean;
  userReward?: number;
}

/**
 * 结算结果
 */
export interface SettlementResult {
  success: boolean;
  company: {
    id: string;
    balanceBefore: number;
    balanceAfter: number;
    change: number;
  };
  role: {
    id: string;
    name: string;
    balanceBefore: number;
    balanceAfter: number;
    change: number;
  };
  details: {
    taskCost: number;
    roleIncome: number;
    companyIncome: number;
    userReward: number;
  };
}

/**
 * 月度结算结果
 */
export interface MonthlySettlementResult {
  success: boolean;
  company: {
    id: string;
    balanceBefore: number;
    balanceAfter: number;
    totalSalaryPaid: number;
  };
  roles: Array<{
    id: string;
    name: string;
    salary: number;
    balanceBefore: number;
    balanceAfter: number;
  }>;
}

/**
 * 余额检查结果
 */
export interface BalanceCheckResult {
  canAfford: boolean;
  currentBalance: number;
  requiredAmount: number;
  shortfall: number;
}

/**
 * 经济统计
 */
export interface EconomyStats {
  company: {
    balance: number;
    totalPaid: number;
    totalEarned: number;
  };
  roles: Array<{
    id: string;
    name: string;
    balance: number;
    debt: number;
    salary: number;
    tasksCompleted: number;
  }>;
}

/**
 * 交易记录
 */
export interface TransactionRecord {
  id: string;
  type: 'task_settlement' | 'monthly_salary' | 'advance' | 'repayment' | 'deposit';
  companyId: string;
  roleId?: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: string;
  details?: Record<string, any>;
}

/**
 * 经济适配器配置
 */
export interface EconomyAdapterConfig {
  contextSharer: ContextSharer;
  auditChain?: AuditChain;
  economyServiceUrl?: string;  // 可选：调用远程服务
}

// ==================== EconomyAdapter 类 ====================

export class EconomyAdapter {
  private contextSharer: ContextSharer;
  private auditChain?: AuditChain;
  private economyServiceUrl?: string;

  constructor(config: EconomyAdapterConfig) {
    this.contextSharer = config.contextSharer;
    this.auditChain = config.auditChain;
    this.economyServiceUrl = config.economyServiceUrl;
  }

  // ==================== 任务结算 ====================

  /**
   * 任务完成结算
   * 
   * 流程：
   * 1. 计算任务成本
   * 2. 更新公司余额
   * 3. 更新角色余额
   * 4. 记录审计
   */
  async settleTaskCompletion(input: TaskCompletionInput): Promise<SettlementResult> {
    // 简化实现：直接计算并更新余额
    // 实际应该调用 agent-studio EconomyService
    
    const { roleId, taskId, taskName, qualityScore, userSatisfaction, userReward } = input;

    // 获取角色和公司
    const role = await this.getRole(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    // 计算任务成本
    const taskCost = this.calculateTaskCost(taskName, qualityScore, userSatisfaction);
    const roleIncome = Math.floor(taskCost * 0.6);  // 60% 给角色
    const companyIncome = taskCost - roleIncome;
    const totalUserReward = userReward ?? 0;

    // 更新余额
    const companyBalanceBefore = role.companyBalance;
    const roleBalanceBefore = role.balance;

    const companyBalanceAfter = companyBalanceBefore + companyIncome + totalUserReward;
    const roleBalanceAfter = roleBalanceBefore + roleIncome;

    await this.updateBalances(role.companyId, roleId, {
      companyBalance: companyBalanceAfter,
      roleBalance: roleBalanceAfter,
    });

    // 记录交易
    await this.recordTransaction({
      id: `tx-${Date.now()}`,
      type: 'task_settlement',
      companyId: role.companyId,
      roleId,
      amount: taskCost,
      balanceBefore: companyBalanceBefore,
      balanceAfter: companyBalanceAfter,
      timestamp: new Date().toISOString(),
      details: {
        taskId,
        taskName,
        roleIncome,
        companyIncome,
        qualityScore,
        userSatisfaction,
      },
    });

    // 记录审计
    if (this.auditChain) {
      await this.auditChain.record('balance_changed', {
        type: 'task_settlement',
        companyId: role.companyId,
        roleId,
        taskId,
        amount: taskCost,
        roleIncome,
        companyIncome,
      });
    }

    return {
      success: true,
      company: {
        id: role.companyId,
        balanceBefore: companyBalanceBefore,
        balanceAfter: companyBalanceAfter,
        change: companyIncome + totalUserReward,
      },
      role: {
        id: roleId,
        name: role.name,
        balanceBefore: roleBalanceBefore,
        balanceAfter: roleBalanceAfter,
        change: roleIncome,
      },
      details: {
        taskCost,
        roleIncome,
        companyIncome,
        userReward: totalUserReward,
      },
    };
  }

  // ==================== 月度工资 ====================

  /**
   * 月度工资发放
   */
  async settleMonthlySalary(companyId: string): Promise<MonthlySettlementResult> {
    // 获取公司所有角色
    const roles = await this.getCompanyRoles(companyId);
    const totalSalary = roles.reduce((sum, r) => sum + r.salary, 0);

    // 获取公司余额
    const company = await this.getCompany(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    if (company.balance < totalSalary) {
      return {
        success: false,
        company: {
          id: companyId,
          balanceBefore: company.balance,
          balanceAfter: company.balance,
          totalSalaryPaid: 0,
        },
        roles: [],
      };
    }

    // 发放工资
    const companyBalanceBefore = company.balance;
    const roleBalancesBefore = new Map(roles.map(r => [r.id, r.balance]));

    const companyBalanceAfter = companyBalanceBefore - totalSalary;
    const updatedRoles = roles.map(r => ({
      id: r.id,
      name: r.name,
      salary: r.salary,
      balanceBefore: roleBalancesBefore.get(r.id)!,
      balanceAfter: roleBalancesBefore.get(r.id)! + r.salary,
    }));

    // 批量更新
    await this.updateCompanyBalance(companyId, companyBalanceAfter);
    for (const role of roles) {
      await this.updateRoleBalance(role.id, roleBalancesBefore.get(role.id)! + role.salary);
    }

    // 记录交易
    await this.recordTransaction({
      id: `tx-${Date.now()}`,
      type: 'monthly_salary',
      companyId,
      amount: totalSalary,
      balanceBefore: companyBalanceBefore,
      balanceAfter: companyBalanceAfter,
      timestamp: new Date().toISOString(),
      details: {
        roleCount: roles.length,
      },
    });

    // 记录审计
    if (this.auditChain) {
      await this.auditChain.record('salary_paid', {
        companyId,
        totalSalary,
        roleCount: roles.length,
      });
    }

    return {
      success: true,
      company: {
        id: companyId,
        balanceBefore: companyBalanceBefore,
        balanceAfter: companyBalanceAfter,
        totalSalaryPaid: totalSalary,
      },
      roles: updatedRoles,
    };
  }

  // ==================== 余额检查 ====================

  /**
   * 检查余额是否足够
   */
  async checkBalance(companyId: string, amount: number): Promise<BalanceCheckResult> {
    const company = await this.getCompany(companyId);
    
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    return {
      canAfford: company.balance >= amount,
      currentBalance: company.balance,
      requiredAmount: amount,
      shortfall: Math.max(0, amount - company.balance),
    };
  }

  // ==================== 预支/还款 ====================

  /**
   * 角色申请预支
   */
  async requestAdvance(roleId: string, amount: number): Promise<{
    success: boolean;
    role: { balanceBefore: number; balanceAfter: number };
    company: { balanceBefore: number; balanceAfter: number };
    debt: number;
  }> {
    const role = await this.getRole(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    const company = await this.getCompany(role.companyId);
    if (!company || company.balance < amount) {
      return {
        success: false,
        role: { balanceBefore: role.balance, balanceAfter: role.balance },
        company: { balanceBefore: company?.balance ?? 0, balanceAfter: company?.balance ?? 0 },
        debt: role.debt,
      };
    }

    const companyBalanceBefore = company.balance;
    const roleBalanceBefore = role.balance;

    await this.updateBalances(role.companyId, roleId, {
      companyBalance: companyBalanceBefore - amount,
      roleBalance: roleBalanceBefore + amount,
    });

    await this.updateRoleDebt(roleId, role.debt + amount);

    return {
      success: true,
      role: {
        balanceBefore: roleBalanceBefore,
        balanceAfter: roleBalanceBefore + amount,
      },
      company: {
        balanceBefore: companyBalanceBefore,
        balanceAfter: companyBalanceBefore - amount,
      },
      debt: role.debt + amount,
    };
  }

  /**
   * 偿还欠款
   */
  async repayDebt(roleId: string, amount?: number): Promise<{
    success: boolean;
    role: { balanceBefore: number; balanceAfter: number; debtBefore: number; debtAfter: number };
    company: { balanceBefore: number; balanceAfter: number };
  }> {
    const role = await this.getRole(roleId);
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }

    const company = await this.getCompany(role.companyId);
    if (!company) {
      throw new Error(`Company not found`);
    }

    const repayAmount = amount ?? Math.min(role.debt, role.balance);

    if (repayAmount <= 0 || role.balance < repayAmount) {
      return {
        success: false,
        role: {
          balanceBefore: role.balance,
          balanceAfter: role.balance,
          debtBefore: role.debt,
          debtAfter: role.debt,
        },
        company: {
          balanceBefore: company.balance,
          balanceAfter: company.balance,
        },
      };
    }

    const companyBalanceBefore = company.balance;
    const roleBalanceBefore = role.balance;
    const debtBefore = role.debt;

    await this.updateBalances(role.companyId, roleId, {
      companyBalance: companyBalanceBefore + repayAmount,
      roleBalance: roleBalanceBefore - repayAmount,
    });

    await this.updateRoleDebt(roleId, role.debt - repayAmount);

    return {
      success: true,
      role: {
        balanceBefore: roleBalanceBefore,
        balanceAfter: roleBalanceBefore - repayAmount,
        debtBefore,
        debtAfter: role.debt - repayAmount,
      },
      company: {
        balanceBefore: companyBalanceBefore,
        balanceAfter: companyBalanceBefore + repayAmount,
      },
    };
  }

  // ==================== 充值 ====================

  /**
   * 用户充值
   */
  async deposit(companyId: string, amount: number): Promise<{
    success: boolean;
    balanceBefore: number;
    balanceAfter: number;
  }> {
    const company = await this.getCompany(companyId);
    if (!company) {
      throw new Error(`Company ${companyId} not found`);
    }

    const balanceBefore = company.balance;
    const balanceAfter = balanceBefore + amount;

    await this.updateCompanyBalance(companyId, balanceAfter);

    // 记录交易
    await this.recordTransaction({
      id: `tx-${Date.now()}`,
      type: 'deposit',
      companyId,
      amount,
      balanceBefore,
      balanceAfter,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      balanceBefore,
      balanceAfter,
    };
  }

  // ==================== 统计 ====================

  /**
   * 获取经济统计
   */
  async getEconomyStats(companyId: string): Promise<EconomyStats> {
    const company = await this.getCompany(companyId);
    const roles = await this.getCompanyRoles(companyId);

    return {
      company: {
        balance: company?.balance ?? 0,
        totalPaid: 0,  // TODO: 从交易记录计算
        totalEarned: 0,
      },
      roles: roles.map(r => ({
        id: r.id,
        name: r.name,
        balance: r.balance,
        debt: r.debt,
        salary: r.salary,
        tasksCompleted: r.tasksCompleted,
      })),
    };
  }

  /**
   * 获取交易记录
   */
  async getTransactions(companyId: string, limit: number = 100): Promise<TransactionRecord[]> {
    const data = await this.contextSharer.getValue<TransactionRecord[]>(`company:${companyId}:transactions`);
    return (data ?? []).slice(-limit);
  }

  // ==================== 私有方法 ====================

  private calculateTaskCost(
    taskName: string,
    qualityScore?: number,
    userSatisfaction?: boolean
  ): number {
    // 推断任务类型
    const name = taskName.toLowerCase();
    let baseCost = 3000;

    if (name.includes('bug') || name.includes('fix')) {
      baseCost = 2000;
    } else if (name.includes('review') || name.includes('审核')) {
      baseCost = 1000;
    } else if (name.includes('test') || name.includes('测试')) {
      baseCost = 1500;
    } else if (name.includes('plan') || name.includes('规划')) {
      baseCost = 3000;
    } else if (name.includes('feature') || name.includes('功能') || name.includes('开发')) {
      baseCost = 5000;
    }

    // 质量评分调整
    if (qualityScore !== undefined) {
      const qualityMultiplier = 0.8 + (qualityScore / 5) * 0.4;
      baseCost = Math.floor(baseCost * qualityMultiplier);
    }

    // 满意度调整
    if (userSatisfaction !== undefined) {
      baseCost = Math.floor(baseCost * (userSatisfaction ? 1.2 : 0.8));
    }

    return baseCost;
  }

  private async getRole(roleId: string): Promise<{
    id: string;
    name: string;
    balance: number;
    debt: number;
    salary: number;
    tasksCompleted: number;
    companyId: string;
    companyBalance: number;
  } | null> {
    const data = await this.contextSharer.getValue<any>(`role:${roleId}`);
    return data;
  }

  private async getCompany(companyId: string): Promise<{ id: string; balance: number } | null> {
    const data = await this.contextSharer.getValue<any>(`company:${companyId}`);
    return data;
  }

  private async getCompanyRoles(companyId: string): Promise<Array<{
    id: string;
    name: string;
    balance: number;
    debt: number;
    salary: number;
    tasksCompleted: number;
  }>> {
    const data = await this.contextSharer.getValue<any[]>(`company:${companyId}:roles`);
    return data ?? [];
  }

  private async updateBalances(
    companyId: string,
    roleId: string,
    balances: { companyBalance: number; roleBalance: number }
  ): Promise<void> {
    await Promise.all([
      this.updateCompanyBalance(companyId, balances.companyBalance),
      this.updateRoleBalance(roleId, balances.roleBalance),
    ]);
  }

  private async updateCompanyBalance(companyId: string, balance: number): Promise<void> {
    const company = await this.getCompany(companyId);
    if (company) {
      await this.contextSharer.set(`company:${companyId}`, { ...company, balance });
    }
  }

  private async updateRoleBalance(roleId: string, balance: number): Promise<void> {
    const role = await this.getRole(roleId);
    if (role) {
      await this.contextSharer.set(`role:${roleId}`, { ...role, balance });
    }
  }

  private async updateRoleDebt(roleId: string, debt: number): Promise<void> {
    const role = await this.getRole(roleId);
    if (role) {
      await this.contextSharer.set(`role:${roleId}`, { ...role, debt });
    }
  }

  private async recordTransaction(transaction: TransactionRecord): Promise<void> {
    const key = `company:${transaction.companyId}:transactions`;
    const transactions = await this.contextSharer.getValue<TransactionRecord[]>(key) ?? [];
    transactions.push(transaction);
    
    // 只保留最近 1000 条
    const trimmed = transactions.slice(-1000);
    await this.contextSharer.set(key, trimmed);
  }
}

// ==================== 工厂函数 ====================

export function createEconomyAdapter(config: EconomyAdapterConfig): EconomyAdapter {
  return new EconomyAdapter(config);
}
