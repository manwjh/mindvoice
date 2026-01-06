# 版本快照信息工作流程说明

## 场景模拟

### 场景 1: 从 Git 仓库拉取代码

#### 步骤说明

```
1. 开发者 A 执行 git clone 或 git pull
   ↓
2. Git 仓库中的 version.ts 文件被拉取到本地
   ↓
3. version.ts 中包含版本快照信息：
   - VERSION_GITHUB_OWNER（项目所有者信息）
   - VERSION_GITHUB_CONTRIBUTORS（贡献者列表）
   ↓
4. 这些信息是上一次提交时的快照数据
   ↓
5. 开发者可以直接使用这些信息进行构建
```

#### 关键点

- ✅ **Git 仓库保留快照数据**：`version.ts` 中的快照信息会被提交到 Git 仓库
- ✅ **作为默认值**：这些数据作为该版本的默认快照信息
- ✅ **可构建性**：即使没有网络，也可以使用 Git 仓库中的快照数据进行构建

#### 示例

```typescript
// Git 仓库中的 version.ts（已提交）
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

---

### 场景 2: 本地修改代码并发布（未推送）

#### 步骤说明

```
1. 开发者 B 在本地修改代码
   ↓
2. 执行 npm run build（触发 prebuild 钩子）
   ↓
3. 自动执行 sync-github-snapshot.js
   ↓
4. 脚本尝试从 GitHub API 获取最新信息
   ├─ 成功 → 更新 version.ts 中的快照信息
   └─ 失败 → 使用 Git 仓库中的现有快照信息（静默处理）
   ↓
5. 构建应用（包含版本快照信息）
   ↓
6. 打包应用（electron-builder）
   ↓
7. 打包后的应用包含版本快照信息
   ↓
8. 应用运行时在"关于"页面显示贡献者信息
```

#### 关键点

- ✅ **未推送代码**：即使代码没有推送到 GitHub，构建仍然可以正常进行
- ✅ **使用现有快照**：如果 GitHub API 获取失败，使用 Git 仓库中的快照信息
- ✅ **打包包含信息**：打包后的应用会包含版本快照信息，显示在"关于"页面
- ✅ **静默处理**：网络失败时不会中断构建流程

#### 示例输出

```bash
# 构建时的输出
🔄 开始同步 GitHub 版本快照信息...
📦 仓库: manwjh/mindvoice
📡 获取仓库信息...
✅ 仓库所有者: manwjh
📡 获取贡献者列表...
✅ 找到 1 个贡献者
📝 更新 version.ts...
✅ 版本快照信息同步完成

# 或者网络失败时
🔄 开始同步 GitHub 版本快照信息...
⚠️  同步失败（使用现有版本快照信息）: 网络错误
   构建将继续使用当前的版本快照信息
```

---

## 开源许可证要求说明

### MIT 许可证要求

根据 MIT 许可证（项目使用 MIT License），要求：

1. **保留版权声明**：必须在所有副本中包含版权声明
2. **保留许可证声明**：必须包含 MIT 许可证全文
3. **可以修改和分发**：允许修改、合并、发布、分发、再许可和/或销售软件副本

### 显示贡献者信息的合理性

显示贡献者信息符合 MIT 许可证要求，原因：

1. ✅ **认可贡献者**：这是对项目贡献者的合理认可
2. ✅ **透明度**：帮助用户了解项目的贡献者
3. ✅ **开源精神**：符合开源社区的最佳实践
4. ✅ **非强制性**：MIT 许可证不禁止显示贡献者信息

### 用户告知

在应用的"关于"页面，会显示以下说明：

> 📄 This project is open source under the MIT License. Displaying contributor information is a requirement by the project owner to acknowledge and credit all contributors, in accordance with open source best practices.

**中文翻译**：
> 📄 本项目采用 MIT 开源许可证。显示贡献者信息是项目所有者的要求，用于认可和感谢所有贡献者，符合开源社区最佳实践。

---

## 技术实现细节

### 1. Git 仓库中的快照数据

**位置**：`electron-app/src/version.ts`

```typescript
// 这些常量会被提交到 Git 仓库
const VERSION_GITHUB_OWNER: GitHubOwner = { ... };
const VERSION_GITHUB_CONTRIBUTORS: GitHubContributor[] = [ ... ];
```

**作用**：
- 作为该版本的默认快照信息
- 确保即使没有网络也能构建
- 保证版本一致性

### 2. 构建时同步脚本

**位置**：`electron-app/scripts/sync-github-snapshot.js`

**触发时机**：
- `npm run build` 前自动执行（通过 `prebuild` 钩子）
- 也可以手动执行：`npm run sync:github`

**工作流程**：
1. 从 `version.ts` 读取仓库地址
2. 从 GitHub API 获取最新信息
3. 更新 `version.ts` 中的快照信息
4. 如果失败，静默使用现有信息

### 3. 错误处理策略

```javascript
try {
  // 尝试从 GitHub API 获取信息
  const repoData = await fetchRepositoryInfo(repository);
  const contributorsData = await fetchContributors(repository);
  updateVersionFile(repoData, contributorsData);
} catch (error) {
  // 静默失败：使用 Git 仓库中的现有快照信息
  console.warn(`⚠️  同步失败（使用现有版本快照信息）: ${error.message}`);
  console.warn('   构建将继续使用当前的版本快照信息');
  process.exit(0); // 不中断构建
}
```

### 4. 运行时使用

**位置**：`electron-app/src/components/shared/SettingsView.tsx`

```typescript
// 直接使用构建时编译的版本快照信息
const githubOwner = APP_VERSION.github.snapshot?.owner || null;
const githubContributors = APP_VERSION.github.snapshot?.contributors || [];
```

**特点**：
- 无需运行时网络请求
- 离线可用
- 快速加载

---

## 完整工作流程图

```
┌─────────────────────────────────────────────────────────┐
│ Git 仓库（包含版本快照信息）                              │
│ - VERSION_GITHUB_OWNER                                  │
│ - VERSION_GITHUB_CONTRIBUTORS                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 开发者拉取代码（git clone/pull）                          │
│ - 获取 version.ts 文件                                  │
│ - 包含快照信息                                          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 开发者修改代码（未推送）                                  │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 执行构建（npm run build）                                │
│ - 触发 prebuild 钩子                                    │
│ - 执行 sync-github-snapshot.js                         │
└─────────────────────────────────────────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────────┐   ┌──────────────────┐
│ GitHub API 成功  │   │ GitHub API 失败  │
│ - 更新快照信息   │   │ - 使用现有快照   │
└──────────────────┘   └──────────────────┘
        ↓                       ↓
        └───────────┬───────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 构建应用（包含版本快照信息）                              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 打包应用（electron-builder）                             │
│ - 包含版本快照信息                                       │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 用户使用应用                                              │
│ - 在"关于"页面看到贡献者信息                              │
│ - 看到开源许可证要求说明                                  │
└─────────────────────────────────────────────────────────┘
```

---

## 总结

### 优势

1. ✅ **离线构建**：即使没有网络，也可以使用 Git 仓库中的快照数据构建
2. ✅ **版本一致性**：每个版本都包含该版本发布时的贡献者信息
3. ✅ **符合开源精神**：显示贡献者信息符合开源社区的最佳实践
4. ✅ **MIT 合规**：符合 MIT 许可证的要求
5. ✅ **用户透明**：明确告知用户这是开源许可证的要求

### 关键原则

1. **Git 仓库保留快照**：确保每个版本都有快照数据
2. **构建时同步**：尝试获取最新信息，失败时使用现有数据
3. **静默失败**：网络失败不影响构建流程
4. **用户告知**：明确说明这是开源许可证的要求

---

## 相关文件

- `electron-app/src/version.ts` - 版本快照信息定义
- `electron-app/scripts/sync-github-snapshot.js` - 构建时同步脚本
- `electron-app/src/components/shared/SettingsView.tsx` - 关于页面显示
- `docs/design/VERSION_SNAPSHOT_SCENARIO.md` - 场景说明文档

