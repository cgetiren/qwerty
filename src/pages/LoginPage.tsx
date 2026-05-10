import { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, LogIn, AlertCircle, Smartphone, KeyRound, QrCode, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginPageProps {
  onLogin: () => void;
  mfaChallengeMode?: boolean;
  mfaEnrollMode?: boolean;
}

type LoginStep = 'credentials' | 'mfa_verify' | 'mfa_enroll';

export default function LoginPage({ onLogin, mfaChallengeMode, mfaEnrollMode }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // MFA states
  const [step, setStep] = useState<LoginStep>('credentials');
  const [totpCode, setTotpCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-focus TOTP input
  useEffect(() => {
    if (step === 'mfa_verify' || step === 'mfa_enroll') {
      const timer = setTimeout(() => {
        document.getElementById('totp-input')?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // If App.tsx tells us MFA challenge is required (user has MFA but needs to verify)
  useEffect(() => {
    if (!mfaChallengeMode) return;
    const initMfaChallenge = async () => {
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      const verified = (factorsData?.totp || []).filter(f => f.status === 'verified');
      if (verified.length > 0) {
        const factor = verified[0];
        setFactorId(factor.id);
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
        if (challengeError) { setError(challengeError.message); return; }
        setChallengeId(challengeData.id);
        setStep('mfa_verify');
      }
    };
    initMfaChallenge();
  }, [mfaChallengeMode]);

  // If App.tsx tells us MFA enrollment is required (admin forced 2FA)
  useEffect(() => {
    if (!mfaEnrollMode) return;
    const initMfaEnroll = async () => {
      const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Google Authenticator',
      });
      if (enrollError) { setError(enrollError.message); return; }
      setFactorId(enrollData.id);
      setQrCode(enrollData.totp.qr_code);
      setSecret(enrollData.totp.secret);
      setStep('mfa_enroll');
    };
    initMfaEnroll();
  }, [mfaEnrollMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const email = `${username}@takip.local`;
      const loginPromise = supabase.auth.signInWithPassword({ email, password });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      );

      const { data, error: authError } = await Promise.race([loginPromise, timeoutPromise]);

      if (authError) {
        setError('Kullanici adi veya sifre hatali');
        return;
      }

      // MFA checks are handled by App.tsx after session is created
      // App.tsx will show mfaChallengeMode or mfaEnrollMode as needed
      onLogin();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'timeout') {
        setError('Sunucuya baglanilamiyor. Internet baglantinizi kontrol edin.');
      } else {
        setError('Bir hata olustu. Lutfen tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: totpCode,
      });

      if (verifyError) {
        setError('Kod hatali. Lutfen tekrar deneyin.');
        setTotpCode('');
        return;
      }

      onLogin();
    } catch {
      setError('Dogrulama hatasi. Lutfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // First challenge to verify the enrollment
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: totpCode,
      });

      if (verifyError) {
        setError('Kod hatali. Google Authenticator uygulamasindaki 6 haneli kodu girin.');
        setTotpCode('');
        return;
      }

      onLogin();
    } catch {
      setError('Kayit hatasi. Lutfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTotpChange = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setTotpCode(cleaned);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/20 p-8 animate-scale-in">
          <div className="flex flex-col items-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 via-cyan-400 to-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-2xl shadow-cyan-500/50 animate-glow relative overflow-hidden">
              <div className="absolute inset-0 bg-shimmer" />
              <Shield className="w-10 h-10 text-white relative z-10" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">
              LiveChat QA
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
              {step === 'credentials' && 'Kalite Kontrol Sistemi'}
              {step === 'mfa_verify' && 'Iki Faktorlu Dogrulama'}
              {step === 'mfa_enroll' && '2FA Kurulumu'}
            </p>
          </div>

          {/* Step 1: Credentials */}
          {step === 'credentials' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Kullanici Adi
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-cyan-500/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 transition-all hover:border-cyan-500/40"
                  placeholder="Kullanici adinizi girin"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Sifre
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-cyan-500/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 transition-all pr-12 hover:border-cyan-500/40"
                    placeholder="Sifrenizi girin"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-cyan-400 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm shadow-lg shadow-rose-500/10">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 via-cyan-500 to-emerald-500 hover:from-cyan-500 hover:via-cyan-400 hover:to-emerald-400 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-[1.02]"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    <span>Giris Yap</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Step 2a: MFA Verify (returning user) */}
          {step === 'mfa_verify' && (
            <form onSubmit={handleMfaVerify} className="space-y-5">
              <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
                <Smartphone className="w-8 h-8 text-cyan-400 flex-shrink-0" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Google Authenticator uygulamasindaki <strong className="text-cyan-300">6 haneli kodu</strong> girin.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Dogrulama Kodu
                </label>
                <input
                  id="totp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => handleTotpChange(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-100 dark:bg-slate-800/50 border border-cyan-500/20 rounded-xl text-slate-900 dark:text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 transition-all"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-600 via-cyan-500 to-emerald-500 hover:from-cyan-500 hover:via-cyan-400 hover:to-emerald-400 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-cyan-500/30"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <KeyRound className="w-5 h-5" />
                    <span>Dogrula</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); supabase.auth.signOut(); }}
                className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors py-2"
              >
                Geri Don
              </button>
            </form>
          )}

          {/* Step 2b: MFA Enroll (first time) */}
          {step === 'mfa_enroll' && (
            <form onSubmit={handleMfaEnroll} className="space-y-5">
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <QrCode className="w-8 h-8 text-emerald-400 flex-shrink-0" />
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <strong className="text-emerald-300">Google Authenticator</strong> uygulamasini acin ve asagidaki QR kodu taratin.
                </p>
              </div>

              {qrCode && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-xl">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>

                  {secret && (
                    <div className="w-full">
                      <p className="text-xs text-slate-500 mb-1 text-center">QR tarayamiyorsaniz bu kodu manuel girin:</p>
                      <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/50 border border-slate-300 dark:border-white/10 rounded-lg px-3 py-2">
                        <code className="text-xs text-cyan-300 font-mono flex-1 break-all select-all">{secret}</code>
                        <button type="button" onClick={copySecret} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors flex-shrink-0">
                          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Uygulamadaki 6 Haneli Kod
                </label>
                <input
                  id="totp-input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => handleTotpChange(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-100 dark:bg-slate-800/50 border border-cyan-500/20 rounded-xl text-slate-900 dark:text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400/50 transition-all"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || totpCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-500 hover:from-emerald-500 hover:via-emerald-400 hover:to-cyan-400 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-emerald-500/30"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    <span>2FA Etkinlestir ve Giris Yap</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); setQrCode(''); supabase.auth.signOut(); }}
                className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors py-2"
              >
                Geri Don
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6 font-medium">
          LiveChat Kalite Kontrol Paneli
        </p>
      </div>
    </div>
  );
}
