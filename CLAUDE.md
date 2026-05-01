# CLAUDE.md

> **DEPRECATED** — This repository is no longer maintained. Functionality has been split into:
> - `@dommaker/harness` — constraint framework (standalone package)
> - `@dommaker/runtime` — workflow execution engine (standalone package)
> - `@dommaker/workflows` — workflow definitions (standalone package)
> - `agent-studio` — business logic via `studio-*` packages
>
> Do not add new features or dependencies to this repo.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Platform is a constraint-driven AI agent execution platform: **harness** (constraint framework) + **runtime** (workflow engine) + **workflows** (150+ workflow definitions, 113 tools). Documentation is primarily in Chinese.

## Monorepo Structure

pnpm workspace with two packages:
- `packages/runtime/` — `@dommaker/runtime`: TypeScript execution engine (CLI + HTTP API on port 13202)
- `packages/workflows/` — `@dommaker/workflows`: YAML workflow/tool definitions with BATS tests

External dependency `@dommaker/harness` (^0.8.3) provides the constraint system (Iron Laws, checkpoints, gates).

## Commands

### Runtime (TypeScript)
```bash
pnpm --filter @dommaker/runtime build        # tsc
pnpm --filter @dommaker/runtime test         # jest
pnpm --filter @dommaker/runtime lint         # eslint src/
pnpm --filter @dommaker/runtime typecheck    # tsc --noEmit
```

### Workflows (YAML + BATS)
```bash
cd packages/workflows
make test          # all BATS tests
make lint          # YAML syntax check (yq)
make schema        # schema validation
make stats         # statistics report
```

### Root-level
```bash
pnpm build / pnpm test / pnpm lint / pnpm clean   # runs across all packages
```

### Run a single test (runtime)
```bash
pnpm --filter @dommaker/runtime test -- --testPathPattern="filename"
```

## Architecture

Three-layer dependency: `harness` → `runtime` → `workflows`

### Runtime core (`packages/runtime/src/`)
- **`core/`** (~30 files): executor, parser, registry, scheduler, state, baseline-validator, risk-assessor, token-tracker, progress-tracker, history-compressor, output-processor, agent-fallback, notification-service, mcp-client
- **`executors/`** (4 files): tool execution, agent spawning (Codex/Claude Code), evolution, understand
- **`monitoring/`**: Prometheus metrics, performance regression, quality scoring, golden-master testing
- **`middleware/auth.ts`**: JWT + API Key auth (HMAC-SHA256)
- **`server.ts`**: Express 5.x HTTP API
- **`cli.ts`**: Commander.js CLI (`agent-runtime` binary)

> 业务逻辑（角色、治理、会议编排、经济系统等）已迁移到 agent-studio 的 `studio-*` 包中。runtime 只保留通用工作流执行引擎。

### Integration flow
`executeWorkflow()` → `checkConstraints()` [harness] → `executeStep()` → `verifyCheckpoint()` [harness] → `spawnAgent()`/`executeTool()` → `PassesGate.validate()` [harness]

### Workflows (`packages/workflows/`)
- `workflows/` — 20 YAML workflow defs (wf-dev is primary, with auto mode detection)
- `tools/core/` — 22 built-in tools (file, git, npm, docker, etc.)
- `tools/std/` — 87 standard tools (governance, analysis, development, quality, etc.)
- `tools/ext/` — 4 browser automation tools
- `contexts/` — framework/language context templates

## Key Conventions

- **TypeScript**: strict mode, ES2022 target, CommonJS modules
- **Testing**: Jest with ts-jest, 60% coverage thresholds (runtime); BATS (workflows)
- **Commit style**: conventional commits (feat/fix/refactor/docs)
- **Node**: >= 20.0.0 required
- **Package manager**: pnpm >= 9.0.0

## Environment Variables

Runtime config via env vars (no .env committed):
- `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` — LLM config
- `CODING_API_KEY`, `ANTHROPIC_API_KEY` — agent API keys
- `JWT_SECRET`, `RUNTIME_API_KEY` — auth
- `AGENT_WORKFLOWS_PATH` — custom workflows path
- `AGENT_STUDIO_URL` — event push target (default: localhost:13101)
- `DEFAULT_TIMEOUT`, `MAX_RETRIES`, `MAX_CONCURRENT` — execution tuning

## CI

GitHub Actions (`ci.yml`): runs on push/PR to `master`, Node 20+22 matrix — typecheck → lint → build → test for runtime package. Publish workflow triggers on `v*` tags.
