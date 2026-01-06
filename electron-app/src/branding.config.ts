/**
 * 品牌配置文件
 * 
 * 此文件在不同分支有不同内容：
 * - main 分支：开源版本配置
 * - enterprise 分支：企业版配置
 * 
 * Git 合并策略：merge=ours（自动保留当前分支版本，避免冲突）
 */

export interface BrandingConfig {
  /** 应用完整名称 */
  appName: string;
  /** 应用短名称 */
  shortName: string;
  /** 应用描述 */
  description: string;
  /** 是否为企业版 */
  isEnterprise: boolean;
  /** 主题色 */
  primaryColor: string;
  /** Logo 路径 */
  logoPath?: string;
}

export const BRANDING: BrandingConfig = {
  appName: 'MindVoice 语音桌面助手',
  shortName: 'MindVoice',
  description: '基于AI的跨平台桌面语音助手',
  isEnterprise: false,
  primaryColor: '#667eea',
  logoPath: '/assets/logo.png',
};

