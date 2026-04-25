# Tools 工具库

> 结构重组：2026-04-18
> 目录结构：core（核心） / std（业务） / ext（外部）

---

## 目录结构

```
tools/
├── core/           # 核心工具（7 个）
│   ├── code/       # 代码操作（fingerprint, register-language）
│   ├── docker/     # Docker 操作（build, run）
│   ├── file/       # 文件操作（create, delete, move）
│   ├── git/        # Git 操作（commit, push, branch）
│   ├── notification/ # 通知（notify）
│   ├── npm/        # NPM 操作（install, build, test）
│   └── validation/ # 格式验证（yaml, types, schema）
│
├── std/            # 业务工具（17 个）
│   ├── analysis/   # 分析（analyze-codebase, analyze-dependencies）
│   ├── backlog/    # 需求管理（create, prioritize, sync）
│   ├── bugfix/     # Bug 处理（diagnose, fix, verify）
│   ├── constraint/ # 约束检查
│   ├── deploy/     # 部署（deploy-service, rollback）
│   ├── design/     # 设计（api, architecture, database）
│   ├── development/ # 开发（implement, test, refactor）
│   ├── evolution/  # 演进（migrate, upgrade）
│   ├── file/       # 文件业务操作
│   ├── governance/ # 治理（audit, review, stance）
│   ├── patch/      # 补丁（apply-patch）
│   ├── planning/   # 规划（plan-sprint, estimate）
│   ├── project/    # 项目管理（init, configure）
│   ├── quality/    # 质量（lint, test, coverage）
│   ├── quick/      # 快速操作（fix, review, test）
│   ├── verification/ # 核验（verify_completion, wait-condition）
│   └── README.md
│
└── ext/            # 外部集成（1 个）
    └── browser/    # 浏览器（automate, start, close, mcp-debug）
```

---

## 工具分类说明

| 分类 | 说明 | 特点 |
|------|------|------|
| **core** | 核心原子工具 | 无业务逻辑，纯操作封装 |
| **std** | 业务工具 | 有业务语义，组合多个 core 工具 |
| **ext** | 外部集成 | MCP、浏览器、第三方服务 |

---

## 与原结构对比

| 原位置 | 新位置 | 说明 |
|--------|--------|------|
| tools/file | tools/core/file | 核心工具 |
| tools/git | tools/core/git | 核心工具 |
| tools/npm | tools/core/npm | 核心工具 |
| tools/docker | tools/core/docker | 核心工具 |
| tools/browser | tools/ext/browser | 外部集成 |
| tools/code | tools/core/code | 核心工具 |
| tools/notification | tools/core/notification | 核心工具 |
| tools/validation | tools/core/validation | 核心工具 |
| skills/* | tools/std/* | 业务工具迁移 |
| tools/governance | tools/std/governance | 合并到 std |
| tools/verification | tools/std/verification | 业务工具 |

---

*更新时间：2026-04-18*