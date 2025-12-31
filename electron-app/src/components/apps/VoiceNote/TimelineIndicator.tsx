import React from 'react';
import './TimelineIndicator.css';

interface TimelineIndicatorProps {
  startTime?: number;  // 毫秒
  endTime?: number;    // 毫秒
}

/**
 * 格式化时间（毫秒）为可读格式
 * @param ms - 毫秒数
 * @returns 格式化的时间字符串，如 "1.23s" 或 "1:23.45"
 */
function formatTime(ms: number): string {
  const seconds = ms / 1000;
  
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
}

/**
 * 计算持续时间
 * @param startTime - 开始时间（毫秒）
 * @param endTime - 结束时间（毫秒）
 * @returns 持续时间字符串，如 "4.44s"
 */
function formatDuration(startTime: number, endTime: number): string {
  const durationMs = endTime - startTime;
  const durationS = durationMs / 1000;
  return `${durationS.toFixed(2)}s`;
}

export const TimelineIndicator: React.FC<TimelineIndicatorProps> = ({ startTime, endTime }) => {
  // 如果没有时间信息，不显示
  if (startTime === undefined || endTime === undefined) {
    return null;
  }

  const duration = formatDuration(startTime, endTime);

  return (
    <div className="timeline-indicator" title={`开始: ${formatTime(startTime)} | 结束: ${formatTime(endTime)} | 时长: ${duration}`}>
      <div className="timeline-dot"></div>
      <div className="timeline-info">
        <span className="timeline-time">{formatTime(startTime)}</span>
        <span className="timeline-separator">→</span>
        <span className="timeline-time">{formatTime(endTime)}</span>
        <span className="timeline-duration">({duration})</span>
      </div>
    </div>
  );
};

