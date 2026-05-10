import { useState } from 'react';

const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function formatDateLabel(label: string): string {
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return `${day} ${TR_MONTHS[month]}`;
  }
  const slashMatch = label.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    return `${day} ${TR_MONTHS[month]}`;
  }
  return label;
}

interface TrendChartProps {
  data: { label: string; value: number; change?: number; count?: number }[];
  title: string;
  color?: string;
  height?: number;
}

export default function TrendChart({ data, title, color = '#3b82f6', height = 200 }: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="w-full">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-100 dark:bg-white/5 rounded-lg border-2 border-dashed border-white/20">
          <div className="w-16 h-16 bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Henüz Trend Verisi Yok</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-4">
            Günlük veriler biriktiğinde trend grafikleri burada görünecek.
          </p>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);
  const minValue = Math.min(...data.map(d => d.value), 0);
  const range = maxValue - minValue || 1;

  // Dynamic width: each data point needs MORE space for dates
  const pointWidth = data.length <= 7 ? 100 
    : data.length <= 14 ? 80 
    : data.length <= 21 ? 70
    : data.length <= 31 ? 60 
    : 50;
  const chartWidth = data.length * pointWidth;
  const needsScroll = data.length > 10;

  const getYPosition = (value: number) => {
    return height - ((value - minValue) / range) * (height - 40);
  };

  // SVG uses percentage, we need pixels for absolute positioning
  const getXPixels = (index: number) => {
    const baseX = (index / (data.length - 1 || 1)) * chartWidth;
    // Add minimum offset for first/last to prevent label cutoff
    if (index === 0) return Math.max(baseX, 25); // Min 25px from left
    if (index === data.length - 1) return Math.min(baseX, chartWidth - 25); // Min 25px from right
    return baseX;
  };

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1 || 1)) * 100;
    const y = ((maxValue - item.value) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  const shouldShowValue = (index: number) => {
    // Only show on hover, first, and last to avoid clutter
    if (index === hoveredIndex) return true;
    if (index === 0 || index === data.length - 1) return true;
    // For very short periods, show more
    if (data.length <= 7) return index % 2 === 0;
    // For longer periods, only show on hover
    return false;
  };

  return (
    <div className="w-full">
      {title && <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>}
      
      {/* Scrollable container */}
      <div 
        className="overflow-x-auto overflow-y-visible"
        style={{ 
          maxWidth: '100%',
          paddingBottom: '10px',
          paddingLeft: '40px',
          paddingRight: '40px',
          paddingTop: '10px'
        }}
      >
        {/* Inner container with dynamic width + extra padding */}
        <div style={{ 
          width: needsScroll ? `${chartWidth + 80}px` : '100%',
          paddingLeft: '40px',
          paddingRight: '40px'
        }}>
          
          {/* Chart area */}
          <div className="relative" style={{ height: `${height}px`, width: '100%' }}>
            <svg className="w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id={`gradient-${title || 'default'}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
                  <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.05 }} />
                </linearGradient>
              </defs>

              <polyline
                fill={`url(#gradient-${title || 'default'})`}
                stroke="none"
                points={`0,100 ${points} 100,100`}
              />

              <polyline
                fill="none"
                stroke={color}
                strokeWidth="0.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
              />

              {data.map((item, index) => {
                const x = (index / (data.length - 1 || 1)) * 100;
                const y = ((maxValue - item.value) / range) * 100;
                return (
                  <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r={hoveredIndex === index ? "2.5" : "1.5"}
                    fill={color}
                    style={{ cursor: 'pointer', transition: 'r 0.15s' }}
                  />
                );
              })}
            </svg>

            {/* Hover zones */}
            {data.map((_, index) => {
              const xPixels = getXPixels(index);
              const zoneWidth = chartWidth / data.length;
              return (
                <div
                  key={`zone-${index}`}
                  className="absolute top-0 h-full"
                  style={{ left: `${xPixels - zoneWidth / 2}px`, width: `${zoneWidth}px` }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}

            {/* Score value labels - NOW IN PIXEL COORDINATES */}
            {data.map((item, index) => {
              if (!shouldShowValue(index)) return null;
              const xPixels = getXPixels(index);
              const y = getYPosition(item.value);
              const isNearTop = y < 28;
              
              // Smart horizontal alignment to keep labels visible
              const isFirst = index === 0;
              const isLast = index === data.length - 1;
              
              return (
                <div
                  key={`val-${index}`}
                  className="absolute pointer-events-none"
                  style={{ 
                    left: `${xPixels}px`,
                    top: `${y}px`, 
                    zIndex: hoveredIndex === index ? 20 : 10 
                  }}
                >
                  <span
                    className="font-bold px-2 py-1 rounded-md shadow-lg whitespace-nowrap"
                    style={{
                      color: '#ffffff',
                      backgroundColor: hoveredIndex === index ? color : '#0f172a',
                      border: `1.5px solid ${color}`,
                      display: 'inline-block',
                      lineHeight: 1,
                      fontSize: hoveredIndex === index ? '12px' : '11px',
                      transition: 'all 0.15s',
                      position: 'relative',
                      [isNearTop ? 'top' : 'bottom']: '8px',
                      left: isFirst ? '0' : isLast ? 'auto' : '50%',
                      right: isLast ? '0' : 'auto',
                      transform: isFirst || isLast ? 'none' : 'translateX(-50%)'
                    }}
                  >
                    {item.value}{hoveredIndex === index && item.count ? ` (${item.count} chat)` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Date labels - NOW IN PIXEL COORDINATES */}
          <div className="relative mt-3" style={{ height: '60px', width: '100%' }}>
            {data.map((item, index) => {
              const xPixels = getXPixels(index);
              const needsRotation = data.length > 7;
              
              return (
                <div
                  key={`label-${index}`}
                  className="absolute text-xs text-slate-500 dark:text-slate-400 font-medium"
                  style={{
                    left: `${xPixels}px`,
                    transform: needsRotation
                      ? 'translateX(-50%) rotate(-45deg)'
                      : 'translateX(-50%)',
                    transformOrigin: 'top center',
                    whiteSpace: 'nowrap',
                    fontSize: data.length > 21 ? '8px' : needsRotation ? '9px' : '11px',
                  }}
                >
                  {formatDateLabel(item.label)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
