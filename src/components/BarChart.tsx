interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  title: string;
  height?: number;
  onBarClick?: (label: string) => void;
}

export default function BarChart({ data, title, height = 300, onBarClick }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="w-full">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
        <div className="flex flex-col items-center justify-center py-12 px-4 bg-slate-100 dark:bg-white/5 rounded-lg border-2 border-dashed border-white/20">
          <div className="w-16 h-16 bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Henüz Şikayet Verisi Yok</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center max-w-md mb-4">
            Negatif sentiment'e sahip chat'ler analiz edildikçe şikayet kategorileri burada görünecek.
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>İpucu: Müşteri şikayetleri otomatik olarak kategorize edilir</span>
          </div>
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="w-full">
      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
      <div className="space-y-3" style={{ height: `${height}px`, overflowY: 'auto' }}>
        {data.map((item, index) => {
          const percentage = (item.value / maxValue) * 100;
          const barColor = item.color || '#3b82f6';
          const isClickable = !!onBarClick;

          return (
            <div
              key={item.label || index}
              className={`group ${isClickable ? 'cursor-pointer' : ''}`}
              onClick={() => isClickable && onBarClick(item.label)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium truncate transition-colors ${isClickable ? 'text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                  {item.label}
                </span>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{item.value}</span>
                  {isClickable && (
                    <span className="text-xs text-slate-500 group-hover:text-slate-600 dark:text-slate-300 transition-colors opacity-0 group-hover:opacity-100">
                      detay →
                    </span>
                  )}
                </div>
              </div>
              <div className={`relative h-8 bg-slate-200 dark:bg-white/10 rounded-lg overflow-hidden transition-all ${isClickable ? 'group-hover:ring-1 group-hover:ring-white/20' : ''}`}>
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out group-hover:opacity-90"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: barColor,
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-end pr-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white">
                      {percentage > 10 && `${percentage.toFixed(0)}%`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
