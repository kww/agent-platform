/**
 * 公司 Workflow 库管理
 * 
 * 功能：
 * 1. 公司 Workflow CRUD
 * 2. 继承/覆盖机制（全局模板 → 公司定制）
 * 3. 角色-Workflow 关联
 * 4. 使用统计
 */

import type { ContextSharer } from './context-sharer';

// ==================== 类型定义 ====================

/**
 * Workflow 层级
 */
export type WorkflowLayer = 'atomic' | 'composite' | 'company';

/**
 * Workflow 状态
 */
export type WorkflowStatus = 'active' | 'deprecated' | 'draft';

/**
 * Workflow 定义
 */
export interface WorkflowDefinition {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string;
  
  // 层级
  layer: WorkflowLayer;
  
  // 执行配置
  agent?: string;
  tools?: string[];
  prompt?: string;
  timeout?: number;
  
  // 元数据
  tags?: string[];
  version: string;
  status: WorkflowStatus;
  
  // 统计
  usageCount: number;
  lastUsedAt?: string;
  
  // 时间戳
  createdAt: string;
  updatedAt: string;
}

/**
 * 公司技能（可继承全局模板）
 */
export interface CompanyWorkflow extends WorkflowDefinition {
  companyId: string;
  
  // 继承关系
  inherits?: string;      // 继承的全局模板 key（格式：global:category/name）
  overrides?: WorkflowOverrides;
  
  // 自定义内容（覆盖继承）
  customAgent?: string;
  customTools?: string[];
  customPrompt?: string;
}

/**
 * 技能覆盖配置
 */
export interface WorkflowOverrides {
  agent?: string;
  tools?: string[];
  prompt?: string;
  timeout?: number;
  tags?: string[];
}

/**
 * 角色-技能关联
 */
export interface RoleWorkflowBinding {
  roleId: string;
  workflowKey: string;
  grantedAt: string;
  grantedBy: string;
  constraints?: WorkflowConstraints;
}

/**
 * 技能使用约束
 */
export interface WorkflowConstraints {
  maxUsagePerDay?: number;
  requireApproval?: boolean;
  allowedContexts?: string[];  // 仅在特定会议室类型可用
}

/**
 * 技能使用记录
 */
export interface WorkflowUsageRecord {
  workflowKey: string;
  roleId: string;
  meetingId: string;
  taskId?: string;
  executedAt: string;
  success: boolean;
  duration?: number;
  error?: string;
}

/**
 * 技能库配置
 */
export interface WorkflowLibraryConfig {
  contextSharer: ContextSharer;
  globalWorkflowPath?: string;  // 全局模板路径
}

// ==================== WorkflowLibrary 类 ====================

export class WorkflowLibrary {
  private contextSharer: ContextSharer;
  private globalWorkflowPath: string;

  constructor(config: WorkflowLibraryConfig) {
    this.contextSharer = config.contextSharer;
    this.globalWorkflowPath = config.globalWorkflowPath ?? 'global:workflows';
  }

  // ==================== CRUD 操作 ====================

  /**
   * 创建公司技能
   */
  async createWorkflow(companyId: string, workflow: Omit<CompanyWorkflow, 'companyId' | 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Promise<CompanyWorkflow> {
    const now = new Date().toISOString();
    
    const newWorkflow: CompanyWorkflow = {
      ...workflow,
      id: `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      companyId,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // 验证继承关系
    if (workflow.inherits) {
      const parentWorkflow = await this.resolveInheritance(workflow.inherits);
      if (!parentWorkflow) {
        throw new Error(`继承的技能不存在: ${workflow.inherits}`);
      }
    }

    // 存储技能
    const workflows = await this.getCompanyWorkflows(companyId);
    workflows.push(newWorkflow);
    await this.saveCompanyWorkflows(companyId, workflows);

    return newWorkflow;
  }

  /**
   * 获取公司技能
   */
  async getWorkflow(companyId: string, workflowKey: string): Promise<CompanyWorkflow | null> {
    const workflows = await this.getCompanyWorkflows(companyId);
    return workflows.find(s => s.key === workflowKey) ?? null;
  }

  /**
   * 更新公司技能
   */
  async updateWorkflow(companyId: string, workflowKey: string, updates: Partial<CompanyWorkflow>): Promise<CompanyWorkflow | null> {
    const workflows = await this.getCompanyWorkflows(companyId);
    const index = workflows.findIndex(s => s.key === workflowKey);
    
    if (index === -1) {
      return null;
    }

    const updated: CompanyWorkflow = {
      ...workflows[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // 不能修改的字段
    updated.id = workflows[index].id;
    updated.companyId = workflows[index].companyId;
    updated.createdAt = workflows[index].createdAt;

    workflows[index] = updated;
    await this.saveCompanyWorkflows(companyId, workflows);

    return updated;
  }

  /**
   * 删除公司技能
   */
  async deleteWorkflow(companyId: string, workflowKey: string): Promise<boolean> {
    const workflows = await this.getCompanyWorkflows(companyId);
    const index = workflows.findIndex(s => s.key === workflowKey);
    
    if (index === -1) {
      return false;
    }

    workflows.splice(index, 1);
    await this.saveCompanyWorkflows(companyId, workflows);

    return true;
  }

  /**
   * 列出公司技能
   */
  async listWorkflows(companyId: string, filter?: {
    category?: string;
    layer?: WorkflowLayer;
    status?: WorkflowStatus;
  }): Promise<CompanyWorkflow[]> {
    let workflows = await this.getCompanyWorkflows(companyId);

    if (filter) {
      if (filter.category) {
        workflows = workflows.filter(s => s.category === filter.category);
      }
      if (filter.layer) {
        workflows = workflows.filter(s => s.layer === filter.layer);
      }
      if (filter.status) {
        workflows = workflows.filter(s => s.status === filter.status);
      }
    }

    return workflows;
  }

  // ==================== 继承机制 ====================

  /**
   * 解析技能（处理继承）
   */
  async resolveWorkflow(companyId: string, workflowKey: string): Promise<WorkflowDefinition | null> {
    // 1. 查找公司技能
    const companyWorkflow = await this.getWorkflow(companyId, workflowKey);
    
    if (companyWorkflow) {
      // 有继承关系
      if (companyWorkflow.inherits) {
        return this.mergeWithParent(companyWorkflow);
      }
      // 无继承，直接返回
      return companyWorkflow;
    }

    // 2. 查找全局模板
    return this.getGlobalWorkflow(workflowKey);
  }

  /**
   * 从模板创建公司技能
   */
  async createFromTemplate(
    companyId: string,
    templateKey: string,
    overrides?: WorkflowOverrides
  ): Promise<CompanyWorkflow> {
    const template = await this.getGlobalWorkflow(templateKey);
    
    if (!template) {
      throw new Error(`模板不存在: ${templateKey}`);
    }

    return this.createWorkflow(companyId, {
      key: templateKey,
      name: template.name,
      category: template.category,
      description: template.description,
      layer: 'company',
      inherits: `global:${template.category}/${templateKey}`,
      overrides,
      version: '1.0.0',
      status: 'active',
    });
  }

  /**
   * 合并父级技能配置
   */
  private async mergeWithParent(workflow: CompanyWorkflow): Promise<CompanyWorkflow> {
    const parent = await this.resolveInheritance(workflow.inherits!);
    
    if (!parent) {
      return workflow;
    }

    // 合并配置（返回完整的 CompanyWorkflow）
    return {
      ...parent,
      id: workflow.id,
      key: workflow.key,
      name: workflow.name,
      companyId: workflow.companyId,
      layer: 'company',
      inherits: workflow.inherits,
      
      // 覆盖字段
      agent: workflow.overrides?.agent ?? workflow.customAgent ?? parent.agent,
      tools: workflow.overrides?.tools ?? workflow.customTools ?? parent.tools,
      prompt: workflow.overrides?.prompt ?? workflow.customPrompt ?? parent.prompt,
      timeout: workflow.overrides?.timeout ?? parent.timeout,
      tags: workflow.overrides?.tags ?? parent.tags,
      
      // 保留公司技能的元数据
      version: workflow.version,
      status: workflow.status,
      usageCount: workflow.usageCount,
      lastUsedAt: workflow.lastUsedAt,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    } as CompanyWorkflow;
  }

  /**
   * 解析继承路径
   */
  private async resolveInheritance(inherits: string): Promise<WorkflowDefinition | null> {
    // 格式：global:category/name
    const match = inherits.match(/^global:([^/]+)\/(.+)$/);
    
    if (!match) {
      return null;
    }

    const [, category, name] = match;
    return this.getGlobalWorkflow(name, category);
  }

  // ==================== 角色-技能关联 ====================

  /**
   * 授予角色技能
   */
  async grantWorkflowToRole(
    companyId: string,
    roleId: string,
    workflowKey: string,
    grantedBy: string,
    constraints?: WorkflowConstraints
  ): Promise<RoleWorkflowBinding> {
    const binding: RoleWorkflowBinding = {
      roleId,
      workflowKey,
      grantedAt: new Date().toISOString(),
      grantedBy,
      constraints,
    };

    const bindings = await this.getRoleWorkflowBindings(companyId);
    
    // 检查是否已存在
    const existing = bindings.find(b => b.roleId === roleId && b.workflowKey === workflowKey);
    if (existing) {
      // 更新约束
      existing.constraints = constraints;
      existing.grantedAt = binding.grantedAt;
      existing.grantedBy = binding.grantedBy;
    } else {
      bindings.push(binding);
    }

    await this.saveRoleWorkflowBindings(companyId, bindings);
    return binding;
  }

  /**
   * 撤销角色技能
   */
  async revokeWorkflowFromRole(companyId: string, roleId: string, workflowKey: string): Promise<boolean> {
    const bindings = await this.getRoleWorkflowBindings(companyId);
    const index = bindings.findIndex(b => b.roleId === roleId && b.workflowKey === workflowKey);
    
    if (index === -1) {
      return false;
    }

    bindings.splice(index, 1);
    await this.saveRoleWorkflowBindings(companyId, bindings);
    return true;
  }

  /**
   * 获取角色的所有技能
   */
  async getRoleWorkflows(companyId: string, roleId: string): Promise<WorkflowDefinition[]> {
    const bindings = await this.getRoleWorkflowBindings(companyId);
    const roleBindings = bindings.filter(b => b.roleId === roleId);
    
    const workflows: WorkflowDefinition[] = [];
    
    for (const binding of roleBindings) {
      const workflow = await this.resolveWorkflow(companyId, binding.workflowKey);
      if (workflow) {
        workflows.push(workflow);
      }
    }

    return workflows;
  }

  /**
   * 检查角色是否有技能
   */
  async hasWorkflow(companyId: string, roleId: string, workflowKey: string): Promise<boolean> {
    const bindings = await this.getRoleWorkflowBindings(companyId);
    return bindings.some(b => b.roleId === roleId && b.workflowKey === workflowKey);
  }

  // ==================== 使用统计 ====================

  /**
   * 记录技能使用
   */
  async recordUsage(
    companyId: string,
    workflowKey: string,
    roleId: string,
    meetingId: string,
    result: { success: boolean; duration?: number; error?: string; taskId?: string }
  ): Promise<void> {
    // 更新技能统计
    const workflows = await this.getCompanyWorkflows(companyId);
    const workflow = workflows.find(s => s.key === workflowKey);
    
    if (workflow) {
      workflow.usageCount++;
      workflow.lastUsedAt = new Date().toISOString();
      await this.saveCompanyWorkflows(companyId, workflows);
    }

    // 记录使用日志
    const record: WorkflowUsageRecord = {
      workflowKey,
      roleId,
      meetingId,
      taskId: result.taskId,
      executedAt: new Date().toISOString(),
      success: result.success,
      duration: result.duration,
      error: result.error,
    };

    await this.appendUsageRecord(companyId, record);
  }

  /**
   * 获取技能使用统计
   */
  async getUsageStats(companyId: string, workflowKey?: string): Promise<{
    totalUsage: number;
    successRate: number;
    avgDuration: number;
    recentUsage: WorkflowUsageRecord[];
  }> {
    const records = await this.getUsageRecords(companyId);
    const filtered = workflowKey ? records.filter(r => r.workflowKey === workflowKey) : records;
    
    const recentUsage = filtered.slice(-100);  // 最近 100 条
    const successCount = recentUsage.filter(r => r.success).length;
    const durations = recentUsage.filter(r => r.duration).map(r => r.duration!);

    return {
      totalUsage: filtered.length,
      successRate: recentUsage.length > 0 ? successCount / recentUsage.length : 0,
      avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
      recentUsage,
    };
  }

  // ==================== 私有方法 ====================

  private async getCompanyWorkflows(companyId: string): Promise<CompanyWorkflow[]> {
    const data = await this.contextSharer.getValue<CompanyWorkflow[]>(`company:${companyId}:workflows`);
    return data ?? [];
  }

  private async saveCompanyWorkflows(companyId: string, workflows: CompanyWorkflow[]): Promise<void> {
    await this.contextSharer.set(`company:${companyId}:workflows`, workflows);
  }

  private async getGlobalWorkflow(key: string, category?: string): Promise<WorkflowDefinition | null> {
    const data = await this.contextSharer.getValue<Record<string, WorkflowDefinition>>(this.globalWorkflowPath);
    
    if (!data) {
      return null;
    }

    // 尝试直接匹配
    if (data[key]) {
      return data[key];
    }

    // 尝试按 category/key 匹配
    if (category && data[`${category}/${key}`]) {
      return data[`${category}/${key}`];
    }

    return null;
  }

  private async getRoleWorkflowBindings(companyId: string): Promise<RoleWorkflowBinding[]> {
    const data = await this.contextSharer.getValue<RoleWorkflowBinding[]>(`company:${companyId}:role-workflows`);
    return data ?? [];
  }

  private async saveRoleWorkflowBindings(companyId: string, bindings: RoleWorkflowBinding[]): Promise<void> {
    await this.contextSharer.set(`company:${companyId}:role-workflows`, bindings);
  }

  private async getUsageRecords(companyId: string): Promise<WorkflowUsageRecord[]> {
    const data = await this.contextSharer.getValue<WorkflowUsageRecord[]>(`company:${companyId}:workflow-usage`);
    return data ?? [];
  }

  private async appendUsageRecord(companyId: string, record: WorkflowUsageRecord): Promise<void> {
    const records = await this.getUsageRecords(companyId);
    records.push(record);
    
    // 只保留最近 1000 条
    const trimmed = records.slice(-1000);
    await this.contextSharer.set(`company:${companyId}:workflow-usage`, trimmed);
  }
}

// ==================== 工厂函数 ====================

export function createWorkflowLibrary(config: WorkflowLibraryConfig): WorkflowLibrary {
  return new WorkflowLibrary(config);
}
