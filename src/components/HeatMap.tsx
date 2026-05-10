interface HeatMapProps {
  data: { hour: number; count: number }[];
  title: string;
  description?: string;
}

export default function HeatMap({ data, title, description }: HeatMapProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Veri bulunmuyor
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);
  const totalChats = data.reduce((sum, d) => sum + d.count, 0);
  const avgPerHour = Math.round(totalChats / 24);

  const getIntensity = (count: number) => {
    const intensity = count / maxCount;
    if (intensity === 0) return 'bg-gray-100 text-gray-600 border border-gray-200';
    if (intensity < 0.25) return 'bg-blue-200 text-blue-900 border border-blue-300';
    if (intensity < 0.5) return 'bg-blue-400 text-white border border-blue-500';
    if (intensity < 0.75) return 'bg-blue-600 text-white border border-blue-700';
    return 'bg-blue-800 text-white border border-blue-900';
  };

  const getPercentage = (count: number) => {
    return ((count / totalChats) * 100).toFixed(1);
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        {description && <p className="text-sm text-gray-600">{description}</p>}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Toplam Chat:</span>
            <span className="font-bold text-blue-600">{totalChats}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">Saatlik Ortalama:</span>
            <span className="font-bold text-orange-600">{avgPerHour}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">En Yoğun:</span>
            <span className="font-bold text-green-600">{maxCount} chat</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
        {data.map((item) => {
          const percentage = getPercentage(item.count);
          return (
            <div key={item.hour} className="flex flex-col items-center group">
              <div
                className={`w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all hover:scale-110 cursor-pointer relative ${getIntensity(item.count)}`}
              >
                <span>{item.count}</span>
                <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-10">
                  <div className="bg-gray-900 text-slate-900 dark:text-white text-xs rounded-lg py-2 px-3 whitespace-nowrap shadow-lg">
                    <div className="font-bold mb-1">Saat {item.hour}:00 - {item.hour}:59</div>
                    <div>Toplam: <span className="font-bold">{item.count} chat</span></div>
                    <div>Yüzde: <span className="font-bold">{percentage}%</span></div>
                    <div className="text-xs opacity-75 mt-1">(Son 7 günün toplamı)</div>
                  </div>
                  <div className="w-2 h-2 bg-gray-900 transform rotate-45 -mt-1"></div>
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-1 font-medium">{item.hour}:00</div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-blue-900">Yoğunluk Skalası:</span>
          <div className="flex gap-1">
            <div className="w-6 h-6 bg-gray-100 rounded border border-gray-200" title="0-25%"></div>
            <div className="w-6 h-6 bg-blue-200 rounded border border-blue-300" title="25-50%"></div>
            <div className="w-6 h-6 bg-blue-400 rounded border border-blue-500" title="50-75%"></div>
            <div className="w-6 h-6 bg-blue-600 rounded border border-blue-700" title="75-100%"></div>
            <div className="w-6 h-6 bg-blue-800 rounded border border-blue-900" title="Maksimum"></div>
          </div>
        </div>
        <div className="text-xs text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
          💡 İpucu: Her kutucuğun üzerine gelerek detayları görebilirsiniz
        </div>
      </div>
    </div>
  );
}
