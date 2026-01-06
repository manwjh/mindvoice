#!/usr/bin/env node

/**
 * 手动更新 GitHub 版本快照信息脚本
 * 
 * 使用场景：
 * - 维护者在发布新版本前手动运行此脚本更新快照信息
 * - 更新后的快照信息需要提交到 Git 仓库
 * 
 * 设计目标：
 * - 从 GitHub API 获取最新的仓库所有者和贡献者信息
 * - 将获取的信息更新到 version.ts 中的版本快照信息常量
 * - 确保每个版本都包含该版本发布时刻的准确贡献者信息
 * - 这是该版本的"快照"，代表版本发布时的贡献者状态
 * 
 * 工作流程：
 * 1. 从 version.ts 读取仓库地址
 * 2. 从 GitHub API 获取仓库信息和贡献者列表
 * 3. 过滤并格式化数据（排除机器人，按贡献数排序）
 * 4. 更新 version.ts 中的 VERSION_GITHUB_OWNER 和 VERSION_GITHUB_CONTRIBUTORS
 * 
 * 使用方法：
 * npm run sync:github
 * 
 * 注意事项：
 * - 更新后需要检查 version.ts 的变更
 * - 更新后的快照信息需要提交到 Git 仓库
 * - 建议在发布新版本前运行此脚本
 */

const fs = require('fs');
const path = require('path');

// ==================== 配置常量 ====================

const VERSION_FILE = path.join(__dirname, '../src/version.ts');
const GITHUB_API_BASE = 'https://api.github.com';

// ==================== GitHub API 数据获取 ====================

/**
 * 从 GitHub API 获取仓库信息
 * 
 * @param {string} repository - 仓库地址，格式：owner/repo
 * @returns {Promise<Object>} 仓库信息对象
 * @throws {Error} 当 API 请求失败时抛出错误
 */
async function fetchRepositoryInfo(repository) {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repository}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`获取仓库信息失败: ${error.message}`);
  }
}

/**
 * 从 GitHub API 获取贡献者列表
 * 
 * @param {string} repository - 仓库地址，格式：owner/repo
 * @returns {Promise<Array>} 贡献者列表
 * @throws {Error} 当 API 请求失败时抛出错误
 */
async function fetchContributors(repository) {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repository}/contributors?per_page=100`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    throw new Error(`获取贡献者列表失败: ${error.message}`);
  }
}

// ==================== 数据处理 ====================

/**
 * 格式化贡献者数据
 * 提取需要的字段，统一数据结构
 * 
 * @param {Object} contributor - GitHub API 返回的贡献者对象
 * @returns {Object} 格式化后的贡献者对象
 */
function formatContributor(contributor) {
  return {
    login: contributor.login,
    avatar_url: contributor.avatar_url,
    html_url: contributor.html_url,
    contributions: contributor.contributions
  };
}

/**
 * 转义字符串中的特殊字符
 * 用于在生成的 TypeScript 代码中安全地嵌入字符串值
 * 
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeString(str) {
  return str
    .replace(/\\/g, '\\\\')  // 反斜杠
    .replace(/'/g, "\\'")    // 单引号
    .replace(/\n/g, '\\n')    // 换行符
    .replace(/\r/g, '\\r')    // 回车符
    .replace(/\t/g, '\\t');   // 制表符
}

// ==================== 文件更新 ====================

/**
 * 更新 version.ts 文件中的版本快照信息
 * 
 * 设计说明：
 * - 使用正则表达式匹配并替换 VERSION_GITHUB_OWNER 和 VERSION_GITHUB_CONTRIBUTORS
 * - 保持文件其他部分不变，只更新版本快照信息部分
 * - 转义特殊字符确保生成的代码语法正确
 * 
 * @param {Object} repoData - GitHub API 返回的仓库信息
 * @param {Array} contributorsData - GitHub API 返回的贡献者列表
 * @throws {Error} 当文件格式不符合预期时抛出错误
 */
function updateVersionFile(repoData, contributorsData) {
  // 读取原文件
  let content = fs.readFileSync(VERSION_FILE, 'utf-8');

  // 提取 owner 信息
  const owner = {
    login: repoData.owner.login,
    avatar_url: repoData.owner.avatar_url,
    html_url: repoData.owner.html_url,
    type: repoData.owner.type
  };

  // 过滤并格式化贡献者（只保留用户，排除机器人）
  const contributors = contributorsData
    .filter(c => c.type === 'User')
    .map(formatContributor)
    .sort((a, b) => b.contributions - a.contributions);

  // 转义字符串值
  const ownerLogin = escapeString(owner.login);
  const ownerAvatarUrl = escapeString(owner.avatar_url);
  const ownerHtmlUrl = escapeString(owner.html_url);
  const ownerType = escapeString(owner.type);

  // 生成新的 VERSION_GITHUB_OWNER
  const newOwnerCode = `const VERSION_GITHUB_OWNER: GitHubOwner = {
  login: '${ownerLogin}',
  avatar_url: '${ownerAvatarUrl}',
  html_url: '${ownerHtmlUrl}',
  type: '${ownerType}'
};`;

  // 生成新的 VERSION_GITHUB_CONTRIBUTORS
  const contributorsCode = contributors
    .map(c => {
      const login = escapeString(c.login);
      const avatarUrl = escapeString(c.avatar_url);
      const htmlUrl = escapeString(c.html_url);
      return `  {
    login: '${login}',
    avatar_url: '${avatarUrl}',
    html_url: '${htmlUrl}',
    contributions: ${c.contributions}
  }`;
    })
    .join(',\n');

  const newContributorsCode = `const VERSION_GITHUB_CONTRIBUTORS: GitHubContributor[] = [
${contributorsCode}
];`;

  // 替换 VERSION_GITHUB_OWNER（使用更精确的正则）
  const ownerRegex = /const VERSION_GITHUB_OWNER: GitHubOwner = \{[\s\S]*?\};/;
  if (!ownerRegex.test(content)) {
    throw new Error('未找到 VERSION_GITHUB_OWNER 定义');
  }
  content = content.replace(ownerRegex, newOwnerCode);

  // 替换 VERSION_GITHUB_CONTRIBUTORS（使用更精确的正则）
  const contributorsRegex = /const VERSION_GITHUB_CONTRIBUTORS: GitHubContributor\[\] = \[[\s\S]*?\];/;
  if (!contributorsRegex.test(content)) {
    throw new Error('未找到 VERSION_GITHUB_CONTRIBUTORS 定义');
  }
  content = content.replace(contributorsRegex, newContributorsCode);

  // 写回文件
  fs.writeFileSync(VERSION_FILE, content, 'utf-8');
}

/**
 * 主函数
 * 
 * 执行流程：
 * 1. 验证 version.ts 文件存在
 * 2. 从 version.ts 读取仓库地址配置
 * 3. 从 GitHub API 获取最新信息
 * 4. 更新 version.ts 中的版本快照信息
 * 
 * 错误处理策略：
 * - 网络失败时静默处理，不中断构建
 * - 使用现有版本快照信息继续构建流程
 */
async function main() {
  console.log('🔄 开始同步 GitHub 版本快照信息...');

  try {
    // 步骤 1: 验证文件存在
    if (!fs.existsSync(VERSION_FILE)) {
      throw new Error(`未找到文件: ${VERSION_FILE}`);
    }

    // 步骤 2: 读取仓库地址配置
    const versionContent = fs.readFileSync(VERSION_FILE, 'utf-8');
    const repoMatch = versionContent.match(/repository:\s*['"]([^'"]+)['"]/);
    if (!repoMatch) {
      throw new Error('未在 version.ts 中找到 repository 配置');
    }
    const repository = repoMatch[1];
    console.log(`📦 仓库: ${repository}`);

    // 步骤 3: 从 GitHub API 获取信息
    console.log('📡 获取仓库信息...');
    const repoData = await fetchRepositoryInfo(repository);
    console.log(`✅ 仓库所有者: ${repoData.owner.login}`);

    console.log('📡 获取贡献者列表...');
    const contributorsData = await fetchContributors(repository);
    const userContributors = contributorsData.filter(c => c.type === 'User');
    console.log(`✅ 找到 ${userContributors.length} 个贡献者`);

    // 步骤 4: 更新 version.ts 文件
    console.log('📝 更新 version.ts...');
    updateVersionFile(repoData, contributorsData);
    console.log('✅ 版本快照信息同步完成');

  } catch (error) {
    // 静默失败策略：网络不可用时不影响构建流程
    console.warn(`⚠️  同步失败（使用现有版本快照信息）: ${error.message}`);
    console.warn('   构建将继续使用当前的版本快照信息');
    process.exit(0);
  }
}

// 运行主函数
main().catch(error => {
  console.warn(`⚠️  同步失败（使用现有版本快照信息）: ${error.message}`);
  console.warn('   构建将继续使用当前的版本快照信息');
  process.exit(0);
});

