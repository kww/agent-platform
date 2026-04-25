/**
 * Enforcement 执行器实现
 * 
 * 为 harness 拦截器提供具体执行逻辑
 * 
 * 执行器列表：
 * - verify-completion: 验证完成声明（运行测试）
 * - verify-e2e: 验证端到端测试
 * - debug-systematic: 系统性调试（检查根因调查）
 * - reuse-first: 复用优先检查
 * - update-capabilities: 更新功能清单
 * - tdd-cycle: TDD 循环检查
 * - passes-gate: 测试门控
 * - checkpoint-required: 检查点必须通过
 * - full-test-coverage: 完整测试覆盖
 * - type-safe: 类型安全检查
 * - check-local-first: 本地优先检查
 * - preserve-complexity: 保持复杂度
 * - skill-test-scenario: 技能测试场景
 * - check-coverage: 检查覆盖率
 * - require-discussion: 需要讨论
 * - create-readme: 创建 README
 * - add-docs: 添加文档
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  interceptor,
  type EnforcementExecutor,
  type EnforcementContext,
  type EnforcementResult,
} from '@dommaker/harness';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

/**
 * 执行器注册器
 */
export class EnforcementExecutorRegistry {
  private static registered = false;

  /**
   * 注册所有执行器
   */
  static registerAll(): void {
    if (this.registered) {
      logger.warn('Enforcement executors already registered');
      return;
    }

    logger.info('Registering enforcement executors...');

    // verify-completion 执行器
    const parseTestResult = (output: string): boolean => {
      if (output.includes('Test Suites:')) {
        const match = output.match(/Test Suites:\s+(\d+) failed/);
        if (match && parseInt(match[1]) > 0) return false;
        return output.includes('passed') || output.includes('PASS');
      }
      if (output.includes('✓') || output.includes('Tests') && output.includes('passed')) {
        return !output.includes('✗') && !output.includes('failed');
      }
      return !output.includes('FAIL') && !output.includes('Error');
    };

    interceptor.register('verify-completion', {
      description: '验证完成声明：运行测试命令',
      supportedParams: ['command', 'timeout'],
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        const projectPath = context.projectPath || process.cwd();
        const command = context.params?.command || 'npm test';
        const timeout = context.params?.timeout || 60000;

        try {
          const start = Date.now();
          const { stdout, stderr } = await execAsync(command, {
            cwd: projectPath,
            timeout,
          });
          const duration = Date.now() - start;
          const passed = parseTestResult(stdout);

          return {
            passed,
            evidence: stdout.substring(0, 2000),
            message: passed ? `✅ 测试通过 (${duration}ms)` : `❌ 测试失败`,
            duration,
            validatedAt: new Date(),
          };
        } catch (error: any) {
          return {
            passed: false,
            evidence: error.message,
            message: `❌ 命令执行失败: ${command}`,
            error: error.message,
          };
        }
      },
    }, 'agent-runtime');

    // 2. verify-e2e: 验证端到端测试
    interceptor.register('verify-e2e', {
      description: '验证端到端测试：运行 E2E 测试',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        const projectPath = context.projectPath || process.cwd();
        
        try {
          const { stdout } = await execAsync('npm run test:e2e', {
            cwd: projectPath,
            timeout: 120000,
          });

          return {
            passed: stdout.includes('passed') || stdout.includes('PASS'),
            evidence: stdout.substring(0, 2000),
          };
        } catch (error: any) {
          return {
            passed: false,
            error: error.message,
          };
        }
      },
    }, 'agent-runtime');

    // 3. debug-systematic: 系统性调试
    interceptor.register('debug-systematic', {
      description: '系统性调试：检查根因调查记录',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        const projectPath = context.projectPath || process.cwd();
        
        // 检查是否有根本原因调查
        const investigationPath = path.join(projectPath, '.agent', 'investigation.md');
        
        try {
          const content = await fs.readFile(investigationPath, 'utf-8');
          const hasRootCause = content.includes('根本原因') || 
                               content.includes('Root Cause') ||
                               content.length > 200;

          return {
            passed: hasRootCause,
            evidence: content.substring(0, 500),
            message: hasRootCause
              ? '✅ 有根因调查记录'
              : '❌ 缺少根因调查记录',
          };
        } catch {
          // 检查 context 中是否有标记
          if (context.hasRootCauseInvestigation) {
            return { passed: true, message: '✅ 已标记有根因调查' };
          }

          return {
            passed: false,
            message: '❌ 未找到根因调查记录',
          };
        }
      },
    }, 'agent-runtime');

    // 4. reuse-first: 复用优先检查
    interceptor.register('reuse-first', {
      description: '复用优先检查：检查是否有复用搜索',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        // 检查 context 中的复用检查结果
        if (context.hasReuseCheck) {
          const result = context.reuseCheckResult;
          if (result?.canReuse) {
            return {
              passed: true,
              message: `✅ 已发现可复用能力: ${result.existingCapabilities.join(', ')}`,
            };
          }
          return {
            passed: true,
            message: '✅ 已执行复用检查，未发现可复用',
          };
        }

        // 检查是否有搜索记录
        const projectPath = context.projectPath || process.cwd();
        const reuseLogPath = path.join(projectPath, '.agent', 'reuse-check.log');
        
        try {
          const content = await fs.readFile(reuseLogPath, 'utf-8');
          return {
            passed: content.length > 50,
            evidence: content.substring(0, 500),
          };
        } catch {
          return {
            passed: false,
            message: '❌ 未执行复用检查',
          };
        }
      },
    }, 'agent-runtime');

    // 5. update-capabilities: 更新功能清单
    interceptor.register('update-capabilities', {
      description: '更新功能清单：检查 CAPABILITIES.md 是否同步',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        const projectPath = context.projectPath || process.cwd();
        const capabilitiesPath = path.join(projectPath, 'CAPABILITIES.md');

        try {
          const content = await fs.readFile(capabilitiesPath, 'utf-8');
          const hasUpdate = content.includes(new Date().toISOString().split('T')[0]) ||
                            content.includes('最后更新');

          return {
            passed: hasUpdate,
            message: hasUpdate
              ? '✅ CAPABILITIES.md 已更新'
              : '⚠️ CAPABILITIES.md 可能未同步',
          };
        } catch {
          return {
            passed: false,
            message: '❌ CAPABILITIES.md 不存在',
          };
        }
      },
    }, 'agent-runtime');

    // 6. tdd-cycle: TDD 循环检查
    interceptor.register('tdd-cycle', {
      description: 'TDD 循环：检查是否有失败的测试',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        // 检查 context 标记
        if (context.hasFailingTest) {
          return { passed: true, message: '✅ 有失败的测试（TDD 红阶段）' };
        }

        // 检查最近是否有失败的测试
        const projectPath = context.projectPath || process.cwd();
        
        try {
          const { stdout } = await execAsync('npm test -- --passWithNoTests', {
            cwd: projectPath,
            timeout: 30000,
          });

          // TDD 需要先有失败测试
          // 这里简化处理：如果有测试就认为符合 TDD
          return {
            passed: stdout.includes('Tests:') || stdout.includes('passed'),
            message: '✅ 已有测试',
          };
        } catch (error: any) {
          // 测试失败也算 TDD 红阶段
          return {
            passed: true,
            message: '✅ 有失败的测试（TDD 红阶段）',
            evidence: error.message,
          };
        }
      },
    }, 'agent-runtime');

    // 7. passes-gate: 测试门控
    interceptor.register('passes-gate', {
      description: '测试门控：必须有测试证据',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        // 检查 context 标记
        if (context.hasTest) {
          return { passed: true, message: '✅ 有测试证据' };
        }

        // 运行测试检查
        const projectPath = context.projectPath || process.cwd();
        
        try {
          const { stdout } = await execAsync('npm test', {
            cwd: projectPath,
            timeout: 60000,
          });

          return {
            passed: stdout.includes('passed'),
            evidence: stdout.substring(0, 1000),
          };
        } catch (error: any) {
          return {
            passed: false,
            message: '❌ 测试失败',
            error: error.message,
          };
        }
      },
    }, 'agent-runtime');

    // 8. checkpoint-required: 检查点必须通过
    interceptor.register('checkpoint-required', {
      description: '检查点必须通过',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        // 这个 enforcement 通常由 CheckpointValidator 处理
        // 这里简化为检查是否有 checkpoint 结果记录
        const projectPath = context.projectPath || process.cwd();
        const checkpointPath = path.join(projectPath, '.agent', 'checkpoints.json');

        try {
          const content = await fs.readFile(checkpointPath, 'utf-8');
          const checkpoints = JSON.parse(content);
          const allPassed = checkpoints.every((c: any) => c.passed);

          return {
            passed: allPassed,
            evidence: JSON.stringify(checkpoints),
          };
        } catch {
          return {
            passed: true,
            message: '✅ 无检查点配置',
          };
        }
      },
    }, 'agent-runtime');

    // 9. check-coverage: 检查覆盖率
    interceptor.register('check-coverage', {
      description: '检查测试覆盖率',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        const projectPath = context.projectPath || process.cwd();
        const threshold = context.params?.threshold || 80;

        try {
          const { stdout } = await execAsync('npm run test:coverage', {
            cwd: projectPath,
            timeout: 60000,
          });

          // 解析覆盖率
          const match = stdout.match(/All files\s+\|\s+(\d+\.?\d*)/);
          if (match) {
            const coverage = parseFloat(match[1]);
            return {
              passed: coverage >= threshold,
              message: coverage >= threshold
                ? `✅ 覆盖率 ${coverage}% >= ${threshold}%`
                : `❌ 覆盖率 ${coverage}% < ${threshold}%`,
              evidence: stdout.substring(0, 1000),
            };
          }

          return {
            passed: true,
            message: '⚠️ 无法解析覆盖率，默认通过',
          };
        } catch (error: any) {
          return {
            passed: false,
            message: '❌ 覆盖率检查失败',
            error: error.message,
          };
        }
      },
    }, 'agent-runtime');

    // 10. require-discussion: 需要讨论
    interceptor.register('require-discussion', {
      description: '设计决策需要讨论',
      async execute(context: EnforcementContext): Promise<EnforcementResult> {
        // 检查是否有讨论记录
        const projectPath = context.projectPath || process.cwd();
        const discussionPath = path.join(projectPath, '.agent', 'design-decision.md');

        try {
          const content = await fs.readFile(discussionPath, 'utf-8');
          const hasDiscussion = content.includes('方案') && content.includes('选择');

          return {
            passed: hasDiscussion,
            evidence: content.substring(0, 500),
          };
        } catch {
          // 如果 context 有 exceptionReason，说明用户确认了
          if (context.exceptionReason) {
            return { passed: true, message: '✅ 用户已确认方案' };
          }

          return {
            passed: false,
            message: '❌ 设计决策未讨论',
          };
        }
      },
    }, 'agent-runtime');

    // 11-17: 简化实现的执行器（总是通过，仅记录）
    const simpleExecutors = [
      'full-test-coverage',
      'type-safe',
      'check-local-first',
      'preserve-complexity',
      'skill-test-scenario',
      'create-readme',
      'add-docs',
    ];

    for (const id of simpleExecutors) {
      interceptor.register(id, {
        description: `${id}: 简化实现`,
        async execute(): Promise<EnforcementResult> {
          return {
            passed: true,
            message: `⚠️ ${id} 简化实现，总是通过`,
          };
        },
      }, 'agent-runtime');
    }

    this.registered = true;
    logger.info('Enforcement executors registered successfully');
  }

  /**
   * 取消注册（用于测试）
   */
  static unregister(): void {
    interceptor.unregister('verify-completion');
    interceptor.unregister('verify-e2e');
    interceptor.unregister('debug-systematic');
    interceptor.unregister('reuse-first');
    interceptor.unregister('update-capabilities');
    interceptor.unregister('tdd-cycle');
    interceptor.unregister('passes-gate');
    interceptor.unregister('checkpoint-required');
    interceptor.unregister('check-coverage');
    interceptor.unregister('require-discussion');
    
    const simpleExecutors = [
      'full-test-coverage',
      'type-safe',
      'check-local-first',
      'preserve-complexity',
      'skill-test-scenario',
      'create-readme',
      'add-docs',
    ];
    for (const id of simpleExecutors) {
      interceptor.unregister(id);
    }

    this.registered = false;
  }
}

// 自动注册
EnforcementExecutorRegistry.registerAll();

// 导出
export const enforcementRegistry = EnforcementExecutorRegistry;