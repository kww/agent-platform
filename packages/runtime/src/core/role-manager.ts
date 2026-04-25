/**
 * 角色管理器
 * 
 * 职责：
 * - 角色创建、查询、更新、删除
 * - 角色状态管理
 * - 能力分配
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import {
  Role,
  RoleLevel,
  RoleStatus,
  RoleCapability,
  RoleEconomy,
  RolePerformance,
  RolePersonality,
  LEVEL_REQUIREMENTS,
  calculateTransferFee,
} from '../types/role';
import { StanceId } from '../types/stance';
import { getRoleTemplate, getInitialCapabilities, getRoleStance } from './roles';

// ============================================
// 类型定义
// ============================================

export interface CreateRoleInput {
  name: string;
  nameZh: string;
  description?: string;
  stance?: StanceId;
  level?: RoleLevel;
  template?: string;  // 角色模板 ID
  personality?: Partial<RolePersonality>;
}

export interface UpdateRoleInput {
  name?: string;
  nameZh?: string;
  description?: string;
  status?: RoleStatus;
  personality?: Partial<RolePersonality>;
}

export interface RoleFilter {
  status?: RoleStatus;
  level?: RoleLevel;
  stance?: StanceId;
}

// ============================================
// 角色管理器
// ============================================

export class RoleManager {
  private dataDir: string;
  private roles: Map<string, Role> = new Map();
  
  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.ensureDataDir();
    this.loadRoles();
  }
  
  // ============================================
  // 数据持久化
  // ============================================
  
  private ensureDataDir(): void {
    const rolesDir = path.join(this.dataDir, 'roles');
    if (!fs.existsSync(rolesDir)) {
      fs.mkdirSync(rolesDir, { recursive: true });
    }
  }
  
  private loadRoles(): void {
    const rolesDir = path.join(this.dataDir, 'roles');
    const files = fs.readdirSync(rolesDir).filter(f => f.endsWith('.yml'));
    
    for (const file of files) {
      const filePath = path.join(rolesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const role = yaml.load(content) as Role;
      this.roles.set(role.id, role);
    }
  }
  
  private saveRole(role: Role): void {
    const filePath = path.join(this.dataDir, 'roles', `${role.id}.yml`);
    fs.writeFileSync(filePath, yaml.dump(role, { skipInvalid: true }));
  }
  
  // ============================================
  // 角色创建
  // ============================================
  
  create(input: CreateRoleInput): Role {
    const id = `role-${uuidv4().slice(0, 8)}`;
    const now = new Date();
    
    // 从模板获取默认值
    const template = input.template ? getRoleTemplate(input.template) : undefined;
    
    // 确定立场
    const stance = input.stance || 
                   template?.stance || 
                   (input.template ? getRoleStance(input.template) : 'executor') as StanceId;
    
    // 确定级别
    const level = input.level || 'L1';
    const levelConfig = LEVEL_REQUIREMENTS[level];
    
    // 初始能力
    const initialCapabilities = input.template ? getInitialCapabilities(input.template) : { workflows: [], steps: [], tools: [] };
    
    // 创建能力列表
    const capabilities: RoleCapability[] = [
      ...initialCapabilities.workflows.map(id => this.createCapability(id, 'workflow', 'initial')),
      ...initialCapabilities.steps.map(id => this.createCapability(id, 'step', 'initial')),
      ...initialCapabilities.tools.map(id => this.createCapability(id, 'tool', 'initial')),
    ];
    
    // 创建角色
    const role: Role = {
      id,
      name: input.name,
      nameZh: input.nameZh,
      description: input.description || template?.description,
      
      stance,
      
      level,
      capabilities,
      
      economy: this.createInitialEconomy(level),
      performance: this.createInitialPerformance(),
      status: 'active',
      
      personality: {
        prompt: input.personality?.prompt || template?.personality?.prompt || '',
        communicationStyle: input.personality?.communicationStyle || template?.personality?.communicationStyle || 'formal',
        focusAreas: input.personality?.focusAreas || template?.personality?.focusAreas || [],
        forbiddenActions: input.personality?.forbiddenActions || template?.personality?.forbiddenActions || [],
      },
      
      metadata: {
        createdAt: now,
        updatedAt: now,
        companyId: 'default',  // TODO: 多公司支持
        version: '1.0.0',
      },
    };
    
    this.roles.set(id, role);
    this.saveRole(role);
    
    return role;
  }
  
  private createCapability(id: string, type: 'tool' | 'step' | 'workflow', source: RoleCapability['source']): RoleCapability {
    return {
      id,
      name: id,
      type,
      source,
      ownership: 'company',
      usageCount: 0,
    };
  }
  
  private createInitialEconomy(level: RoleLevel): RoleEconomy {
    const levelConfig = LEVEL_REQUIREMENTS[level];
    return {
      salary: levelConfig.salary,
      balance: 0,
      debt: 0,
      totalIncome: 0,
      totalExpense: 0,
    };
  }
  
  private createInitialPerformance(): RolePerformance {
    return {
      qualityScore: 0,
      completedTasks: 0,
      totalTasks: 0,
      completionRate: 0,
      status: 'normal',
      lowPerformanceMonths: 0,
    };
  }
  
  // ============================================
  // 角色查询
  // ============================================
  
  get(id: string): Role | undefined {
    return this.roles.get(id);
  }
  
  getAll(): Role[] {
    return Array.from(this.roles.values());
  }
  
  find(filter: RoleFilter): Role[] {
    return this.getAll().filter(role => {
      if (filter.status && role.status !== filter.status) return false;
      if (filter.level && role.level !== filter.level) return false;
      if (filter.stance && role.stance !== filter.stance) return false;
      return true;
    });
  }
  
  findByStance(stance: StanceId): Role[] {
    return this.find({ stance });
  }
  
  findActive(): Role[] {
    return this.find({ status: 'active' });
  }
  
  // ============================================
  // 角色更新
  // ============================================
  
  update(id: string, input: UpdateRoleInput): Role {
    const role = this.roles.get(id);
    if (!role) {
      throw new Error(`Role not found: ${id}`);
    }
    
    if (input.name) role.name = input.name;
    if (input.nameZh) role.nameZh = input.nameZh;
    if (input.description) role.description = input.description;
    if (input.status) role.status = input.status;
    
    if (input.personality) {
      role.personality = {
        ...role.personality,
        ...input.personality,
      };
    }
    
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  // ============================================
  // 能力管理
  // ============================================
  
  addCapability(roleId: string, capability: RoleCapability): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const levelConfig = LEVEL_REQUIREMENTS[role.level];
    
    // 检查能力上限
    if (role.capabilities.length >= levelConfig.capabilityLimit) {
      throw new Error(`Role ${roleId} has reached capability limit (${levelConfig.capabilityLimit})`);
    }
    
    // 检查是否已存在
    if (role.capabilities.some(c => c.id === capability.id)) {
      throw new Error(`Role ${roleId} already has capability ${capability.id}`);
    }
    
    role.capabilities.push(capability);
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  removeCapability(roleId: string, capabilityId: string): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const index = role.capabilities.findIndex(c => c.id === capabilityId);
    if (index === -1) {
      throw new Error(`Role ${roleId} does not have capability ${capabilityId}`);
    }
    
    role.capabilities.splice(index, 1);
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  hasCapability(roleId: string, capabilityId: string): boolean {
    const role = this.roles.get(roleId);
    if (!role) return false;
    return role.capabilities.some(c => c.id === capabilityId);
  }
  
  getCapabilities(roleId: string): RoleCapability[] {
    const role = this.roles.get(roleId);
    return role?.capabilities || [];
  }
  
  // ============================================
  // 绩效更新
  // ============================================
  
  recordTaskCompletion(roleId: string, qualityScore: number): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    role.performance.completedTasks += 1;
    role.performance.totalTasks += 1;
    role.performance.completionRate = 
      role.performance.completedTasks / role.performance.totalTasks;
    
    // 更新质量评分（移动平均）
    const oldScore = role.performance.qualityScore;
    const newScore = (oldScore * (role.performance.completedTasks - 1) + qualityScore) / 
                     role.performance.completedTasks;
    role.performance.qualityScore = Math.round(newScore * 100) / 100;
    
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  // ============================================
  // 经济操作
  // ============================================
  
  paySalary(roleId: string): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    if (role.status !== 'active') {
      throw new Error(`Role ${roleId} is not active`);
    }
    
    // 发放工资
    role.economy.balance += role.economy.salary;
    role.economy.totalIncome += role.economy.salary;
    
    // 扣除欠款
    if (role.economy.debt > 0) {
      const deduction = Math.min(role.economy.debt, role.economy.balance);
      role.economy.balance -= deduction;
      role.economy.debt -= deduction;
      role.economy.totalExpense += deduction;
    }
    
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  deduct(roleId: string, amount: number, reason: string): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    if (role.economy.balance >= amount) {
      role.economy.balance -= amount;
    } else {
      // 余额不足，记为欠款
      role.economy.debt += amount - role.economy.balance;
      role.economy.balance = 0;
    }
    
    role.economy.totalExpense += amount;
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  // ============================================
  // 状态管理
  // ============================================
  
  resign(roleId: string, reason: string): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    role.status = 'resigned';
    role.metadata.updatedAt = new Date();
    
    this.saveRole(role);
    
    return role;
  }
  
  // ============================================
  // 删除
  // ============================================
  
  delete(id: string): boolean {
    const role = this.roles.get(id);
    if (!role) return false;
    
    this.roles.delete(id);
    
    const filePath = path.join(this.dataDir, 'roles', `${id}.yml`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return true;
  }
  
  // ============================================
  // 统计
  // ============================================
  
  getStats(): {
    total: number;
    byStatus: Record<RoleStatus, number>;
    byLevel: Record<RoleLevel, number>;
  } {
    const roles = this.getAll();
    
    const byStatus: Record<RoleStatus, number> = {
      active: 0,
      resigned: 0,
      transferred: 0,
      improvement: 0,
    };
    
    const byLevel: Record<RoleLevel, number> = {
      L1: 0,
      L2: 0,
      L3: 0,
      L4: 0,
    };
    
    for (const role of roles) {
      byStatus[role.status]++;
      byLevel[role.level]++;
    }
    
    return {
      total: roles.length,
      byStatus,
      byLevel,
    };
  }
}

// ============================================
// 导出
// ============================================

export function createRoleManager(dataDir: string): RoleManager {
  return new RoleManager(dataDir);
}