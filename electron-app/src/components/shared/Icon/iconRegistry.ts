/**
 * 图标注册表
 * 
 * 这个文件是图标系统的核心，所有可用的图标都必须在这里注册。
 * 
 * ## 如何添加新图标：
 * 
 * 1. 将 SVG 文件放到 `src/assets/icons/ui/` 目录
 * 2. 在下方导入（使用 ?react 后缀）
 * 3. 添加到 iconMap 对象中
 * 4. TypeScript 会自动提供类型提示
 * 
 * @example
 * ```typescript
 * import NewIcon from '@/assets/icons/ui/new-icon.svg?react';
 * 
 * export const iconMap = {
 *   // ...existing icons
 *   'new-icon': NewIcon,
 * } as const;
 * ```
 */

// 导入所有 UI 图标（使用 Vite 的 ?react 语法）
import MicIcon from '@/assets/icons/ui/mic.svg?react';
import CameraIcon from '@/assets/icons/ui/camera.svg?react';
import CopyIcon from '@/assets/icons/ui/copy.svg?react';
import TranslateIcon from '@/assets/icons/ui/translate.svg?react';
import ReportIcon from '@/assets/icons/ui/report.svg?react';
import AppIcon from '@/assets/icons/ui/app-icon.svg?react';
import LogoutIcon from '@/assets/icons/ui/logoutsvg.svg?react';
import NotePlusIcon from '@/assets/icons/ui/note-plus.svg?react';
import PlusCircleIcon from '@/assets/icons/ui/plus-circle.svg?react';

/**
 * 图标映射表
 * 键名是在组件中使用的图标名称
 */
export const iconMap = {
  // 功能图标
  'mic': MicIcon,
  'camera': CameraIcon,
  'copy': CopyIcon,
  'translate': TranslateIcon,
  'report': ReportIcon,
  'logout': LogoutIcon,
  'note-plus': NotePlusIcon,
  'plus-circle': PlusCircleIcon,
  
  // 应用图标
  'app': AppIcon,
} as const;

/**
 * 图标名称类型
 * 自动从 iconMap 中提取，提供 TypeScript 类型提示
 */
export type IconName = keyof typeof iconMap;

/**
 * 获取所有可用的图标名称列表
 */
export const getAvailableIcons = (): IconName[] => {
  return Object.keys(iconMap) as IconName[];
};

/**
 * 检查图标是否存在
 */
export const hasIcon = (name: string): name is IconName => {
  return name in iconMap;
};

