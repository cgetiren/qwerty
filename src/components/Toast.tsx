import { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const styles = {
    success: {
      bg: 'bg-gradient-to-r from-emerald-500 to-green-600',
      icon: CheckCircle,
      iconBg: 'bg-emerald-400/30',
    },
    error: {
      bg: 'bg-gradient-to-r from-rose-500 to-red-600',
      icon: XCircle,
      iconBg: 'bg-rose-400/30',
    },
    warning: {
      bg: 'bg-gradient-to-r from-amber-500 to-orange-600',
      icon: AlertTriangle,
      iconBg: 'bg-amber-400/30',
    },
    info: {
      bg: 'bg-gradient-to-r from-cyan-500 to-emerald-600',
      icon: Info,
      iconBg: 'bg-cyan-400/30',
    },
  };

  const { bg, icon: Icon, iconBg } = styles[type];

  return (
    <div
      className={`${bg} text-slate-900 dark:text-white rounded-xl shadow-2xl p-4 min-w-[320px] max-w-md animate-slide-in-right`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className={`${iconBg} rounded-lg p-2 flex-shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 pt-0.5">
          <p className="text-sm font-medium leading-relaxed">{message}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 hover:bg-white/20 rounded-lg p-1 transition-colors"
          aria-label="Kapat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  removeToast: (id: string) => void;
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
      <div className="space-y-2 pointer-events-auto">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}
