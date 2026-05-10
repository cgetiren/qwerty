import { useState, useEffect } from 'react';
import { Bell, BellOff, Smartphone, AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { 
  isPushSupported, 
  subscribeToPush, 
  unsubscribeFromPush, 
  isSubscribed, 
  getNotificationPermission 
} from '../lib/pushNotifications';
import { useBrand } from '../lib/brand';

interface PushNotificationCardProps {
  onStatusChange?: (enabled: boolean) => void;
}

export default function PushNotificationCard({ onStatusChange }: PushNotificationCardProps) {
  const { activeBrand } = useBrand();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const supported = isPushSupported();

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const perm = getNotificationPermission();
    setPermission(perm);
    
    if (supported && perm === 'granted') {
      const subscribed = await isSubscribed();
      setPushEnabled(subscribed);
    }
  };

  const handleToggle = async () => {
    if (!supported) {
      setMessage({ 
        type: 'error', 
        text: 'Tarayıcınız push bildirimleri desteklemiyor. Chrome, Firefox veya Edge kullanın.' 
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (pushEnabled) {
        // Unsubscribe
        const success = await unsubscribeFromPush();
        if (success) {
          setPushEnabled(false);
          setMessage({ type: 'info', text: 'Push bildirimleri devre dışı bırakıldı' });
          onStatusChange?.(false);
        } else {
          setMessage({ type: 'error', text: 'Abonelik iptal edilemedi' });
        }
      } else {
        // Subscribe
        const success = await subscribeToPush(activeBrand?.brand_id || null);
        if (success) {
          setPushEnabled(true);
          setPermission('granted');
          setMessage({ type: 'success', text: 'Push bildirimleri aktif! Test bildirimi gönderilebilir.' });
          onStatusChange?.(true);
        } else {
          const perm = getNotificationPermission();
          setPermission(perm);
          
          if (perm === 'denied') {
            setMessage({ 
              type: 'error', 
              text: 'Bildirim izni reddedildi. Tarayıcı ayarlarından izin verin.' 
            });
          } else {
            setMessage({ type: 'error', text: 'Abonelik başarısız oldu' });
          }
        }
      }
    } catch (error) {
      console.error('Push toggle error:', error);
      setMessage({ type: 'error', text: 'Bir hata oluştu' });
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!pushEnabled) {
      setMessage({ type: 'info', text: 'Önce push bildirimleri aktif edin' });
      return;
    }

    setTesting(true);
    setMessage(null);

    try {
      // Test notification via service worker
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('LiveTakip Test Bildirimi', {
        body: 'Push bildirimler başarıyla çalışıyor! 🎉',
        icon: '/icon-192x192.png',
        badge: '/icon-96x96.png',
        tag: 'test-notification',
        requireInteraction: false,
      } as NotificationOptions);

      setMessage({ type: 'success', text: 'Test bildirimi gönderildi!' });
    } catch (error) {
      console.error('Test notification error:', error);
      setMessage({ type: 'error', text: 'Test bildirimi gönderilemedi' });
    } finally {
      setTesting(false);
    }
  };

  const getPermissionHelp = () => {
    if (!supported) {
      return {
        icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
        text: 'Tarayıcınız push bildirimleri desteklemiyor',
        color: 'border-amber-500/20 bg-amber-500/5',
      };
    }

    if (permission === 'denied') {
      return {
        icon: <AlertCircle className="w-5 h-5 text-red-500" />,
        text: 'Bildirim izni reddedildi. Tarayıcı ayarlarından düzeltin:',
        color: 'border-red-500/20 bg-red-500/5',
        steps: [
          'Chrome: Ayarlar → Gizlilik ve Güvenlik → Site Ayarları → Bildirimler',
          'Firefox: Ayarlar → Gizlilik ve Güvenlik → İzinler → Bildirimler',
          'Edge: Ayarlar → Gizlilik, arama ve hizmetler → Site izinleri → Bildirimler',
        ],
      };
    }

    if (permission === 'granted' && pushEnabled) {
      return {
        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
        text: 'Push bildirimleri aktif ve çalışıyor',
        color: 'border-emerald-500/20 bg-emerald-500/5',
      };
    }

    return null;
  };

  const helpInfo = getPermissionHelp();

  return (
    <div className="glass-effect rounded-xl shadow-lg p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        <Smartphone className="w-6 h-6 text-slate-500 dark:text-slate-400" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Push Bildirimleri</h2>
      </div>

      <div className="space-y-4">
        {/* Status Info */}
        {helpInfo && (
          <div className={`p-4 rounded-lg border ${helpInfo.color}`}>
            <div className="flex items-start gap-3">
              {helpInfo.icon}
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                  {helpInfo.text}
                </p>
                {helpInfo.steps && (
                  <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1 mt-2 list-decimal list-inside">
                    {helpInfo.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Message */}
        {message && (
          <div
            className={`p-3 rounded-lg border text-sm ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : message.type === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Toggle Button */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10">
          <div className="flex items-center gap-3">
            {pushEnabled ? (
              <Bell className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            ) : (
              <BellOff className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            )}
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {pushEnabled ? 'Bildirimler Aktif' : 'Bildirimler Kapalı'}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {pushEnabled 
                  ? 'Düşük puanlı chatler için anlık bildirim alırsınız' 
                  : 'Anlık bildirimler kapalı'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading || !supported}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              pushEnabled 
                ? 'bg-cyan-600' 
                : 'bg-slate-300 dark:bg-slate-600'
            } ${loading || !supported ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                pushEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Test Button */}
        {supported && (
          <button
            onClick={handleTest}
            disabled={!pushEnabled || testing}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
              pushEnabled
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            {testing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Test Gönderiliyor...</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>Test Bildirimi Gönder</span>
              </>
            )}
          </button>
        )}

        {/* Info */}
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
          <Settings className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Push bildirimler yalnızca <strong>puan &lt; 60</strong> veya <strong>olumsuz duygu</strong> durumunda gönderilir.
            Telegram bildirimleri de aynı anda çalışır.
          </p>
        </div>
      </div>
    </div>
  );
}
