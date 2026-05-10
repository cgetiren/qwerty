import { X, AlertCircle } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'confirm' | 'alert';
}

export function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Tamam',
  cancelText = 'İptal',
  type = 'confirm',
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-200/80 dark:bg-slate-950/80 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={handleBackdropClick}
    >
      <div className="glass-effect rounded-2xl shadow-2xl shadow-cyan-500/20 max-w-md w-full mx-4 animate-scale-in border-2 border-cyan-500/30">
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/20 rounded-xl border border-cyan-500/30">
                <AlertCircle className="w-6 h-6 text-cyan-400" />
              </div>
              <h3 id="modal-title" className="text-xl font-bold text-slate-900 dark:text-white">{title}</h3>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 dark:text-slate-400 hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg p-1.5 transition-colors"
              aria-label="Kapat"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{message}</p>
          </div>

          <div className="flex gap-3 justify-end">
            {type === 'confirm' && (
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-700/50 transition-colors border border-slate-600/50"
              >
                {cancelText}
              </button>
            )}
            <button
              onClick={() => {
                if (onConfirm) onConfirm();
                onClose();
              }}
              className="px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 shadow-xl shadow-cyan-500/30 transition-all hover:scale-105"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
