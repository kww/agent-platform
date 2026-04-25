# 项目约束配置指南

## 概述

本文档说明如何为不同项目配置质量约束。

---

## 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: 平台项目                             │
│  agent-workflows / agent-runtime / agent-studio                │
│  → 强制 CI 检查，PR 必须通过                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 2: 业务项目                             │
│  用户自己的项目                                                  │
│  → 可选 CI 检查，推荐但非强制                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 3: 任务验证                             │
│  工作流内置的 per-task review                                    │
│  → 自动执行，无需配置                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 平台项目约束（已实现）

### agent-workflows

| 检查项 | CI Job | 说明 |
|--------|--------|------|
| YAML 语法 | `validate` | 所有 .yml 文件语法正确 |
| README 统计 | `validate` | 统计数据与实际一致 |
| Handler 注册 | agent-runtime 测试 | 所有 handler 已注册 |

**CI 文件**: `.github/workflows/validate.yml`

### agent-runtime

| 检查项 | CI Job | 说明 |
|--------|--------|------|
| 构建 | `build-and-test` | TypeScript 编译通过 |
| 测试 | `build-and-test` | 单元测试通过 |
| Handler 注册 | 测试内 | 所有 handler 已注册 |

**CI 文件**: `.github/workflows/ci.yml`

---

## 业务项目约束（推荐配置）

### 方式 1: 复制 CI 模板

```bash
# 复制模板到你的项目
cp templates/ci-template.yml your-project/.github/workflows/ci.yml
```

**包含的检查**：
- Lint 检查
- 类型检查
- 单元测试
- YAML 语法检查
- tasks.yml 格式检查

### 方式 2: 使用验证工作流

```bash
# 在开发前验证项目
/wf-validate-project /path/to/your-project
```

**检查项**：
- 项目结构完整性
- Git 状态
- 依赖安装
- tasks.yml 规范

### 方式 3: 工作流内置验证

在自定义工作流中添加验证步骤：

```yaml
steps:
  # 前置验证
  - id: validate-project
    step: validation/check-project-structure
    input:
      project_path: "${inputs.project_path}"
  
  # 继续执行...
```

---

## 约束级别建议

| 项目类型 | 推荐约束级别 | 配置方式 |
|---------|-------------|---------|
| **生产项目** | 严格 | CI 模板 + 分支保护 |
| **内部工具** | 中等 | CI 模板（可选） |
| **原型/实验** | 宽松 | 工作流内置验证 |
| **开源项目** | 严格 | CI 模板 + PR 检查 |

---

## 配置示例

### 生产项目 CI

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
  
  test:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
  
  # 分支保护：必须通过
```

### 分支保护规则

```
Settings → Branches → Add rule
- Require status checks to pass before merging
  - quality
  - test
- Require branches to be up to date before merging
```

---

## 工作流内置约束

无论项目是否配置 CI，工作流本身都有内置约束：

### 1. tasks.yml 规范检查

```yaml
# planning/validate-tasks
- project 必需字段检查
- tasks 至少 1 个
- task.id 唯一性
- 无循环依赖
```

### 2. Per-Task Review

```yaml
# 每个 task 完成后
implement → review → [fix] → commit
```

### 3. 完成验证

```yaml
# verification/verify_completion
- 运行验证命令
- 检查输出匹配
- 生成证据
```

---

## 总结

| 层级 | 约束方式 | 适用项目 |
|------|---------|---------|
| **平台** | 强制 CI | agent-workflows, agent-runtime |
| **业务** | 推荐 CI | 用户项目 |
| **任务** | 工作流内置 | 所有项目 |

**原则**：
- 平台项目必须严格，因为影响所有下游用户
- 业务项目推荐配置，但尊重用户选择
- 工作流内置验证保证最低质量底线
