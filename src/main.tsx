import { createRoot } from 'react-dom/client';
import './index.css';

function MissingEnvScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-6">
      <div className="max-w-lg rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 p-6 shadow-lg">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
          Supabase ayarlari eksik
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Proje kokunde{' '}
          <code className="rounded bg-slate-100 dark:bg-slate-700 px-1">.env</code> dosyasi
          olusturup asagidaki degiskenleri ekleyin (Supabase Dashboard → Project Settings → API).
        </p>
        <pre className="mt-4 text-xs overflow-x-auto rounded bg-slate-900 text-slate-100 p-4 whitespace-pre-wrap">
          {`VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...`}
        </pre>
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Dosyayi kaydettikten sonra dev sunucusunu yeniden baslatin:{' '}
          <kbd className="rounded border border-slate-300 dark:border-slate-600 px-1">Ctrl+C</kbd>
          {' '}sonra <kbd className="rounded border border-slate-300 dark:border-slate-600 px-1">npm run dev</kbd>.
        </p>
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400/90">
          Not: Onceden tamamen beyaz ekran goruyorsaniz sebep genelde budur — tarayici konsolunda
          &quot;Missing Supabase environment variables&quot; hatasi olurdu.
        </p>
      </div>
    </div>
  );
}

void (async () => {
  const rootEl = document.getElementById('root');
  if (!rootEl) return;

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) {
    createRoot(rootEl).render(<MissingEnvScreen />);
    return;
  }

  const { mountApp } = await import('./app-mount.tsx');
  mountApp(rootEl);
})();
