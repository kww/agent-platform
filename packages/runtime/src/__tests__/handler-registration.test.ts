/**
 * Handler 注册完整性测试
 * 
 * 检查 agent-workflows 中所有 step 的 handler 是否已在 builtin-handlers 中注册
 * 
 * 目的：防止新增 step 后忘记注册 handler
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Handler Registration', () => {
  // 动态导入，避免循环依赖
  const handlers = require('../core/builtin-handlers').builtinHandlers;
  
  // agent-workflows 路径（相对于此测试文件）
  // 尝试多个可能的路径
  const possiblePaths = [
    path.resolve(__dirname, '../../../../agent-workflows'),  // 相对于测试文件
    path.resolve(__dirname, '../../../agent-workflows'),      // 项目根目录下
    '/root/projects/agent-workflows',                         // 服务器路径
  ];
  
  const workflowsPath = possiblePaths.find(p => fs.existsSync(path.join(p, 'skills'))) || '';
  
  it('all step handlers should be registered in builtin-handlers.ts', () => {
    const stepsDir = path.join(workflowsPath, 'skills');
    
    // 如果 agent-workflows 不存在，跳过测试
    if (!workflowsPath || !fs.existsSync(stepsDir)) {
      console.log('⏭️  Skipping: agent-workflows/steps not found');
      return;
    }
    
    const missingHandlers: Array<{ handler: string; file: string }> = [];
    const registeredHandlers: string[] = [];
    
    // 递归扫描 steps 目录
    const scanDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          
          // 提取 handler 字段
          const match = content.match(/^\s*handler:\s*['"]?([^'"\n]+)['"]?/m);
          
          if (match) {
            const handler = match[1].trim();
            const relativePath = path.relative(workflowsPath, fullPath);
            
            if (handlers[handler]) {
              registeredHandlers.push(handler);
            } else {
              missingHandlers.push({
                handler,
                file: relativePath,
              });
            }
          }
        }
      }
    };
    
    scanDir(stepsDir);
    
    // 输出统计
    console.log(`\n📊 Handler 统计:`);
    console.log(`  已注册: ${registeredHandlers.length} 个`);
    console.log(`  未注册: ${missingHandlers.length} 个`);
    
    // 如果有缺失，输出详细信息
    if (missingHandlers.length > 0) {
      console.log('\n❌ 未注册的 handler:');
      missingHandlers.forEach(({ handler, file }) => {
        console.log(`  - ${handler} (from ${file})`);
      });
      console.log('\n请在 src/core/builtin-handlers.ts 中注册这些 handler');
    }
    
    // 测试断言
    expect(missingHandlers).toHaveLength(0);
  });
  
  it('should have all expected governance handlers registered', () => {
    const expectedHandlers = [
      'governance/create-voting-session',
      'governance/cast-vote',
      'governance/vote-tally',
      'governance/audit-task',
      'governance/impeach',
      'governance/track-effect',
      'governance/rollback',
    ];
    
    for (const handler of expectedHandlers) {
      expect(handlers[handler]).toBeDefined();
    }
  });
  
  it('should have all evolution handlers registered', () => {
    const expectedHandlers = [
      'evolution/report-gap',
      'evolution/prioritize',
    ];
    
    for (const handler of expectedHandlers) {
      expect(handlers[handler]).toBeDefined();
    }
  });
});
