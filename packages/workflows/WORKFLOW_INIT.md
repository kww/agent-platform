# 工作流初始化模板

当用户触发的 Skill 需要更多信息才能确定执行路径时，使用此模板收集信息。

## 触发条件

- 意图解析后信息不足
- 用户主动选择初始化

## 使用方式

```bash
agent-runtime init <skill-id> --interactive
```

## 模板字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `项目名称` | text | ✅ | 目标项目名称 |
| `项目类型` | select | ✅ | frontend/backend/fullstack |
| `团队规模` | number | ❌ | 团队人数，用于路由决策 |
| `快速模式` | boolean | ❌ | 是否启用快速原型模式 |
| `技术栈` | multi-select | ❌ | React/Vue/Next.js/Node.js 等 |
| `需求描述` | textarea | ✅ | 详细需求描述 |

## 示例输出

```yaml
project:
  name: my-app
  type: fullstack
  teamSize: 1
  fastMode: false
  techStack:
    - Next.js
    - TypeScript
  requirement: |
    实现用户登录功能，支持邮箱和手机号登录
```

## 路由映射

收集的信息将转换为路由上下文：

```javascript
{
  项目配置: {
    团队规模: 1,
    快速模式: false,
    项目类型: 'fullstack'
  }
}
```

然后调用 `routeToWorkflow(skillId, context)` 确定最终 Workflow。
