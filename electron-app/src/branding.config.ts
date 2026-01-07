/**
 * 品牌配置文件
 */

export interface BrandingConfig {
  /** 应用完整名称 */
  appName: string;
  /** 应用短名称 */
  shortName: string;
  /** 应用描述 */
  description: string;
  /** 扩展标识 */
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

