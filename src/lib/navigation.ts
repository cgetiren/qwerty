import type { ElementType } from 'react';
import {
  LayoutDashboard, MessageSquare, Users, TrendingUp, Settings, Activity,
  List, DollarSign, FileText, BookOpen, GraduationCap, PhoneCall,
  Shield, UserCog, Building2, Flag, ScrollText, FileBarChart,
} from 'lucide-react';

export interface NavItem {
  id: string;
  name: string;
  icon: ElementType;
  accent: string;
  permission?: string;
  founderOnly?: boolean;
}

export interface NavGroup {
  label: string | null;
  icon: ElementType | null;
  accent: string;
  items: NavItem[];
}

export const navigationGroups: NavGroup[] = [
  {
    label: null,
    icon: null,
    accent: 'cyan',
    items: [
      { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, accent: 'cyan', permission: 'dashboard.view' },
    ],
  },
  {
    label: 'Chat',
    icon: MessageSquare,
    accent: 'cyan',
    items: [
      { id: 'all-chats', name: 'Tum Chatler', icon: List, accent: 'cyan', permission: 'chats.view' },
      { id: 'chats', name: 'Chat Analizleri', icon: MessageSquare, accent: 'cyan', permission: 'chats.view' },
      { id: 'callback-queue', name: 'Geri Arama Kuyrugu', icon: PhoneCall, accent: 'cyan', permission: 'callcenter.view' },
    ],
  },
  {
    label: 'Analitik',
    icon: TrendingUp,
    accent: 'emerald',
    items: [
      { id: 'personnel', name: 'Personel', icon: Users, accent: 'emerald', permission: 'personnel.view' },
      { id: 'personnel-reports', name: 'Personel Raporlari', icon: FileBarChart, accent: 'violet', permission: 'reports.view' },
      { id: 'reports', name: 'Raporlar', icon: TrendingUp, accent: 'emerald', permission: 'reports.view' },
      { id: 'monitoring', name: 'Canli Izleme', icon: Activity, accent: 'emerald', permission: 'monitoring.view' },
      { id: 'objection-report', name: 'Itiraz Raporu', icon: Flag, accent: 'rose', permission: 'reports.view' },
      { id: 'sync-logs', name: 'Sync Loglari', icon: Activity, accent: 'sky', permission: 'monitoring.view' },
    ],
  },
  {
    label: 'Prim',
    icon: DollarSign,
    accent: 'amber',
    items: [
      { id: 'bonus-settings', name: 'Prim Ayarlari', icon: DollarSign, accent: 'amber', permission: 'bonus.settings.view' },
      { id: 'bonus-reports', name: 'Prim Raporlari', icon: FileText, accent: 'amber', permission: 'bonus.reports.view' },
    ],
  },
  {
    label: 'Diger',
    icon: Settings,
    accent: 'slate',
    items: [
      { id: 'coaching', name: 'Kocluk Merkezi', icon: GraduationCap, accent: 'sky', permission: 'coaching.view' },
      { id: 'user-guide', name: 'Kullanim Kilavuzu', icon: BookOpen, accent: 'sky' },
      { id: 'settings', name: 'Ayarlar', icon: Settings, accent: 'slate', permission: 'settings.view' },
    ],
  },
  {
    label: 'Yonetim',
    icon: Shield,
    accent: 'rose',
    items: [
      { id: 'user-management', name: 'Kullanicilar', icon: UserCog, accent: 'rose', permission: 'admin.users.view' },
      { id: 'role-management', name: 'Roller & Yetkiler', icon: Shield, accent: 'rose', permission: 'admin.roles.view' },
      { id: 'brand-management', name: 'Markalar', icon: Building2, accent: 'rose', founderOnly: true },
      { id: 'audit-logs', name: 'Denetim Gunlugu', icon: ScrollText, accent: 'rose', permission: 'admin.audit.view' },
    ],
  },
];

export const accentClasses: Record<string, { bg: string; text: string; border: string; glow: string; iconBg: string }> = {
  cyan: {
    bg: 'from-cyan-500/15 to-cyan-500/5',
    text: 'text-cyan-300',
    border: 'border-cyan-400/60',
    glow: 'shadow-cyan-500/25',
    iconBg: 'bg-cyan-500/20 text-cyan-300',
  },
  emerald: {
    bg: 'from-emerald-500/15 to-emerald-500/5',
    text: 'text-emerald-300',
    border: 'border-emerald-400/60',
    glow: 'shadow-emerald-500/25',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
  },
  amber: {
    bg: 'from-amber-500/15 to-amber-500/5',
    text: 'text-amber-300',
    border: 'border-amber-400/60',
    glow: 'shadow-amber-500/25',
    iconBg: 'bg-amber-500/20 text-amber-300',
  },
  sky: {
    bg: 'from-sky-500/15 to-sky-500/5',
    text: 'text-sky-300',
    border: 'border-sky-400/60',
    glow: 'shadow-sky-500/25',
    iconBg: 'bg-sky-500/20 text-sky-300',
  },
  slate: {
    bg: 'from-slate-500/15 to-slate-500/5',
    text: 'text-slate-300',
    border: 'border-slate-400/40',
    glow: 'shadow-slate-500/10',
    iconBg: 'bg-slate-500/20 text-slate-300',
  },
  rose: {
    bg: 'from-rose-500/15 to-rose-500/5',
    text: 'text-rose-300',
    border: 'border-rose-400/60',
    glow: 'shadow-rose-500/25',
    iconBg: 'bg-rose-500/20 text-rose-300',
  },
  violet: {
    bg: 'from-violet-500/15 to-violet-500/5',
    text: 'text-violet-300',
    border: 'border-violet-400/60',
    glow: 'shadow-violet-500/25',
    iconBg: 'bg-violet-500/20 text-violet-300',
  },
};

export function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
}
