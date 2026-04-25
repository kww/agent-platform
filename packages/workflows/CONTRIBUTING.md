# Contributing

感谢你考虑为 Agent Workflows 做贡献！

## 如何贡献

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -m "feat: 添加某某功能"`
4. 推送分支：`git push origin feature/your-feature`
5. 创建 Pull Request

## 代码规范

- Shell 脚本使用 `#!/bin/bash` 开头
- 添加详细的功能说明注释
- 提交信息使用 Conventional Commits

## 开发环境

```bash
git clone https://github.com/kww/agent-workflows.git
cd agent-workflows
mkdir -p ~/.config/agent-workflows
cp .clawdbot/api-keys.sh.example ~/.config/agent-workflows/api-keys.sh
cd docker && docker build -t claude-code:fast .
```
