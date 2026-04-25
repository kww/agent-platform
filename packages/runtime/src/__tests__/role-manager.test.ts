/**
 * 角色管理器测试
 */

import * as path from 'path';
import * as fs from 'fs';
import { RoleManager, createRoleManager } from '../core/role-manager';
import { LevelManager, createLevelManager } from '../core/level-manager';

// 测试数据目录
const TEST_DATA_DIR = path.join(__dirname, '.test-data');

// 测试前清理
beforeEach(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
});

// 测试后清理
afterAll(() => {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
});

// ============================================
// RoleManager 测试
// ============================================

describe('RoleManager', () => {
  let manager: RoleManager;
  
  beforeEach(() => {
    manager = createRoleManager(TEST_DATA_DIR);
  });
  
  describe('create', () => {
    it('should create a role with default values', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
      });
      
      expect(role.id).toBeDefined();
      expect(role.name).toBe('Developer');
      expect(role.nameZh).toBe('开发工程师');
      expect(role.level).toBe('L1');
      expect(role.status).toBe('active');
      expect(role.stance).toBe('executor');
    });
    
    it('should create a role from template', () => {
      const role = manager.create({
        name: 'Reviewer',
        nameZh: '评审专家',
        template: 'reviewer',
      });
      
      expect(role.stance).toBe('critic');
      expect(role.capabilities.length).toBeGreaterThan(0);
    });
    
    it('should create a role with custom level', () => {
      const role = manager.create({
        name: 'Senior Developer',
        nameZh: '高级开发工程师',
        level: 'L3',
      });
      
      expect(role.level).toBe('L3');
      expect(role.economy.salary).toBe(20000);
    });
  });
  
  describe('get', () => {
    it('should get a role by id', () => {
      const created = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
      });
      
      const role = manager.get(created.id);
      
      expect(role).toBeDefined();
      expect(role?.name).toBe('Developer');
    });
    
    it('should return undefined for non-existent role', () => {
      const role = manager.get('non-existent');
      expect(role).toBeUndefined();
    });
  });
  
  describe('find', () => {
    beforeEach(() => {
      manager.create({ name: 'Dev1', nameZh: '开发1', level: 'L1' });
      manager.create({ name: 'Dev2', nameZh: '开发2', level: 'L2' });
      manager.create({ name: 'Reviewer', nameZh: '评审', template: 'reviewer', level: 'L3' });
    });
    
    it('should find roles by level', () => {
      const roles = manager.find({ level: 'L1' });
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe('Dev1');
    });
    
    it('should find roles by stance', () => {
      const roles = manager.find({ stance: 'critic' });
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe('Reviewer');
    });
  });
  
  describe('capabilities', () => {
    it('should add capability to role', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        template: undefined,  // 不使用模板，避免初始能力
      });
      
      const initialCount = role.capabilities.length;
      
      manager.addCapability(role.id, {
        id: 'new-workflow',
        name: 'New Workflow',
        type: 'workflow',
        source: 'learned',
        ownership: 'private',
        usageCount: 0,
      });
      
      const updated = manager.get(role.id);
      expect(updated?.capabilities.length).toBe(initialCount + 1);
      expect(updated?.capabilities.some(c => c.id === 'new-workflow')).toBe(true);
    });
    
    it('should check if role has capability', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        template: 'developer',
      });
      
      // 开发工程师模板有初始能力
      expect(role.capabilities.length).toBeGreaterThan(0);
      
      const hasCapability = manager.hasCapability(role.id, role.capabilities[0].id);
      expect(hasCapability).toBe(true);
    });
    
    it('should fail when capability limit reached', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',  // 能力上限 10
        template: undefined,  // 不使用模板，避免初始能力
      });
      
      // L1 能力上限 10
      // 添加 10 个能力（成功）
      for (let i = 0; i < 10; i++) {
        manager.addCapability(role.id, {
          id: `cap-${i}`,
          name: `Capability ${i}`,
          type: 'tool',
          source: 'learned',
          ownership: 'private',
          usageCount: 0,
        });
      }
      
      // 第 11 个应该失败
      expect(() => {
        manager.addCapability(role.id, {
          id: 'cap-11',
          name: 'Capability 11',
          type: 'tool',
          source: 'learned',
          ownership: 'private',
          usageCount: 0,
        });
      }).toThrow('capability limit');
      
      const updated = manager.get(role.id);
      expect(updated?.capabilities.length).toBe(10);
    });
  });
  
  describe('economy', () => {
    it('should pay salary to role', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L2',  // 工资 10000
      });
      
      manager.paySalary(role.id);
      
      const updated = manager.get(role.id);
      expect(updated?.economy.balance).toBe(10000);
      expect(updated?.economy.totalIncome).toBe(10000);
    });
    
    it('should deduct from role balance', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L2',
      });
      
      manager.paySalary(role.id);
      manager.deduct(role.id, 3000, '购买资源');
      
      const updated = manager.get(role.id);
      expect(updated?.economy.balance).toBe(7000);
      expect(updated?.economy.totalExpense).toBe(3000);
    });
    
    it('should create debt when balance insufficient', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',  // 工资 5000，初始余额 0
      });
      
      // 初始余额是 0，扣除 8000 会产生 8000 欠款
      manager.deduct(role.id, 8000, '大额支出');
      
      const updated = manager.get(role.id);
      expect(updated?.economy.balance).toBe(0);
      expect(updated?.economy.debt).toBe(8000);
    });
    
    it('should deduct debt from salary', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',  // 工资 5000
      });
      
      // 创建欠款 8000
      manager.deduct(role.id, 8000, '大额支出');
      // 发工资 5000，扣除欠款后余额 0，还欠 3000
      manager.paySalary(role.id);
      
      const updated = manager.get(role.id);
      expect(updated?.economy.balance).toBe(0);  // 5000 - 5000 = 0
      expect(updated?.economy.debt).toBe(3000);  // 8000 - 5000 = 3000
    });
  });
  
  describe('performance', () => {
    it('should record task completion', () => {
      const role = manager.create({
        name: 'Developer',
        nameZh: '开发工程师',
      });
      
      manager.recordTaskCompletion(role.id, 4.5);
      manager.recordTaskCompletion(role.id, 4.0);
      
      const updated = manager.get(role.id);
      expect(updated?.performance.completedTasks).toBe(2);
      expect(updated?.performance.qualityScore).toBeCloseTo(4.25);
    });
  });
});

// ============================================
// LevelManager 测试
// ============================================

describe('LevelManager', () => {
  let roleManager: RoleManager;
  let levelManager: LevelManager;
  
  beforeEach(() => {
    roleManager = createRoleManager(TEST_DATA_DIR);
    levelManager = createLevelManager(TEST_DATA_DIR, roleManager);
  });
  
  describe('level requirements', () => {
    it('should get level requirements', () => {
      const l1 = levelManager.getLevelRequirement('L1');
      
      expect(l1.minCapabilities).toBe(5);
      expect(l1.minTasks).toBe(10);
      expect(l1.salary).toBe(5000);
      expect(l1.capabilityLimit).toBe(10);
    });
    
    it('should get next level', () => {
      expect(levelManager.getNextLevel('L1')).toBe('L2');
      expect(levelManager.getNextLevel('L2')).toBe('L3');
      expect(levelManager.getNextLevel('L4')).toBeNull();
    });
    
    it('should get previous level', () => {
      expect(levelManager.getPreviousLevel('L2')).toBe('L1');
      expect(levelManager.getPreviousLevel('L1')).toBeNull();
    });
  });
  
  describe('promotion', () => {
    it('should check promotion eligibility', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
      });
      
      // 不满足晋升条件
      const result = levelManager.checkPromotionEligibility(role.id);
      
      expect(result.eligible).toBe(false);
      expect(result.targetLevel).toBe('L2');
      expect(result.gaps.length).toBeGreaterThan(0);
    });
    
    it('should pass promotion check when requirements met', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
        template: undefined,  // 不使用模板，避免初始能力
      });
      
      // L1 → L2 需要 L2 的要求：10 能力 + 50 任务 + 4.0 质量评分
      // 添加 10 个能力
      for (let i = 0; i < 10; i++) {
        roleManager.addCapability(role.id, {
          id: `cap-${i}`,
          name: `Cap ${i}`,
          type: 'tool',
          source: 'learned',
          ownership: 'private',
          usageCount: 0,
        });
      }
      
      // 完成 50 个任务，高质量
      for (let i = 0; i < 50; i++) {
        roleManager.recordTaskCompletion(role.id, 4.2);
      }
      
      const result = levelManager.checkPromotionEligibility(role.id);
      
      expect(result.eligible).toBe(true);
      expect(result.requirements.capabilities.met).toBe(true);
      expect(result.requirements.tasks.met).toBe(true);
      expect(result.requirements.qualityScore.met).toBe(true);
    });
    
    it('should create promotion request', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
        template: undefined,  // 不使用模板
      });
      
      // L1 → L2 需要：10 能力 + 50 任务 + 4.0 质量评分
      // L1 能力上限正好是 10
      for (let i = 0; i < 10; i++) {
        roleManager.addCapability(role.id, {
          id: `cap-${i}`,
          name: `Cap ${i}`,
          type: 'tool',
          source: 'learned',
          ownership: 'private',
          usageCount: 0,
        });
      }
      
      for (let i = 0; i < 50; i++) {
        roleManager.recordTaskCompletion(role.id, 4.2);
      }
      
      const request = levelManager.createPromotionRequest(role.id, '申请晋升');
      
      expect(request.status).toBe('pending');
      expect(request.currentLevel).toBe('L1');
      expect(request.targetLevel).toBe('L2');
    });
    
    it('should approve promotion', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
        template: undefined,
      });
      
      // 满足条件
      for (let i = 0; i < 10; i++) {
        roleManager.addCapability(role.id, {
          id: `cap-${i}`,
          name: `Cap ${i}`,
          type: 'tool',
          source: 'learned',
          ownership: 'private',
          usageCount: 0,
        });
      }
      
      for (let i = 0; i < 50; i++) {
        roleManager.recordTaskCompletion(role.id, 4.2);
      }
      
      const request = levelManager.createPromotionRequest(role.id, '申请晋升');
      const updated = levelManager.approvePromotion(request.id, 'admin', '同意晋升');
      
      expect(updated.level).toBe('L2');
      expect(updated.economy.salary).toBe(10000);
    });
  });
  
  describe('demotion', () => {
    it('should check demotion conditions', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L2',
      });
      
      // 低质量评分
      roleManager.recordTaskCompletion(role.id, 2.5);
      roleManager.recordTaskCompletion(role.id, 2.0);
      roleManager.recordTaskCompletion(role.id, 2.8);
      
      const result = levelManager.checkDemotion(role.id);
      
      expect(result.shouldDemote).toBe(true);
      expect(result.reason).toContain('质量评分过低');
    });
    
    it('should apply demotion', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L2',
      });
      
      // 低质量评分
      roleManager.recordTaskCompletion(role.id, 2.5);
      roleManager.recordTaskCompletion(role.id, 2.0);
      
      const record = levelManager.applyDemotion(role.id, '绩效不达标');
      
      expect(record.fromLevel).toBe('L2');
      expect(record.toLevel).toBe('L1');
      
      const updated = roleManager.get(role.id);
      expect(updated?.level).toBe('L1');
      expect(updated?.economy.salary).toBe(5000);
    });
  });
  
  describe('assessment', () => {
    it('should run monthly assessment', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
      });
      
      // 模拟工作
      for (let i = 0; i < 20; i++) {
        roleManager.recordTaskCompletion(role.id, 4.2);
      }
      
      const record = levelManager.runAssessment(role.id, 'monthly');
      
      expect(record.metrics.completedTasks).toBe(20);
      expect(record.result.grade).toMatch(/[A-F]/);
    });
    
    it('should calculate bonus based on grade', () => {
      const role = roleManager.create({
        name: 'Developer',
        nameZh: '开发工程师',
        level: 'L1',
        template: undefined,
      });
      
      // 高质量工作
      for (let i = 0; i < 100; i++) {
        roleManager.recordTaskCompletion(role.id, 4.8);
      }
      
      const record = levelManager.runAssessment(role.id, 'monthly');
      
      // 任务得分：(100/100) * 40 = 40
      // 质量得分：(4.8/5) * 40 = 38.4
      // 完成率得分：1.0 * 20 = 20
      // 总分：约 98
      expect(record.result.grade).toBe('A');
      expect(record.result.bonus).toBe(2500);  // 5000 * 0.5
    });
  });
  
  describe('stats', () => {
    it('should get level stats', () => {
      roleManager.create({ name: 'Dev1', nameZh: '开发1', level: 'L1' });
      roleManager.create({ name: 'Dev2', nameZh: '开发2', level: 'L1' });
      roleManager.create({ name: 'Dev3', nameZh: '开发3', level: 'L2' });
      
      const stats = levelManager.getLevelStats();
      
      expect(stats.L1.count).toBe(2);
      expect(stats.L2.count).toBe(1);
      expect(stats.L3.count).toBe(0);
    });
  });
});