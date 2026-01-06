import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './SummaryTypeSelector.css';

export type SummaryType = 
  | 'meeting'      // 会议纪要
  | 'diary'        // 日记随笔
  | 'lecture'      // 演讲/课程
  | 'interview'    // 访谈记录
  | 'reading'      // 读书笔记
  | 'brainstorm';  // 创意灵感

interface SummaryOption {
  value: SummaryType;
  label: string;
  icon: string;
  description: string;
}

const SUMMARY_OPTIONS: SummaryOption[] = [
  { 
    value: 'meeting', 
    label: '会议纪要', 
    icon: '📊',
    description: '提取决策、待办事项、责任人'
  },
  { 
    value: 'diary', 
    label: '日记随笔', 
    icon: '📝',
    description: '总结情感、反思、成长点'
  },
  { 
    value: 'lecture', 
    label: '演讲课程', 
    icon: '🎓',
    description: '结构化知识点、要点提炼'
  },
  { 
    value: 'interview', 
    label: '访谈记录', 
    icon: '💬',
    description: '问答对、观点、精彩引用'
  },
  { 
    value: 'reading', 
    label: '读书笔记', 
    icon: '📚',
    description: '金句、启发、书评'
  },
  { 
    value: 'brainstorm', 
    label: '创意灵感', 
    icon: '💡',
    description: '想法整理、关联分析、可行性'
  },
];

interface SummaryTypeSelectorProps {
  value: SummaryType;
  onChange: (type: SummaryType) => void;
  disabled?: boolean;
  loading?: boolean;
  onTrigger?: () => void; // 点击触发小结生成
}

export const SummaryTypeSelector: React.FC<SummaryTypeSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  loading = false,
  onTrigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const selectorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = SUMMARY_OPTIONS.find(opt => opt.value === value) || SUMMARY_OPTIONS[0];

  // 更新下拉菜单位置
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.top - 8, // 按钮上方，留8px间距
        left: rect.left,
      });
    }
  }, [isOpen]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled && !loading) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (type: SummaryType) => {
    onChange(type);
    setIsOpen(false);
    // 选择类型后立即触发生成
    if (onTrigger) {
      setTimeout(() => onTrigger(), 100); // 延迟100ms确保状态更新
    }
  };

  return (
    <>
      <div 
        className={`summary-type-selector ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''} ${loading ? 'loading' : ''}`}
        ref={selectorRef}
      >
        <button
          ref={triggerRef}
          className="summary-type-selector-trigger"
          onClick={handleToggle}
          disabled={disabled || loading}
          title={loading ? "正在生成小结..." : `选择小结类型 - 当前: ${selectedOption.label}`}
          aria-label="小结类型选择"
        >
          <span className="summary-current-icon">{selectedOption.icon}</span>
          <span className="summary-current-label">小结</span>
          {loading ? (
            <span className="summary-loading">
              <span className="loading-dot"></span>
            </span>
          ) : (
            <span className={`summary-arrow ${isOpen ? 'rotate' : ''}`}>▼</span>
          )}
        </button>
      </div>

      {/* 使用 Portal 渲染下拉菜单到 body，不受容器 overflow 限制 */}
      {isOpen && createPortal(
        <div 
          className="summary-dropdown summary-dropdown-portal"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            transform: 'translateY(-100%)', // 向上展开
          }}
          ref={(node) => {
            if (node && selectorRef.current) {
              // 保持点击下拉菜单内部时的引用
              const handleClick = (e: MouseEvent) => {
                if (node.contains(e.target as Node)) {
                  e.stopPropagation();
                }
              };
              node.addEventListener('mousedown', handleClick);
            }
          }}
        >
          {SUMMARY_OPTIONS.map(option => (
            <button
              key={option.value}
              className={`summary-option ${option.value === value ? 'selected' : ''}`}
              onClick={() => handleSelect(option.value)}
              title={option.description}
            >
              <span className="option-icon">{option.icon}</span>
              <span className="option-label">{option.label}</span>
              {option.value === value && (
                <span className="option-check">✓</span>
              )}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
};

