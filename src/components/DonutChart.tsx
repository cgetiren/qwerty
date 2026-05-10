interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  title: string;
  centerText?: string;
}

export default function DonutChart({ data, title, centerText }: DonutChartProps) {
  if (data.length === 0 || data.every(d => d.value === 0)) {
    return (
      <div className="w-full">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-200/50 dark:bg-slate-700/30 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
          <div className="w-16 h-16 bg-slate-300 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Henüz Sentiment Verisi Yok</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center max-w-md mb-4">
            Chat'lerin sentiment analizi yapıldığında bu grafik görünecek. Chat'ler otomatik olarak analiz ediliyor.
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700/50 px-3 py-2 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>İpucu: Yeni chat'ler geldiğinde otomatik olarak analiz edilir</span>
          </div>
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const size = 200;
  const strokeWidth = 40;
  const radius = (size - strokeWidth) / 2;
  let currentAngle = -90;
  const segments = data.map((item) => {
    const percentage = (item.value / total) * 100;
    const angle = (item.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;

    const startX = size / 2 + radius * Math.cos((startAngle * Math.PI) / 180);
    const startY = size / 2 + radius * Math.sin((startAngle * Math.PI) / 180);
    const endX = size / 2 + radius * Math.cos((currentAngle * Math.PI) / 180);
    const endY = size / 2 + radius * Math.sin((currentAngle * Math.PI) / 180);

    const largeArc = angle > 180 ? 1 : 0;

    return {
      ...item,
      percentage,
      path: `M ${size / 2},${size / 2} L ${startX},${startY} A ${radius},${radius} 0 ${largeArc},1 ${endX},${endY} Z`,
    };
  });

  return (
    <div className="w-full">
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments.map((segment, index) => (
              <g key={index}>
                <path
                  d={segment.path}
                  fill={segment.color}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                />
              </g>
            ))}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius - strokeWidth}
              className="fill-slate-100 dark:fill-slate-900"
            />
          </svg>
          {centerText && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{centerText}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Toplam</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          {segments.map((segment, index) => (
            <div key={index} className="flex items-center justify-between group cursor-pointer">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-4 h-4 rounded flex-shrink-0 group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{segment.label}</span>
              </div>
              <div className="flex items-center gap-2 ml-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-white">{segment.value}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">({segment.percentage.toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
