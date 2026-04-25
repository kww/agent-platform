# Agent Platform

> Monorepo for workflows + runtime
> 创建时间：2026-04-18

## 目录结构

```
packages/
├── workflows/    # @dommaker/workflows - 工作流定义层
│   ├── workflows/
│   ├── tools/
│   │   ├── core/    # 核心工具：file, git, npm, docker
│   │   ├── std/     # 业务工具：原 skills 迁移
│   │   └── ext/     # 外部集成：browser
│   ├── contexts/
│   └── registry/
│
└── runtime/      # @dommaker/runtime - 执行引擎层
    ├── src/
    │   ├── core/
    │   ├── orchestration/
    │   └── api/
    └── tests/
```

## 包名

- `@dommaker/workflows` - 工作流定义
- `@dommaker/runtime` - 执行引擎

## 快速开始

```bash
pnpm install
pnpm --filter @dommaker/runtime build
```

## 迁移状态

| 包 | 状态 |
|---|:---:|
| workflows | ✅ 已迁移（skills → tools/std） |
| runtime | ✅ 已迁移（路径已更新） |

---

*更新时间：2026-04-18 17:17*