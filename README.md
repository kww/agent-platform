# Agent Platform

> **DEPRECATED** — 此项目已废弃，功能已迁移至以下项目：
>
> - **约束框架** → [@dommaker/harness](https://github.com/dommaker/harness) (独立包，v0.9.0+)
> - **工作流执行** → [@dommaker/runtime](https://github.com/dommaker/runtime) (独立包)
> - **工作流定义** → [@dommaker/workflows](https://github.com/dommaker/workflows) (独立包)
> - **业务逻辑** → [Agent Studio](https://github.com/dommaker/agent-studio) (studio-* 包)
>
> 此仓库仅保留历史参考，不再维护。

---

## 原始说明

约束驱动的 Agent 执行平台 — harness + runtime + workflows

### 原有 Packages

| 包 | 状态 | 说明 |
|------|:----:|------|
| @dommaker/runtime | 已迁移 | 工作流执行引擎 → 独立仓库 |
| @dommaker/workflows | 已迁移 | 工作流定义 (150+ workflows + 113 tools) → 独立仓库 |
| @dommaker/harness | 已迁移 | 约束框架 → 独立仓库 |

### 迁移时间线

- 2026-04-28: harness 独立为 @dommaker/harness
- 2026-04-29: runtime/workflows 独立为 @dommaker/runtime, @dommaker/workflows
- 2026-05-01: 业务逻辑迁移到 agent-studio 的 studio-* 包
- 2026-05-02: 标记为 DEPRECATED

---

## License

MIT © dommaker
