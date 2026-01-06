# 版本快照信息场景说明

## 场景概述

本文档说明版本快照信息在不同场景下的工作流程，特别是：
1. 从 Git 仓库拉取代码时的处理
2. 本地修改代码并发布（未推送）时的处理
3. 开源许可证要求说明

## 场景 1: 从 Git 仓库拉取代码

### 工作流程

```
开发者 A 拉取代码
    ↓
Git 仓库中的 version.ts 包含版本快照信息
    ↓
version.ts 中的 VERSION_GITHUB_OWNER 和 VERSION_GITHUB_CONTRIBUTORS
    ↓
这些信息是上一次提交时的快照数据
    ↓
开发者可以直接使用这些信息进行构建
```

### 关键点

- **Git 仓库保留快照数据**：`version.ts` 文件中的 `VERSION_GITHUB_OWNER` 和 `VERSION_GITHUB_CONTRIBUTORS` 常量会被提交到 Git 仓库
- **作为默认值**：这些数据作为该版本的默认快照信息
- **可构建性**：即使没有网络，也可以使用 Git 仓库中的快照数据进行构建

## 场景 2: 本地修改代码并发布（未推送）

### 工作流程

```
开发者 B 本地修改代码
    ↓
运行 npm run build（触发 prebuild 钩子）
    ↓
执行 sync-github-snapshot.js
    ↓
尝试从 GitHub API 获取最新信息
    ├─ 成功 → 更新 version.ts 中的快照信息
    └─ 失败 → 使用 Git 仓库中的现有快照信息（静默处理）
    ↓
构建应用
    ↓
打包的应用包含版本快照信息
    ↓
应用运行时显示贡献者信息
```

### 关键点

- **未推送代码**：即使代码没有推送到 GitHub，构建仍然可以正常进行
- **使用现有快照**：如果 GitHub API 获取失败，使用 Git 仓库中的快照信息
- **打包包含信息**：打包后的应用会包含版本快照信息，显示在"关于"页面

## 场景 3: 开源许可证要求说明

### MIT 许可证要求

根据 MIT 许可证（项目使用 MIT License），要求：

1. **保留版权声明**：必须在所有副本中包含版权声明
2. **保留许可证声明**：必须包含 MIT 许可证全文
3. **可以修改和分发**：允许修改、合并、发布、分发、再许可和/或销售软件副本

### 显示贡献者信息的合理性

显示贡献者信息符合 MIT 许可证要求，原因：

1. **认可贡献者**：这是对项目贡献者的合理认可
2. **透明度**：帮助用户了解项目的贡献者
3. **开源精神**：符合开源社区的最佳实践
4. **非强制性**：MIT 许可证不禁止显示贡献者信息

### 实现方式

在应用的"关于"页面显示：
- 项目所有者信息
- 贡献者列表（来自版本快照）
- 开源许可证说明

## 技术实现

### 1. Git 仓库中的快照数据

```typescript
// electron-app/src/version.ts
const VERSION_GITHUB_OWNER: GitHubOwner = {
  login: 'manwjh',
  avatar_url: 'https://avatars.githubusercontent.com/u/7723271?v=4',
  html_url: 'https://github.com/manwjh',
  type: 'User'
};

const VERSION_GITHUB_CONTRIBUTORS: GitHubContributor[] = [
  {
    login: 'manwjh',
    avatar_url: 'https://avatars.githubusercontent.com/u/7723271?v=4',
    html_url: 'https://github.com/manwjh',
    contributions: 34
  }
];
```

### 2. 构建时同步脚本

```bash
# package.json
"prebuild": "npm run sync:github",
"sync:github": "node scripts/sync-github-snapshot.js"
```

### 3. 错误处理策略

- **网络失败**：静默使用 Git 仓库中的现有快照信息
- **不中断构建**：构建流程继续，使用现有数据
- **日志提示**：输出警告信息，但不影响构建

## 用户告知

在应用的"关于"页面，需要告知用户：

1. **开源要求**：说明这是项目所有者基于开源许可证的要求
2. **贡献者认可**：显示贡献者信息是对开源贡献者的认可
3. **MIT 许可证**：符合 MIT 许可证的要求和开源社区最佳实践

## 总结

### 优势

1. **离线构建**：即使没有网络，也可以使用 Git 仓库中的快照数据构建
2. **版本一致性**：每个版本都包含该版本发布时的贡献者信息
3. **符合开源精神**：显示贡献者信息符合开源社区的最佳实践
4. **MIT 合规**：符合 MIT 许可证的要求

### 工作流程总结

```
Git 仓库（包含快照数据）
    ↓
开发者拉取代码
    ↓
构建时尝试同步最新信息
    ├─ 成功 → 更新快照信息
    └─ 失败 → 使用 Git 仓库中的快照信息
    ↓
打包应用（包含快照信息）
    ↓
用户使用应用（看到贡献者信息）
    ↓
符合 MIT 许可证要求
```

