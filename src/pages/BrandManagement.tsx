import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CreditCard as Edit2, Trash2, Search, Check, X, Users, RefreshCw, ChevronDown, ChevronUp, Shield, AlertTriangle, Globe, Palette, Key, Bot, Settings2, History, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useBrand } from '../lib/brand';
import type { Brand } from '../types';
import { logAudit } from '../lib/auditLogger';

interface BrandWithMembers extends Brand {
  member_count: number;
}

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  avatar_color: string;
  is_member: boolean;
}

const BRAND_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#06B6D4', '#8B5CF6', '#EC4899', '#14B8A6',
  '#F97316', '#6366F1',
];

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default function BrandManagement() {
  const { profile } = useAuth();
  const { reloadBrands } = useBrand();
  const [brands, setBrands] = useState<BrandWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandWithMembers | null>(null);
  const [managingMembersBrand, setManagingMembersBrand] = useState<BrandWithMembers | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const { data: brandsData, error: bErr } = await supabase
        .from('brands')
        .select('*')
        .order('name');
      if (bErr) throw bErr;

      const { data: memberCounts } = await supabase
        .from('brand_members')
        .select('brand_id')
        .eq('is_active', true);

      const countMap: Record<string, number> = {};
      for (const m of memberCounts ?? []) {
        countMap[m.brand_id] = (countMap[m.brand_id] ?? 0) + 1;
      }

      setBrands(
        (brandsData ?? []).map(b => ({
          ...b,
          member_count: countMap[b.id] ?? 0,
        }))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Veri yuklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  if (!profile?.is_founder) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-rose-400" />
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Bu sayfaya erisim yetkiniz yok.</p>
        </div>
      </div>
    );
  }

  const filtered = brands.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Marka Yonetimi</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Markalari ve uye atamalarini yonet</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-medium transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          Yeni Marka
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Marka ara..."
          className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-200 dark:bg-white/[0.06] transition-all duration-200"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(brand => (
            <BrandCard
              key={brand.id}
              brand={brand}
              onEdit={() => setEditingBrand(brand)}
              onManageMembers={() => setManagingMembersBrand(brand)}
              onToggleActive={async () => {
                await supabase.from('brands').update({ is_active: !brand.is_active }).eq('id', brand.id);
                await loadBrands();
                await reloadBrands();
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 text-sm">
              Marka bulunamadi.
            </div>
          )}
        </div>
      )}

      {(showCreateModal || editingBrand) && (
        <BrandFormModal
          brand={editingBrand}
          onClose={() => { setShowCreateModal(false); setEditingBrand(null); }}
          onSaved={async () => {
            setShowCreateModal(false);
            setEditingBrand(null);
            await loadBrands();
            await reloadBrands();
          }}
        />
      )}

      {managingMembersBrand && (
        <MembersModal
          brand={managingMembersBrand}
          onClose={() => setManagingMembersBrand(null)}
          onSaved={async () => { await loadBrands(); }}
        />
      )}
    </div>
  );
}

function getBrandReadiness(brand: BrandWithMembers): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!brand.livechat_api_key) missing.push('LiveChat API Key');
  if (!brand.livechat_url) missing.push('LiveChat URL');
  if (!brand.claude_api_key) missing.push('Claude API Key');
  return { ready: missing.length === 0, missing };
}

function BrandCard({
  brand,
  onEdit,
  onManageMembers,
  onToggleActive,
}: {
  brand: BrandWithMembers;
  onEdit: () => void;
  onManageMembers: () => void;
  onToggleActive: () => void;
}) {
  const { ready, missing } = getBrandReadiness(brand);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; msg?: string } | null>(null);

  const handleCatchUpSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-livechat?brand_id=${brand.id}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      });
      const data = await res.json();
      if (res.status === 409 || data.error?.includes('already running')) {
        setSyncResult({ synced: -2, msg: 'Zaten bir senkronizasyon calisiyor, 10sn sonra tekrar dene' });
      } else if (!data.success && data.error) {
        setSyncResult({ synced: -1, msg: data.error });
      } else {
        setSyncResult({ synced: data.synced ?? 0, msg: data.page_limit_reached ? 'Devam eden veri var, tekrar tikla' : undefined });
      }
    } catch {
      setSyncResult({ synced: -1, msg: 'Baglanti hatasi' });
    } finally {
      setSyncing(false);
    }
  };

  const formatSyncAt = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div className={`relative bg-slate-100 dark:bg-white/[0.03] border rounded-2xl p-5 transition-all duration-200 hover:bg-slate-200/50 dark:bg-white/[0.05] ${brand.is_active ? 'border-slate-200 dark:border-white/[0.08]' : 'border-slate-100 dark:border-white/[0.04] opacity-60'}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-900 dark:text-white font-bold text-sm shadow-lg flex-shrink-0"
            style={{ backgroundColor: brand.color ?? '#3B82F6', boxShadow: `0 0 20px ${brand.color ?? '#3B82F6'}40` }}
          >
            {brand.logo_url ? (
              <img src={brand.logo_url} alt={brand.name} className="w-full h-full object-cover rounded-xl" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              initials(brand.name)
            )}
          </div>
          <div>
            <h3 className="text-slate-900 dark:text-white font-semibold text-sm leading-tight">{brand.name}</h3>
            <p className="text-slate-500 text-xs mt-0.5">/{brand.slug}</p>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${brand.is_active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border border-slate-500/20'}`}>
          {brand.is_active ? 'Aktif' : 'Pasif'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] rounded-lg">
          <Users className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">{brand.member_count} uye</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.04] rounded-lg">
          <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">{brand.slug}</span>
        </div>
      </div>

      {brand.claude_api_key_error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl mb-2 bg-rose-500/[0.08] border border-rose-500/25">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-rose-300 leading-snug">{brand.claude_api_key_error}</p>
        </div>
      )}

      <div className={`flex items-start gap-2 px-3 py-2 rounded-xl mb-4 ${ready ? 'bg-emerald-500/[0.07] border border-emerald-500/20' : 'bg-amber-500/[0.07] border border-amber-500/20'}`}>
        {ready ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-emerald-400 font-medium">Senkronizasyon hazir</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-amber-400 font-medium">Eksik: {missing.join(', ')}</p>
            </div>
          </>
        )}
      </div>

      {(brand as any).last_sync_at && (
        <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 bg-slate-50 dark:bg-white/[0.02] rounded-lg border border-white/[0.05]">
          <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
          <span className="text-[11px] text-slate-500">
            Son sync: <span className="text-slate-500 dark:text-slate-400">{formatSyncAt((brand as any).last_sync_at)}</span>
          </span>
        </div>
      )}

      {syncResult && (
        <div className={`flex items-start gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg border text-[11px] leading-relaxed ${
          syncResult.synced >= 0
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : syncResult.synced === -2
            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {syncResult.synced >= 0 ? (
            <Check className="w-3 h-3 mt-0.5 flex-shrink-0" />
          ) : syncResult.synced === -2 ? (
            <RefreshCw className="w-3 h-3 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          )}
          <span>
            {syncResult.synced >= 0
              ? `${syncResult.synced} chat senkronize edildi`
              : ''}
            {syncResult.msg && (
              <span className={syncResult.synced >= 0 ? ' opacity-70' : ''}>
                {syncResult.synced >= 0 ? ` — ${syncResult.msg}` : syncResult.msg}
              </span>
            )}
          </span>
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <button
          onClick={onManageMembers}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-xl text-xs font-medium transition-all duration-200"
        >
          <Users className="w-3.5 h-3.5" />
          Uyeler
        </button>
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs transition-all duration-200"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onToggleActive}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all duration-200 border ${brand.is_active ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'}`}
        >
          {brand.is_active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
        </button>
      </div>

      {ready && (
        <button
          onClick={handleCatchUpSync}
          disabled={syncing}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-xs font-medium transition-all duration-200 disabled:opacity-50"
        >
          {syncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
          {syncing ? 'Senkronize ediliyor...' : 'Gecmisi Senkronize Et'}
        </button>
      )}
    </div>
  );
}

type FormTab = 'genel' | 'entegrasyonlar';

function FormField({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-200"
      />
      {hint && <p className="text-[11px] text-slate-600 mt-1">{hint}</p>}
    </div>
  );
}

function BrandFormModal({
  brand,
  onClose,
  onSaved,
}: {
  brand: BrandWithMembers | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { session } = useAuth();
  const [tab, setTab] = useState<FormTab>('genel');

  const [name, setName] = useState(brand?.name ?? '');
  const [slug, setSlug] = useState(brand?.slug ?? '');
  const [color, setColor] = useState(brand?.color ?? '#3B82F6');
  const [logoUrl, setLogoUrl] = useState(brand?.logo_url ?? '');
  const [slugManual, setSlugManual] = useState(!!brand);

  const [livechatApiKey, setLivechatApiKey] = useState(brand?.livechat_api_key ?? '');
  const [livechatUrl, setLivechatUrl] = useState(brand?.livechat_url ?? '');
  const [claudeApiKey, setClaudeApiKey] = useState(brand?.claude_api_key ?? '');
  const [alertBotToken, setAlertBotToken] = useState(brand?.telegram_alert_bot_token ?? '');
  const [alertChatId, setAlertChatId] = useState(brand?.telegram_alert_chat_id ?? '');
  const [callbackBotToken, setCallbackBotToken] = useState(brand?.telegram_callback_bot_token ?? '');
  const [callbackChatId, setCallbackChatId] = useState(brand?.telegram_callback_chat_id ?? '');
  const [financeBotToken, setFinanceBotToken] = useState(brand?.telegram_finance_bot_token ?? '');
  const [financeChatId, setFinanceChatId] = useState(brand?.telegram_finance_chat_id ?? '');
  const [pollingInterval, setPollingInterval] = useState(String(brand?.polling_interval ?? 5));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugManual) setSlug(slugify(v));
  };

  const handleSlugChange = (v: string) => {
    setSlug(slugify(v));
    setSlugManual(true);
  };

  const extractErrorMessage = (e: unknown): string => {
    if (e instanceof Error) return e.message;
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return 'Kayit basarisiz';
  };

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      setError('Marka adi ve slug zorunludur.');
      setTab('genel');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-brands`;
      const token = session?.access_token;

      const common = {
        name: name.trim(),
        slug: slug.trim(),
        color,
        logo_url: logoUrl.trim(),
        livechat_api_key: livechatApiKey.trim() || null,
        livechat_url: livechatUrl.trim() || null,
        claude_api_key: claudeApiKey.trim() || null,
        telegram_alert_bot_token: alertBotToken.trim() || null,
        telegram_alert_chat_id: alertChatId.trim() || null,
        telegram_callback_bot_token: callbackBotToken.trim() || null,
        telegram_callback_chat_id: callbackChatId.trim() || null,
        telegram_finance_bot_token: financeBotToken.trim() || null,
        telegram_finance_chat_id: financeChatId.trim() || null,
        polling_interval: parseInt(pollingInterval, 10) || 5,
      };

      const payload = brand
        ? { action: 'update', id: brand.id, ...common }
        : { action: 'create', ...common };

      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await resp.json();
      if (!result.success) throw new Error(result.error || 'Kayit basarisiz');

      logAudit({
        actionType: brand ? 'update' : 'create',
        entityType: 'brand',
        entityId: brand?.id,
        entityLabel: name.trim(),
        description: brand
          ? `"${name.trim()}" markasi guncellendi`
          : `"${name.trim()}" markasi olusturuldu`,
        newValues: { name: name.trim(), slug: slug.trim() },
      });
      onSaved();
    } catch (e: unknown) {
      setError(extractErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: FormTab; label: string; icon: React.ReactNode }[] = [
    { id: 'genel', label: 'Genel', icon: <Settings2 className="w-3.5 h-3.5" /> },
    { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: <Key className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <h2 className="text-slate-900 dark:text-white font-semibold">{brand ? 'Markay Duzenle' : 'Yeni Marka'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/[0.06] transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                tab === t.id
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {tab === 'genel' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Marka Adi *</label>
                <input
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Ornek: Acme Corp"
                  className="w-full px-3 py-2.5 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-200"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Slug * (URL tanimlayici)</label>
                <div className="flex items-center">
                  <span className="px-3 py-2.5 bg-slate-50 dark:bg-white/[0.02] border border-r-0 border-slate-200 dark:border-white/[0.08] rounded-l-xl text-slate-500 text-sm">/</span>
                  <input
                    value={slug}
                    onChange={e => handleSlugChange(e.target.value)}
                    placeholder="acme-corp"
                    className="flex-1 px-3 py-2.5 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-r-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-200"
                  />
                </div>
              </div>

              <FormField
                label="Logo URL (opsiyonel)"
                value={logoUrl}
                onChange={setLogoUrl}
                placeholder="https://..."
              />

              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Renk</label>
                <div className="flex flex-wrap gap-2">
                  {BRAND_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-lg transition-all duration-150 ${color === c ? 'ring-2 ring-white/50 scale-110' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-slate-500" />
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: color }}>
                    {initials(name || 'MB')}
                  </div>
                  <span className="text-xs text-slate-500">Onizleme</span>
                </div>
              </div>
            </>
          )}

          {tab === 'entegrasyonlar' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">API Anahtarlari</span>
              </div>

              <FormField
                label="LiveChat API Key"
                value={livechatApiKey}
                onChange={setLivechatApiKey}
                placeholder="livechat_..."
                type="password"
              />

              <FormField
                label="LiveChat URL"
                value={livechatUrl}
                onChange={setLivechatUrl}
                placeholder="https://livechat.example.com"
                hint="Markanin LiveChat sunucusunun adresi. Senkronizasyon icin zorunludur."
              />

              <FormField
                label="Claude API Key"
                value={claudeApiKey}
                onChange={setClaudeApiKey}
                placeholder="sk-ant-..."
                type="password"
              />

              <div className="pt-2 flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Telegram - Uyarilar</span>
              </div>

              <FormField
                label="Alert Bot Token"
                value={alertBotToken}
                onChange={setAlertBotToken}
                placeholder="123456:ABC-..."
                type="password"
              />

              <FormField
                label="Alert Chat ID"
                value={alertChatId}
                onChange={setAlertChatId}
                placeholder="-100123456789"
              />

              <div className="pt-2 flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Telegram - Callback Kuyrugu</span>
              </div>

              <FormField
                label="Callback Bot Token"
                value={callbackBotToken}
                onChange={setCallbackBotToken}
                placeholder="123456:ABC-..."
                type="password"
              />

              <FormField
                label="Callback Chat ID"
                value={callbackChatId}
                onChange={setCallbackChatId}
                placeholder="-100123456789"
              />

              <div className="pt-2 flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Telegram - Finans Bildirimleri</span>
              </div>

              <div className="px-3 py-2.5 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl">
                <p className="text-[11px] text-emerald-400 leading-relaxed">
                  70 puan altindaki finans konulu chatler (para yatirma, cekme, odeme vb.) bu gruba gonderilir.
                  Botu gruba ekleyip yonetici yapmayi unutmayin.
                </p>
              </div>

              <FormField
                label="Finans Bot Token"
                value={financeBotToken}
                onChange={setFinanceBotToken}
                placeholder="123456:ABC-..."
                type="password"
              />

              <FormField
                label="Finans Grup Chat ID"
                value={financeChatId}
                onChange={setFinanceChatId}
                placeholder="-100123456789"
                hint="Botu gruba ekledikten sonra getUpdates ile Chat ID'yi ogrenebilirsiniz."
              />

              <div className="pt-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Polling Interval (dakika)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={pollingInterval}
                  onChange={e => setPollingInterval(e.target.value)}
                  className="w-32 px-3 py-2.5 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-200"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-medium transition-all duration-200"
          >
            Iptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {brand ? 'Kaydet' : 'Olustur'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({
  brand,
  onClose,
  onSaved,
}: {
  brand: BrandWithMembers;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, membersRes] = await Promise.all([
        supabase.from('user_profiles').select('id, full_name, avatar_color').eq('is_active', true),
        supabase.from('brand_members').select('user_id').eq('brand_id', brand.id).eq('is_active', true),
      ]);

      const { data: authUsers } = await supabase.rpc('get_all_user_emails').then(res => res, () => ({ data: null, error: null }));
      const emailMap: Record<string, string> = {};
      if (Array.isArray(authUsers)) {
        for (const u of authUsers) {
          if (u.id && u.email) emailMap[u.id] = u.email;
        }
      }

      const memberIds = new Set((membersRes.data ?? []).map((m: { user_id: string }) => m.user_id));
      setUsers(
        (profilesRes.data ?? []).map((p: { id: string; full_name: string; avatar_color: string }) => ({
          id: p.id,
          full_name: p.full_name,
          email: emailMap[p.id] ?? '',
          avatar_color: p.avatar_color,
          is_member: memberIds.has(p.id),
        }))
      );
    } catch {
    } finally {
      setLoading(false);
    }
  }, [brand.id]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggle = async (user: UserOption) => {
    setSaving(user.id);
    try {
      if (user.is_member) {
        await supabase
          .from('brand_members')
          .update({ is_active: false })
          .eq('brand_id', brand.id)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('brand_members')
          .upsert({ brand_id: brand.id, user_id: user.id, is_active: true }, { onConflict: 'brand_id,user_id' });
      }
      await loadUsers();
      await onSaved();
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const members = filtered.filter(u => u.is_member);
  const nonMembers = filtered.filter(u => !u.is_member);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <div>
            <h2 className="text-slate-900 dark:text-white font-semibold">Uye Yonetimi</h2>
            <p className="text-slate-500 text-xs mt-0.5">{brand.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-white hover:bg-slate-200 dark:bg-white/[0.06] transition-all duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Kullanici ara..."
              className="w-full pl-9 pr-3 py-2 bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-all duration-200"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
            </div>
          ) : (
            <>
              {members.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-1">Mevcut Uyeler ({members.length})</p>
                  {members.map(u => (
                    <UserToggleRow key={u.id} user={u} loading={saving === u.id} onToggle={() => toggle(u)} />
                  ))}
                </div>
              )}

              {nonMembers.length > 0 && (
                <div>
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="flex items-center gap-2 w-full text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2 px-1 hover:text-slate-500 dark:text-slate-400 transition-colors"
                  >
                    {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Diger Kullanicilar ({nonMembers.length})
                  </button>
                  {expanded && nonMembers.map(u => (
                    <UserToggleRow key={u.id} user={u} loading={saving === u.id} onToggle={() => toggle(u)} />
                  ))}
                </div>
              )}

              {filtered.length === 0 && (
                <p className="text-center text-slate-500 text-xs py-8">Kullanici bulunamadi.</p>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/[0.06] flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-white/[0.04] hover:bg-slate-200 dark:hover:bg-slate-200 dark:bg-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm font-medium transition-all duration-200"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

function UserToggleRow({
  user,
  loading,
  onToggle,
}: {
  user: UserOption;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:bg-white/[0.03] transition-all duration-150">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-900 dark:text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: user.avatar_color ?? '#0891b2' }}
      >
        {initials(user.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 dark:text-white font-medium truncate">{user.full_name}</p>
        {user.email && <p className="text-xs text-slate-500 truncate">{user.email}</p>}
      </div>
      <button
        onClick={onToggle}
        disabled={loading}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex-shrink-0 ${
          user.is_member
            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'
            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
        } disabled:opacity-50`}
      >
        {loading ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : user.is_member ? (
          <><Trash2 className="w-3 h-3" /> Cikar</>
        ) : (
          <><Plus className="w-3 h-3" /> Ekle</>
        )}
      </button>
    </div>
  );
}
