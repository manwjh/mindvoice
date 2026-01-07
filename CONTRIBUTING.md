# 贡献指南 (Contributing Guide)

感谢您对MindVoice项目的关注！我们欢迎所有形式的贡献。

## 📋 开始之前

### 1. 阅读并签署CLA ⭐ 必须
在提交代码前，请**务必阅读并签署** [贡献者许可协议 (CLA)](./CLA.md)。

**为什么需要CLA？**
- 保护项目的法律安全
- 允许维护者将贡献用于商业版本（MindVoice Pro）
- 确保项目的可持续发展

**如何签署？**
在您的Pull Request中添加注释：
```
我已阅读并同意MindVoice CLA协议
I have read and agree to the MindVoice CLA
```

### 2. 了解项目架构
- 阅读 [README.md](./README.md) 了解项目概况
- 查看 [编程规则](./.cursorrules) 了解代码规范
- 浏览 [文档](./docs/) 了解架构设计

## 🤝 贡献方式

### 代码贡献
1. Fork本项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交改动 (`git commit -m 'feat: 添加某功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建Pull Request
6. **在PR中签署CLA**

### 提交信息规范
遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：
```
feat: 添加新功能
fix: 修复Bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建/工具链改动
```

### Bug报告
- 使用 GitHub Issues
- 提供详细的复现步骤
- 包含系统环境信息

### 功能建议
- 先创建 Issue 讨论
- 说明使用场景和价值
- 考虑向后兼容性

## 🔒 商业版本说明

- **开源版**（本仓库）：社区版，MIT许可
- **Pro版**：商业版，专有许可，包含高级功能

您的贡献**可能被用于Pro版本**，具体见 [CLA](./CLA.md)。

## 📝 代码规范

### Python
- 遵循 PEP 8
- 使用类型注解
- 添加文档字符串

### TypeScript/React
- 使用函数组件和Hooks
- Props类型定义
- 避免使用any

### 测试
- 为关键功能编写测试
- 确保所有测试通过

## ⚖️ 许可证

- 开源版：[MIT License](./LICENSE)
- 贡献者：签署 [CLA](./CLA.md)

## 📧 联系方式

- 邮箱：manwjh@126.com
- GitHub：[@manwjh](https://github.com/manwjh)

---

再次感谢您的贡献！🎉
