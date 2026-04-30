#!/usr/bin/env node

/**
 * @dommaker/workflows CLI
 * 
 * 命令：
 * - workflows list [type] - 列出 workflows/tools/contexts
 * - workflows validate [file] - 验证 YAML 语法
 * - workflows stats - 显示统计信息
 */

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

// 读取 package.json 版本
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

// 包根目录
const PKG_ROOT = path.join(__dirname, '..');

program
  .name('workflows')
  .description('@dommaker/workflows - AI Agent 工作流定义仓库')
  .version(packageJson.version);

// ============================================
// list 命令
// ============================================

function listYamlFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return [];
  const files = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listYamlFiles(fullPath, prefix + entry.name + '/'));
    } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
      files.push(prefix + entry.name.replace(/\.ya?ml$/, ''));
    }
  }
  return files;
}

function listYamlFilePaths(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listYamlFilePaths(fullPath));
    } else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) {
      files.push(fullPath);
    }
  }
  return files;
}

program
  .command('list [type]')
  .description('列出能力（workflows / tools / contexts / templates）')
  .action((type) => {
    const types = type ? [type] : ['workflows', 'tools', 'contexts', 'templates'];
    
    for (const t of types) {
      const dir = path.join(PKG_ROOT, t);
      if (!fs.existsSync(dir)) continue;
      
      const files = listYamlFiles(dir);
      
      console.log(`\n${t.toUpperCase()} (${files.length})`);
      files.slice(0, 50).forEach(f => {
        console.log(`  ${f}`);
      });
      if (files.length > 50) {
        console.log(`  ... 还有 ${files.length - 50} 个`);
      }
    }
  });

// ============================================
// validate 命令
// ============================================

program
  .command('validate [file]')
  .description('验证 YAML 文件语法')
  .option('--dir <dir>', '验证整个目录')
  .action((file, options) => {
    const errors = [];
    
    if (options.dir) {
      // 验证目录（递归）
      const dir = path.join(PKG_ROOT, options.dir);
      if (!fs.existsSync(dir)) {
        console.error(`目录不存在: ${options.dir}`);
        process.exit(1);
      }

      const filePaths = listYamlFilePaths(dir);
      filePaths.forEach(f => {
        const relative = path.relative(PKG_ROOT, f);
        try {
          yaml.parse(fs.readFileSync(f, 'utf-8'));
          console.log(`✅ ${relative}`);
        } catch (e) {
          console.log(`❌ ${relative}: ${e.message}`);
          errors.push(relative);
        }
      });
    } else if (file) {
      // 验证单个文件
      try {
        yaml.parse(fs.readFileSync(file, 'utf-8'));
        console.log(`✅ ${file} 语法正确`);
      } catch (e) {
        console.log(`❌ ${file}: ${e.message}`);
        process.exit(1);
      }
    } else {
      // 验证所有（递归）
      ['workflows', 'tools', 'contexts', 'templates'].forEach(dir => {
        const dirPath = path.join(PKG_ROOT, dir);
        if (!fs.existsSync(dirPath)) return;

        const filePaths = listYamlFilePaths(dirPath);
        filePaths.forEach(f => {
          const relative = path.relative(PKG_ROOT, f);
          try {
            yaml.parse(fs.readFileSync(f, 'utf-8'));
          } catch (e) {
            errors.push(`${relative}: ${e.message}`);
          }
        });
      });
      
      if (errors.length === 0) {
        console.log('✅ 所有 YAML 文件语法正确');
      } else {
        console.log(`❌ 发现 ${errors.length} 个错误:`);
        errors.forEach(e => console.log(`  ${e}`));
        process.exit(1);
      }
    }
  });

// ============================================
// stats 命令
// ============================================

function countYamlFiles(dir) {
  return listYamlFiles(dir).length;
}

program
  .command('stats')
  .description('显示统计信息')
  .action(() => {
    const stats = {
      workflows: countYamlFiles(path.join(PKG_ROOT, 'workflows')),
      tools: countYamlFiles(path.join(PKG_ROOT, 'tools')),
      contexts: countYamlFiles(path.join(PKG_ROOT, 'contexts')),
      templates: countYamlFiles(path.join(PKG_ROOT, 'templates')),
    };
    
    console.log('\n📊 @dommaker/workflows 统计');
    console.log(`  Workflows: ${stats.workflows}`);
    console.log(`  Tools:     ${stats.tools}`);
    console.log(`  Contexts:  ${stats.contexts}`);
    console.log(`  Templates: ${stats.templates}`);
    console.log(`  总计:      ${Object.values(stats).reduce((a, b) => a + b, 0)}`);
  });

program.parse();