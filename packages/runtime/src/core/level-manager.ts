/**
 * 级别管理器
 * 
 * 职责：
 * - 级别检查
 * - 晋升评估
 * - 降级处理
 * - 晋升答辩流程
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import {
  Role,
  RoleLevel,
  LevelRequirement,
  LEVEL_REQUIREMENTS,
  PromotionRequest,
  DemotionRecord,
  AssessmentRecord,
  AssessmentType,
  ASSESSMENT_STANDARDS,
} from '../types/role';
import { RoleManager } from './role-manager';

// ============================================
// 类型定义
// ============================================

export interface PromotionCheckResult {
  eligible: boolean;
  currentLevel: RoleLevel;
  targetLevel: RoleLevel | null;
  requirements: {
    capabilities: { current: number; required: number; met: boolean };
    tasks: { current: number; required: number; met: boolean };
    qualityScore: { current: number; required: number; met: boolean };
  };
  gaps: string[];
}

export interface DemotionCheckResult {
  shouldDemote: boolean;
  reason: string;
  trigger: {
    lowPerformanceMonths: number;
    qualityScore: number;
    completionRate: number;
  };
}

export interface AssessmentResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  promotion: boolean;
  demotion: boolean;
  bonus: number;
}

// ============================================
// 级别管理器
// ============================================

export class LevelManager {
  private dataDir: string;
  private roleManager: RoleManager;
  
  constructor(dataDir: string, roleManager: RoleManager) {
    this.dataDir = dataDir;
    this.roleManager = roleManager;
    this.ensureDataDir();
  }
  
  private ensureDataDir(): void {
    const dirs = ['promotions', 'demotions', 'assessments'];
    for (const dir of dirs) {
      const fullPath = path.join(this.dataDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }
  
  // ============================================
  // 级别检查
  // ============================================
  
  getLevelRequirement(level: RoleLevel): LevelRequirement {
    return LEVEL_REQUIREMENTS[level];
  }
  
  getNextLevel(level: RoleLevel): RoleLevel | null {
    const levels: RoleLevel[] = ['L1', 'L2', 'L3', 'L4'];
    const index = levels.indexOf(level);
    if (index === -1 || index === levels.length - 1) return null;
    return levels[index + 1];
  }
  
  getPreviousLevel(level: RoleLevel): RoleLevel | null {
    const levels: RoleLevel[] = ['L1', 'L2', 'L3', 'L4'];
    const index = levels.indexOf(level);
    if (index === -1 || index === 0) return null;
    return levels[index - 1];
  }
  
  // ============================================
  // 晋升检查
  // ============================================
  
  checkPromotionEligibility(roleId: string): PromotionCheckResult {
    const role = this.roleManager.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const targetLevel = this.getNextLevel(role.level);
    if (!targetLevel) {
      return {
        eligible: false,
        currentLevel: role.level,
        targetLevel: null,
        requirements: {
          capabilities: { current: 0, required: 0, met: false },
          tasks: { current: 0, required: 0, met: false },
          qualityScore: { current: 0, required: 0, met: false },
        },
        gaps: ['已达到最高级别'],
      };
    }
    
    const requirement = LEVEL_REQUIREMENTS[targetLevel];
    
    const capabilitiesMet = role.capabilities.length >= requirement.minCapabilities;
    const tasksMet = role.performance.completedTasks >= requirement.minTasks;
    const qualityMet = role.performance.qualityScore >= requirement.minQualityScore;
    
    const gaps: string[] = [];
    if (!capabilitiesMet) {
      gaps.push(`能力不足：${role.capabilities.length}/${requirement.minCapabilities}`);
    }
    if (!tasksMet) {
      gaps.push(`任务不足：${role.performance.completedTasks}/${requirement.minTasks}`);
    }
    if (!qualityMet) {
      gaps.push(`质量评分不足：${role.performance.qualityScore}/${requirement.minQualityScore}`);
    }
    
    return {
      eligible: capabilitiesMet && tasksMet && qualityMet,
      currentLevel: role.level,
      targetLevel,
      requirements: {
        capabilities: { 
          current: role.capabilities.length, 
          required: requirement.minCapabilities, 
          met: capabilitiesMet 
        },
        tasks: { 
          current: role.performance.completedTasks, 
          required: requirement.minTasks, 
          met: tasksMet 
        },
        qualityScore: { 
          current: role.performance.qualityScore, 
          required: requirement.minQualityScore, 
          met: qualityMet 
        },
      },
      gaps,
    };
  }
  
  // ============================================
  // 晋升申请
  // ============================================
  
  createPromotionRequest(roleId: string, statement: string): PromotionRequest {
    const role = this.roleManager.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const eligibility = this.checkPromotionEligibility(roleId);
    if (!eligibility.eligible) {
      throw new Error(`Role ${roleId} is not eligible for promotion: ${eligibility.gaps.join(', ')}`);
    }
    
    const request: PromotionRequest = {
      id: `promo-${uuidv4().slice(0, 8)}`,
      roleId,
      currentLevel: role.level,
      targetLevel: eligibility.targetLevel!,
      materials: {
        achievements: [],
        capabilities: role.capabilities.map(c => c.id),
        tasks: [],
        statement,
      },
      status: 'pending',
      createdAt: new Date(),
    };
    
    // 保存申请
    const filePath = path.join(this.dataDir, 'promotions', `${request.id}.yml`);
    fs.writeFileSync(filePath, yaml.dump(request));
    
    return request;
  }
  
  approvePromotion(requestId: string, reviewerId: string, opinion: string): Role {
    const filePath = path.join(this.dataDir, 'promotions', `${requestId}.yml`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Promotion request not found: ${requestId}`);
    }
    
    const request = yaml.load(fs.readFileSync(filePath, 'utf-8')) as PromotionRequest;
    
    if (request.status !== 'pending') {
      throw new Error(`Promotion request ${requestId} is already ${request.status}`);
    }
    
    // 更新申请
    request.status = 'approved';
    request.review = {
      reviewerId,
      opinion,
      decision: 'approve',
      timestamp: new Date(),
    };
    
    fs.writeFileSync(filePath, yaml.dump(request));
    
    // 更新角色
    const role = this.roleManager.get(request.roleId);
    if (!role) {
      throw new Error(`Role not found: ${request.roleId}`);
    }
    
    role.level = request.targetLevel;
    
    // 更新工资
    const newRequirement = LEVEL_REQUIREMENTS[role.level];
    role.economy.salary = newRequirement.salary;
    
    role.metadata.updatedAt = new Date();
    
    // 保存角色
    this.roleManager.update(request.roleId, { status: role.status });
    
    return role;
  }
  
  rejectPromotion(requestId: string, reviewerId: string, opinion: string): PromotionRequest {
    const filePath = path.join(this.dataDir, 'promotions', `${requestId}.yml`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Promotion request not found: ${requestId}`);
    }
    
    const request = yaml.load(fs.readFileSync(filePath, 'utf-8')) as PromotionRequest;
    
    request.status = 'rejected';
    request.review = {
      reviewerId,
      opinion,
      decision: 'reject',
      timestamp: new Date(),
    };
    
    fs.writeFileSync(filePath, yaml.dump(request));
    
    return request;
  }
  
  // ============================================
  // 降级检查
  // ============================================
  
  checkDemotion(roleId: string): DemotionCheckResult {
    const role = this.roleManager.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const trigger = {
      lowPerformanceMonths: role.performance.lowPerformanceMonths,
      qualityScore: role.performance.qualityScore,
      completionRate: role.performance.completionRate,
    };
    
    // 降级条件
    const shouldDemote = 
      role.performance.lowPerformanceMonths >= 2 ||
      role.performance.qualityScore < 3.0;
    
    let reason = '';
    if (role.performance.lowPerformanceMonths >= 2) {
      reason = `连续 ${role.performance.lowPerformanceMonths} 个月绩效不达标`;
    } else if (role.performance.qualityScore < 3.0) {
      reason = `质量评分过低：${role.performance.qualityScore}`;
    }
    
    return {
      shouldDemote,
      reason,
      trigger,
    };
  }
  
  applyDemotion(roleId: string, reason: string): DemotionRecord {
    const role = this.roleManager.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const previousLevel = role.level;
    const newLevel = this.getPreviousLevel(role.level);
    
    if (!newLevel) {
      throw new Error(`Role ${roleId} is already at lowest level`);
    }
    
    const demotionCheck = this.checkDemotion(roleId);
    
    // 创建降级记录
    const record: DemotionRecord = {
      id: `demo-${uuidv4().slice(0, 8)}`,
      roleId,
      fromLevel: previousLevel,
      toLevel: newLevel,
      reason,
      trigger: demotionCheck.trigger,
      createdAt: new Date(),
    };
    
    // 保存记录
    const filePath = path.join(this.dataDir, 'demotions', `${record.id}.yml`);
    fs.writeFileSync(filePath, yaml.dump(record));
    
    // 更新角色
    role.level = newLevel;
    role.performance.lowPerformanceMonths = 0;
    role.performance.status = 'normal';
    
    // 更新工资
    const newRequirement = LEVEL_REQUIREMENTS[newLevel];
    role.economy.salary = newRequirement.salary;
    
    role.metadata.updatedAt = new Date();
    
    // 移除超限能力
    if (role.capabilities.length > newRequirement.capabilityLimit) {
      // 保留最重要的能力（按使用次数排序）
      role.capabilities.sort((a, b) => b.usageCount - a.usageCount);
      role.capabilities = role.capabilities.slice(0, newRequirement.capabilityLimit);
    }
    
    this.roleManager.update(roleId, { status: role.status });
    
    return record;
  }
  
  // ============================================
  // 绩效考核
  // ============================================
  
  runAssessment(roleId: string, type: AssessmentType): AssessmentRecord {
    const role = this.roleManager.get(roleId);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }
    
    const now = new Date();
    const period = this.getAssessmentPeriod(type, now);
    
    // 计算评分
    const result = this.calculateAssessment(role, type);
    
    const record: AssessmentRecord = {
      id: `assess-${uuidv4().slice(0, 8)}`,
      roleId,
      type,
      period,
      metrics: {
        completedTasks: role.performance.completedTasks,
        qualityScore: role.performance.qualityScore,
        completionRate: role.performance.completionRate,
        newCapabilities: role.capabilities.filter(c => c.source === 'learned').length,
        createdCapabilities: role.capabilities.filter(c => c.source === 'created').length,
      },
      result,
      reviewerId: 'system',
      createdAt: now,
    };
    
    // 保存记录
    const filePath = path.join(this.dataDir, 'assessments', `${record.id}.yml`);
    fs.writeFileSync(filePath, yaml.dump(record));
    
    // 根据结果调整状态
    if (result.demotion) {
      role.performance.status = 'warning';
      role.performance.lowPerformanceMonths += 1;
    } else {
      role.performance.lowPerformanceMonths = 0;
    }
    
    this.roleManager.update(roleId, { status: role.status });
    
    return record;
  }
  
  private getAssessmentPeriod(type: AssessmentType, now: Date): { start: Date; end: Date } {
    const end = now;
    let start: Date;
    
    switch (type) {
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'annual':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }
    
    return { start, end };
  }
  
  private calculateAssessment(role: Role, type: AssessmentType): AssessmentResult {
    const standards = ASSESSMENT_STANDARDS[type];
    
    // 计算综合评分
    const taskScore = Math.min(100, (role.performance.completedTasks / 100) * 40);
    const qualityScore = (role.performance.qualityScore / 5) * 40;
    const completionScore = role.performance.completionRate * 20;
    
    const score = Math.round(taskScore + qualityScore + completionScore);
    
    // 计算等级
    let grade: 'A' | 'B' | 'C' | 'D' | 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else grade = 'F';
    
    // 判断晋升/降级
    const promotion = score >= standards.promotionScore;
    const demotion = score < standards.demotionThreshold;
    
    // 计算奖金
    const bonus = grade === 'A' ? role.economy.salary * 0.5 :
                  grade === 'B' ? role.economy.salary * 0.3 :
                  grade === 'C' ? role.economy.salary * 0.1 :
                  0;
    
    return {
      score,
      grade,
      promotion,
      demotion,
      bonus,
    };
  }
  
  // ============================================
  // 统计
  // ============================================
  
  getLevelStats(): Record<RoleLevel, {
    count: number;
    avgQualityScore: number;
    avgCompletedTasks: number;
  }> {
    const roles = this.roleManager.getAll();
    const stats: Record<RoleLevel, {
      count: number;
      totalQualityScore: number;
      totalCompletedTasks: number;
      avgQualityScore: number;
      avgCompletedTasks: number;
    }> = {
      L1: { count: 0, totalQualityScore: 0, totalCompletedTasks: 0, avgQualityScore: 0, avgCompletedTasks: 0 },
      L2: { count: 0, totalQualityScore: 0, totalCompletedTasks: 0, avgQualityScore: 0, avgCompletedTasks: 0 },
      L3: { count: 0, totalQualityScore: 0, totalCompletedTasks: 0, avgQualityScore: 0, avgCompletedTasks: 0 },
      L4: { count: 0, totalQualityScore: 0, totalCompletedTasks: 0, avgQualityScore: 0, avgCompletedTasks: 0 },
    };
    
    for (const role of roles) {
      stats[role.level].count++;
      stats[role.level].totalQualityScore += role.performance.qualityScore;
      stats[role.level].totalCompletedTasks += role.performance.completedTasks;
    }
    
    for (const level of ['L1', 'L2', 'L3', 'L4'] as RoleLevel[]) {
      if (stats[level].count > 0) {
        stats[level].avgQualityScore = Math.round(stats[level].totalQualityScore / stats[level].count * 100) / 100;
        stats[level].avgCompletedTasks = Math.round(stats[level].totalCompletedTasks / stats[level].count);
      }
    }
    
    return stats;
  }
}

// ============================================
// 导出
// ============================================

export function createLevelManager(dataDir: string, roleManager: RoleManager): LevelManager {
  return new LevelManager(dataDir, roleManager);
}