# RC-001: 责任链模型实现

> 任务ID: RC-001~009
> 创建时间: 2026-04-22 14:50
> 设计文档: `projects/agent-platform/responsibility-chain-design.md`
> 工作量: 8.5h

---

## 目标

统一 Stage → Role → Tools → Constraint 映射规则，消除硬编码配置。

---

## 范围

### 包含

- 新建 `responsibility-chain.ts` 配置 + 决策函数
- 新建 `stage-definitions.ts` Stage 定义 + 推荐函数
- 新增 Git Hook 校验脚本
- 更新所有 Workflow YAML（18 个）
- 更新所有 Tool YAML（29 个）
- 改造 role-service.ts（改用 deriveRoleConfig）
- 改造 registry.ts（按 Stage 分类）
- 测试验证

### 不包含

- UI 分类 API（后续任务）
- SpecReview 集成（后续任务）

---

## 预期变更

| 类型 | 文件路径 | 说明 |
|:----:|------|------|
| **新增** | runtime/src/core/responsibility-chain.ts | 责任链配置 + decideParticipants() |
| **新增** | runtime/src/core/stage-definitions.ts | Stage 定义 + suggestStage() |
| **新增** | workflows/config/stage-definitions.yml | YAML 版 Stage 定义 |
| **新增** | scripts/hooks/check-stage-field.sh | Git Hook 校验 |
| **新增** | runtime/src/core/__tests__/responsibility-chain.test.ts | 测试文件 |
| **修改** | studio-role/src/services/role-service.ts | 改用 deriveRoleConfig() |
| **修改** | runtime/src/core/registry.ts | 新增 stage 分类逻辑 |
| **修改** | workflows/workflows/*.yml (18) | 新增 stage 字段 |
| **修改** | workflows/tools/std/**/*.yml (29) | 新增 stage 字段 |

---

## 架构设计

### 核心类型

```typescript
type Stage = 'plan' | 'develop' | 'verify' | 'deploy' | 'fix' | 'govern';
type Role = 'architect' | 'tech-lead' | 'developer' | 'qa' | 'pm' | 'ceo';
type ConstraintLevel = 'L1' | 'L2' | 'L3' | 'L4';
type ChangeType = 'database' | 'api_contract' | 'security' | 'finance' | ...;
```

### 核心配置

```typescript
const RESPONSIBILITY_CHAIN: Record<Stage, Role[]> = {
  plan: ['architect', 'pm', 'tech-lead'],
  develop: ['tech-lead', 'developer'],
  verify: ['qa', 'tech-lead'],
  deploy: ['tech-lead', 'pm'],
  fix: ['tech-lead', 'developer'],
  govern: ['architect', 'tech-lead', 'pm', 'ceo'],
};

const CHANGE_TYPE_EXPERTS: Record<ChangeType, Role[]> = {
  database: ['architect'],
  api_contract: ['architect'],
  security: ['architect', 'tech-lead'],
  finance: ['pm', 'ceo'],
  ...
};

const STAGE_TOOLS: Record<Stage, string[]> = {
  plan: ['analysis/*', 'design/*', 'planning/*', 'backlog/*'],
  develop: ['development/*'],
  verify: ['verification/*', 'quality/*'],
  deploy: ['deploy/*'],
  fix: ['bugfix/*', 'patch/*'],
  govern: ['governance/*', 'constraint/*', 'evolution/*'],
};
```

### 核心函数

```typescript
function decideParticipants(
  stage: Stage,
  constraintLevel: ConstraintLevel,
  changeTypes: ChangeType[]
): Role[];

function deriveRoleConfig(role: Role): {
  stages: Stage[];
  workflows: string[];
  tools: string[];
};

function suggestStage(name: string, description: string): Stage[];
```

---

## 验收标准

| AC | 验收条件 | 测试方法 |
|:--:|---------|---------|
| AC-001 | RESPONSIBILITY_CHAIN 配置存在 | 检查文件 |
| AC-002 | decideParticipants() 正确返回角色 | 单元测试 |
| AC-003 | deriveRoleConfig() 正确推导角色配置 | 单元测试 |
| AC-004 | suggestStage() 正确推荐阶段 | 单元测试 |
| AC-005 | Git Hook 校验生效 | 手动测试 |
| AC-006 | 所有 Workflow YAML 有 stage 字段 | grep 检查 |
| AC-007 | 所有 Tool YAML 有 stage 字段 | grep 检查 |
| AC-008 | role-service.ts 使用 deriveRoleConfig | 代码检查 |
| AC-009 | registry.ts 按 Stage 分类 | API 测试 |
| AC-010 | npm run build 成功 | 构建验证 |

---

## 实现步骤

| Step | 内容 | 工作量 |
|:---:|------|:------:|
| 1 | 创建 responsibility-chain.ts | 1h |
| 2 | 创建 stage-definitions.ts | 0.5h |
| 3 | 创建 Git Hook | 0.5h |
| 4 | 更新 Workflow YAML (18) | 1h |
| 5 | 更新 Tool YAML (29) | 2h |
| 6 | 更新 registry.ts | 1h |
| 7 | 更新 role-service.ts | 1h |
| 8 | 测试验证 | 1h |

---

## 依赖

### 内部依赖

- @dommaker/runtime（新建文件位置）
- @dommaker/studio-role（改造 role-service）

### 外部依赖

- 无

---

## 风险与约束

| 风险 | 缓解措施 |
|------|---------|
| YAML 文件遗漏 stage 字段 | Git Hook 校验 |
| role-service 改造破坏现有功能 | 先测试现有 API |
| Stage 分类与目录结构不一致 | 统一映射表 |

---

## 设计对齐检查

- ✅ 设计文档完整（responsibility-chain-design.md）
- ✅ 类型定义明确
- ✅ 函数签名明确
- ✅ 与 ROLE_TYPE_CONFIG 替代方案明确

---

*Spec 版本: v1.0*
*创建时间: 2026-04-22 14:50*