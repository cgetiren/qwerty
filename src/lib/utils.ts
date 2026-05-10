export const SCORE_TIERS = [
  { key: 'mukemmel', label: 'Mükemmel', min: 90, max: 100, color: '#10b981', ringColor: 'ring-emerald-500', borderColor: 'border-emerald-500', textColor: 'text-emerald-400', iconBg: 'bg-emerald-500/15', badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' },
  { key: 'iyi',      label: 'İyi',      min: 70, max: 89,  color: '#06b6d4', ringColor: 'ring-cyan-500',    borderColor: 'border-cyan-500',    textColor: 'text-cyan-400',    iconBg: 'bg-cyan-500/15',    badgeClass: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' },
  { key: 'orta',     label: 'Orta',     min: 60, max: 69,  color: '#3b82f6', ringColor: 'ring-blue-500',    borderColor: 'border-blue-500',    textColor: 'text-blue-400',    iconBg: 'bg-blue-500/15',    badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' },
  { key: 'olumsuz',  label: 'Olumsuz',  min: 40, max: 59,  color: '#f59e0b', ringColor: 'ring-amber-500',   borderColor: 'border-amber-500',   textColor: 'text-amber-400',   iconBg: 'bg-amber-500/15',   badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30' },
  { key: 'dikkat',   label: 'Dikkat',   min: 30, max: 39,  color: '#f97316', ringColor: 'ring-orange-500',  borderColor: 'border-orange-500',  textColor: 'text-orange-400',  iconBg: 'bg-orange-500/15',  badgeClass: 'bg-orange-500/15 text-orange-400 border border-orange-500/30' },
  { key: 'kritik',   label: 'Kritik',   min: 0,  max: 29,  color: '#f43f5e', ringColor: 'ring-rose-500',    borderColor: 'border-rose-500',    textColor: 'text-rose-400',    iconBg: 'bg-rose-500/15',    badgeClass: 'bg-rose-500/15 text-rose-400 border border-rose-500/30' },
] as const;

export type ScoreTierKey = typeof SCORE_TIERS[number]['key'];

export function getScoreTier(score: number) {
  for (const tier of SCORE_TIERS) {
    if (score >= tier.min) return tier;
  }
  return SCORE_TIERS[SCORE_TIERS.length - 1];
}

export function maskName(name: string | null | undefined): string {
  if (!name) return 'Bilinmiyor';
  return name
    .split(' ')
    .map(word => {
      if (word.length <= 1) return word;
      return word[0] + '*'.repeat(word.length - 1);
    })
    .join(' ');
}

export function getIstanbulDateStartUTC(daysAgo: number = 0): string {
  const now = new Date();
  const istanbulTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));

  istanbulTime.setDate(istanbulTime.getDate() - daysAgo);
  istanbulTime.setHours(0, 0, 0, 0);

  const utcEquivalent = new Date(istanbulTime.toLocaleString('en-US', { timeZone: 'UTC' }));

  return utcEquivalent.toISOString();
}

export function getIstanbulDateEndUTC(daysAgo: number = 0): string {
  const now = new Date();
  const istanbulTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));

  istanbulTime.setDate(istanbulTime.getDate() - daysAgo);
  istanbulTime.setHours(23, 59, 59, 999);

  const utcEquivalent = new Date(istanbulTime.toLocaleString('en-US', { timeZone: 'UTC' }));

  return utcEquivalent.toISOString();
}

export function formatDateInIstanbulTimezone(utcDateString: string): string {
  const date = new Date(utcDateString);
  const istanbulDateString = date.toLocaleString('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [month, day, year] = istanbulDateString.split(/[\/,\s]+/);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function convertIstanbulDateToUTC(dateString: string, isEndOfDay: boolean = false): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const istanbulDate = new Date();
  istanbulDate.setFullYear(year, month - 1, day);

  if (isEndOfDay) {
    istanbulDate.setHours(23, 59, 59, 999);
  } else {
    istanbulDate.setHours(0, 0, 0, 0);
  }

  const istanbulTimeStr = istanbulDate.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' });
  const utcDate = new Date(istanbulTimeStr);

  return utcDate.toISOString();
}
