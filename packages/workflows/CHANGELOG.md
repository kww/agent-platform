# Changelog

All notable changes to this project will be documented in this file.

## [3.0.0] - 2026-03-25

### Changed

**重大重构：层级精简 + 自动化**

| 项目 | 之前 | 之后 |
|------|------|------|
| 层级 | 5 层 | 3 层 |
| Skills | 手动维护 | 自动生成 |
| Pipelines | 独立目录 | 合并到 Steps |
| 维护成本 | 高 | 低 |

**新增功能**
- Steps 支持 agent 类型执行（合并 Pipelines）
- Skills 从 Workflows 自动生成 (`npm run generate-skills`)
- Workflows 增加 openclaw 元数据字段
- 20 个原子步骤定义
- 2 个预设模板 (new-project, iterate)

**目录结构**
```
agent-workflows/
├── tools/              # 保留 (15 个)
├── steps/              # 新增 (20 个，合并 Pipelines 能力)
├── workflows/          # 增加 openclaw 元数据 (25 个)
├── skills/             # 自动生成 (16 个)
├── templates/          # 新增
├── contexts/           # 新增
├── pipelines/          # 遗留支持
└── scripts/            # 新增 (generate-skills.ts)
```

**性能优化**
- wf-turbo: 29分钟 → 4.6分钟 (6.3x 加速)
- wf-solo-fast: 29分钟 → 13分钟 (2.2x 加速)
- 步骤缓存: 24x 加速

### Architecture

```
agent-runtime (执行引擎) → agent-workflows (本仓库)
                               ├── tools/
                               ├── steps/
                               ├── workflows/
                               └── skills/ (自动生成)
```

### Steps 分类

| 类别 | 数量 | 示例 |
|------|------|------|
| analysis | 5 | analyze-codebase, detect-context |
| design | 3 | design-architecture, design-api |
| development | 5 | develop-frontend, develop-backend |
| quality | 3 | review-code, run-tests |
| deploy | 3 | commit-push, deploy-frontend |

---

## [2.0.0] - 2026-03-24

### Changed

**Phase 1: 重构能力体系**
- 新增 Tools: spawn-codex, file-read/write/copy（共 15 个）
- 新增 Pipelines: analyze-deps, analyze-perf（共 19 个）
- 重构 Workflows: wf- 前缀命名（共 13 个）
- 创建 Skills: OpenClaw 入口 SKILL.md（共 13 个）

**目录结构**
- 移动 tools/pipelines/workflows/skills 到根目录
- 删除 packages/ 子目录
- 删除 /src/ 子目录
- 旧文件移动到 .deprecated/

**简化仓库**
- 移除 puppeteer 依赖
- 删除 memory/（不再需要）
- 删除 .clawdbot/（不再需要）
- 删除 node_modules/（无依赖）

---

## [1.0.0] - 2026-03-21

### Added
- OpenClaw Skill 支持
- 核心工作流引擎（workflow.sh）
- 12 个工作流模板
- 3 个角色配置
- Dev-Team 流程（前后端并行开发）
- 智能重试机制（最多 3 次）
- 学习积累功能
- 中途干预功能
- Docker 镜像预装依赖
- API Key 安全配置
- 定时任务（监控、清理、日志轮转）

### Security
- API Key 从 git 历史中移除
- 支持环境变量配置
- ~/.config/ 目录严格权限
