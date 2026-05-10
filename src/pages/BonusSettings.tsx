import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, Check, X } from 'lucide-react';
import { useNotification } from '../lib/notifications';
import { useBrand } from '../lib/brand';
import { logAudit } from '../lib/auditLogger';

interface BonusRule {
  id: string;
  rule_name: string;
  metric_type: string;
  condition_type: string;
  threshold_min: number;
  threshold_max: number | null;
  bonus_amount: number;
  period_type: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function BonusSettings() {
  const { showSuccess, showError, showConfirm } = useNotification();
  const { activeBrand } = useBrand();
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<BonusRule | null>(null);
  const [formData, setFormData] = useState({
    rule_name: '',
    metric_type: 'total_chats',
    condition_type: 'greater_than',
    threshold_min: 0,
    threshold_max: null as number | null,
    bonus_amount: 0,
    rule_type: 'bonus' as 'bonus' | 'penalty',
    period_type: 'monthly',
    is_active: true,
  });

  const metricTypes = [
    { value: 'total_chats', label: 'Toplam Chat Sayısı' },
    { value: 'avg_score', label: 'Ortalama Skor' },
    { value: 'avg_satisfaction', label: 'Ortalama Müşteri Puanı (1-5)' },
    { value: 'avg_response_time', label: 'Ortalama Yanıt Süresi (sn)' },
    { value: 'positive_chats_count', label: 'Pozitif Chat Sayısı' },
    { value: 'negative_chats_count', label: 'Negatif Chat Sayısı' },
    { value: 'neutral_chats_count', label: 'Nötr Chat Sayısı' },
  ];

  const conditionTypes = [
    { value: 'greater_than', label: 'Büyüktür (>)' },
    { value: 'less_than', label: 'Küçüktür (<)' },
    { value: 'equals', label: 'Eşit (≈)' },
    { value: 'between', label: 'Arasında' },
  ];

  const periodTypes = [
    { value: 'daily', label: 'Günlük' },
    { value: 'weekly', label: 'Haftalık' },
    { value: 'monthly', label: 'Aylık' },
  ];

  useEffect(() => {
    fetchRules();
  }, [activeBrand?.brand_id]);

  const fetchRules = async () => {
    setLoading(true);
    let query = supabase
      .from('bonus_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeBrand?.brand_id) query = query.eq('brand_id', activeBrand.brand_id);

    const { data, error } = await query;

    if (!error && data) {
      setRules(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const bonusAmount = Number(formData.bonus_amount);
    const finalAmount = formData.rule_type === 'penalty' ? -Math.abs(bonusAmount) : Math.abs(bonusAmount);

    if (formData.condition_type === 'between' && formData.threshold_max !== null && Number(formData.threshold_min) >= Number(formData.threshold_max)) {
      showError('Minimum değer, maksimum değerden küçük olmalıdır.');
      return;
    }

    const ruleData = {
      rule_name: formData.rule_name,
      metric_type: formData.metric_type,
      condition_type: formData.condition_type,
      threshold_min: Number(formData.threshold_min),
      threshold_max: formData.threshold_max ? Number(formData.threshold_max) : null,
      bonus_amount: finalAmount,
      period_type: formData.period_type,
      is_active: formData.is_active,
    };

    if (editingRule) {
      const { error } = await supabase
        .from('bonus_rules')
        .update({ ...ruleData, brand_id: activeBrand?.brand_id })
        .eq('id', editingRule.id);

      if (!error) {
        logAudit({
          actionType: 'update',
          entityType: 'bonus_rule',
          entityId: editingRule.id,
          entityLabel: ruleData.rule_name,
          description: `"${ruleData.rule_name}" prim kurali guncellendi`,
          oldValues: { rule_name: editingRule.rule_name, bonus_amount: editingRule.bonus_amount },
          newValues: { rule_name: ruleData.rule_name, bonus_amount: ruleData.bonus_amount },
          brandId: activeBrand?.brand_id,
        });
        setShowForm(false);
        setEditingRule(null);
        fetchRules();
        resetForm();
      }
    } else {
      const { error } = await supabase
        .from('bonus_rules')
        .insert([{ ...ruleData, brand_id: activeBrand?.brand_id }]);

      if (!error) {
        logAudit({
          actionType: 'create',
          entityType: 'bonus_rule',
          entityLabel: ruleData.rule_name,
          description: `"${ruleData.rule_name}" prim kurali olusturuldu`,
          newValues: ruleData,
          brandId: activeBrand?.brand_id,
        });
        setShowForm(false);
        fetchRules();
        resetForm();
      }
    }
  };

  const handleEdit = (rule: BonusRule) => {
    setEditingRule(rule);
    setFormData({
      rule_name: rule.rule_name,
      metric_type: rule.metric_type,
      condition_type: rule.condition_type,
      threshold_min: rule.threshold_min,
      threshold_max: rule.threshold_max,
      bonus_amount: Math.abs(rule.bonus_amount),
      rule_type: rule.bonus_amount < 0 ? 'penalty' : 'bonus',
      period_type: rule.period_type,
      is_active: rule.is_active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    showConfirm(
      'Prim Kuralını Sil',
      'Bu prim kuralını silmek istediğinizden emin misiniz?',
      async () => {
        const { error } = await supabase
          .from('bonus_rules')
          .delete()
          .eq('id', id);

        if (!error) {
          showSuccess('Prim kuralı başarıyla silindi.');
          fetchRules();
        } else {
          showError('Prim kuralı silinirken bir hata oluştu.');
        }
      },
      'Sil',
      'İptal'
    );
  };

  const toggleActive = async (rule: BonusRule) => {
    const { error } = await supabase
      .from('bonus_rules')
      .update({ is_active: !rule.is_active })
      .eq('id', rule.id);

    if (!error) {
      fetchRules();
    }
  };

  const resetForm = () => {
    setFormData({
      rule_name: '',
      metric_type: 'total_chats',
      condition_type: 'greater_than',
      threshold_min: 0,
      threshold_max: null,
      bonus_amount: 0,
      rule_type: 'bonus',
      period_type: 'monthly',
      is_active: true,
    });
  };

  const getConditionText = (rule: BonusRule) => {
    const metric = metricTypes.find(m => m.value === rule.metric_type)?.label;
    const condition = conditionTypes.find(c => c.value === rule.condition_type)?.label;

    if (rule.condition_type === 'between') {
      return `${metric} ${rule.threshold_min} - ${rule.threshold_max} ${condition}`;
    }
    return `${metric} ${condition} ${rule.threshold_min}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Prim Ayarlari</h1>
          <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 mt-2">Personel performans bazli prim kurallarini yonetin</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRule(null);
            resetForm();
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex-shrink-0 self-start"
        >
          <Plus className="w-5 h-5" />
          Yeni Kural
        </button>
      </div>

      {showForm && (
        <div className="glass-effect rounded-lg shadow-lg p-4 sm:p-6 mb-6">
          <h2 className="text-lg sm:text-xl font-semibold mb-4">
            {editingRule ? 'Kuralı Düzenle' : 'Yeni Kural Ekle'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Kural Adı
                </label>
                <input
                  type="text"
                  value={formData.rule_name}
                  onChange={(e) => setFormData({ ...formData, rule_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  placeholder="Örn: 100+ Chat Primi"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Metrik Tipi
                </label>
                <select
                  value={formData.metric_type}
                  onChange={(e) => setFormData({ ...formData, metric_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {metricTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Koşul Tipi
                </label>
                <select
                  value={formData.condition_type}
                  onChange={(e) => setFormData({ ...formData, condition_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {conditionTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Eşik Değer {formData.condition_type === 'between' && '(Min)'}
                </label>
                <input
                  type="number"
                  value={formData.threshold_min}
                  onChange={(e) => setFormData({ ...formData, threshold_min: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  step="0.01"
                />
              </div>

              {formData.condition_type === 'between' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                    Eşik Değer (Max)
                  </label>
                  <input
                    type="number"
                    value={formData.threshold_max || ''}
                    onChange={(e) => setFormData({ ...formData, threshold_max: e.target.value ? Number(e.target.value) : null })}
                    className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required={formData.condition_type === 'between'}
                    step="0.01"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Kural Tipi
                </label>
                <select
                  value={formData.rule_type}
                  onChange={(e) => setFormData({ ...formData, rule_type: e.target.value as 'bonus' | 'penalty' })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="bonus">Prim (Ödül)</option>
                  <option value="penalty">Ceza (Kesinti)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  {formData.rule_type === 'bonus' ? 'Prim Tutarı (₺)' : 'Ceza Tutarı (₺)'}
                </label>
                <input
                  type="number"
                  value={formData.bonus_amount}
                  onChange={(e) => setFormData({ ...formData, bonus_amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                  step="0.01"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Periyot
                </label>
                <select
                  value={formData.period_type}
                  onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-white/15 text-slate-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {periodTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-200">Aktif</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingRule ? 'Güncelle' : 'Kaydet'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingRule(null);
                  resetForm();
                }}
                className="px-6 py-2 bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-white/15 transition-colors border border-slate-300 dark:border-white/10"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-effect rounded-lg shadow-lg overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
            <thead className="bg-slate-100 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Durum</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kural Adi</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kosul</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prim/Ceza</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Periyot</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Islemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                    Henuz prim kurali eklenmemis.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-100 dark:bg-white/5 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleActive(rule)}
                        className={`flex items-center justify-center w-8 h-8 rounded-full ${rule.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}
                      >
                        {rule.is_active ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">{rule.rule_name}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-slate-600 dark:text-slate-300">{getConditionText(rule)}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {rule.bonus_amount >= 0 ? (
                        <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{rule.bonus_amount.toLocaleString('tr-TR')} TL</div>
                      ) : (
                        <div className="text-sm font-semibold text-red-600 dark:text-red-400">{rule.bonus_amount.toLocaleString('tr-TR')} TL</div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                        {periodTypes.find(p => p.value === rule.period_type)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit(rule)} className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(rule.id)} className="p-2 text-red-400 hover:bg-red-500/15 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Henuz prim kurali eklenmemis.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 hover:bg-slate-100 dark:bg-white/5 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => toggleActive(rule)}
                          className={`flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0 ${rule.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}
                        >
                          {rule.is_active ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                        <span className="font-medium text-sm text-slate-900 dark:text-white truncate">{rule.rule_name}</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 mb-1">{getConditionText(rule)}</div>
                      <div className="flex items-center gap-2">
                        {rule.bonus_amount >= 0 ? (
                          <span className="text-sm font-bold text-emerald-400">+{rule.bonus_amount.toLocaleString('tr-TR')} TL</span>
                        ) : (
                          <span className="text-sm font-bold text-red-400">{rule.bonus_amount.toLocaleString('tr-TR')} TL</span>
                        )}
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20">
                          {periodTypes.find(p => p.value === rule.period_type)?.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleEdit(rule)} className="p-2 text-blue-400 hover:bg-blue-500/15 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(rule.id)} className="p-2 text-red-400 hover:bg-red-500/15 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
