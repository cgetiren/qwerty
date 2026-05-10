import { CheckCircle, XCircle, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import type { Brand } from '../lib/brand';

export interface BrandSyncStatusData {
  status: 'healthy' | 'error' | 'processing' | 'unknown';
  lastSync: string | null;
  error: string | null;
}

interface BrandCardProps {
  brand: Brand;
  data: BrandSyncStatusData | undefined;
}

function BrandStatusCard({ brand, data }: BrandCardProps) {
  const status = data?.status ?? 'unknown';

  const isTimeout = status === 'error' && data?.error?.toLowerCase().includes('timeout');

  const statusConfig = {
    healthy: {
      icon: <CheckCircle className="w-4 h-4" />,
      label: 'Senkron aktif',
      pill: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      dot: 'bg-emerald-400 animate-pulse',
      border: 'border-emerald-500/20',
    },
    error: {
      icon: <XCircle className="w-4 h-4" />,
      label: isTimeout ? 'Zaman aşımı' : 'Bağlantı hatası',
      pill: 'bg-red-500/15 text-red-400 border-red-500/25',
      dot: 'bg-red-400',
      border: 'border-red-500/20',
    },
    processing: {
      icon: <RefreshCw className="w-4 h-4 animate-spin" />,
      label: 'Senkronize ediliyor',
      pill: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
      dot: 'bg-blue-400 animate-pulse',
      border: 'border-blue-500/20',
    },
    unknown: {
      icon: <Clock className="w-4 h-4" />,
      label: 'Veri yok',
      pill: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border-slate-500/25',
      dot: 'bg-slate-500',
      border: 'border-slate-300 dark:border-white/10',
    },
  }[status];

  const formatTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={`glass-effect rounded-xl border ${statusConfig.border} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: brand.brand_color || '#6b7280' }}
          />
          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{brand.brand_name}</span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium flex-shrink-0 ${statusConfig.pill}`}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/15">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">
            {isTimeout
              ? 'Senkronizasyon 10 dakika limitini aştı. Çekilecek veri miktarı çok fazla olabilir.'
              : (data?.error || 'Bilinmeyen hata')}
          </p>
        </div>
      )}

      <div className="text-xs text-slate-500">
        {data?.lastSync
          ? `Son sync: ${formatTime(data.lastSync)}`
          : 'Henüz senkronizasyon yapılmadı'}
      </div>
    </div>
  );
}

interface Props {
  brands: Brand[];
  statuses: Record<string, BrandSyncStatusData>;
  loading: boolean;
}

export function BrandSyncStatusCards({ brands, statuses, loading }: Props) {
  if (brands.length === 0) return null;

  return (
    <div className="glass-effect rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Marka Bağlantı Durumları
        </h3>
        {loading && (
          <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {brands.map(brand => (
          <BrandStatusCard
            key={brand.brand_id}
            brand={brand}
            data={statuses[brand.brand_id]}
          />
        ))}
      </div>
    </div>
  );
}
