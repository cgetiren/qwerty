import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import { useAuth } from './lib/auth';
import { supabase } from './lib/supabase';
import { NotificationProvider } from './lib/notifications';
import Sidebar from './components/Sidebar';
import { navigationGroups, accentClasses } from './lib/navigation';
import { logPageView } from './lib/auditLogger';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ChatAnalysisList = lazy(() => import('./pages/ChatAnalysisList'));
const ChatList = lazy(() => import('./pages/ChatList'));
const PersonnelAnalytics = lazy(() => import('./pages/PersonnelAnalytics'));
const Reports = lazy(() => import('./pages/Reports'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Monitoring = lazy(() => import('./pages/Monitoring'));
const BonusSettings = lazy(() => import('./pages/BonusSettings'));
const BonusReports = lazy(() => import('./pages/BonusReports'));
const UserGuide = lazy(() => import('./pages/UserGuide'));
const CoachingCenter = lazy(() => import('./pages/CoachingCenter'));
const CallbackQueuePage = lazy(() => import('./pages/CallbackQueuePage'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const BrandManagement = lazy(() => import('./pages/BrandManagement'));
const ObjectionReport = lazy(() => import('./pages/ObjectionReport'));
const SyncLogs = lazy(() => import('./pages/SyncLogs'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-96">
    <div className="relative">
      <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
    </div>
  </div>
);

function App() {
  const { session, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mfaChecked, setMfaChecked] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaNeedsEnroll, setMfaNeedsEnroll] = useState(false);
  const location = useLocation();

  // Log page views
  useEffect(() => {
    if (!session || !mfaChecked || mfaRequired || mfaNeedsEnroll) return;
    const pathId = location.pathname.replace(/^\//, '') || 'dashboard';
    const navItem = navigationGroups.flatMap(g => g.items).find(n => n.id === pathId);
    if (navItem) {
      logPageView(navItem.name);
    }
  }, [location.pathname, session, mfaChecked, mfaRequired, mfaNeedsEnroll]);

  // Check MFA level after session is available
  useEffect(() => {
    if (!session) { setMfaChecked(false); setMfaRequired(false); setMfaNeedsEnroll(false); return; }
    const checkMfa = async () => {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      // If user has enrolled MFA but hasn't verified yet (aal1 with nextLevel aal2)
      if (data && data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
        setMfaRequired(true);
        setMfaChecked(true);
        return;
      }

      // Check if admin required 2FA but user hasn't enrolled yet
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasVerifiedFactor = (factors?.totp || []).some(f => f.status === 'verified');
      if (!hasVerifiedFactor) {
        const { data: profile } = await supabase.from('user_profiles').select('require_2fa').eq('id', session.user.id).maybeSingle();
        if (profile?.require_2fa) {
          setMfaNeedsEnroll(true);
          setMfaChecked(true);
          return;
        }
      }

      setMfaRequired(false);
      setMfaNeedsEnroll(false);
      setMfaChecked(true);
    };
    checkMfa();
  }, [session]);

  const currentPathId = location.pathname.replace(/^\//, '');
  const allNavItems = navigationGroups.flatMap(g => g.items);
  const currentNav = allNavItems.find(n => n.id === currentPathId);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin shadow-2xl shadow-cyan-500/30" />
          <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-emerald-400 rounded-full animate-spin shadow-2xl shadow-emerald-500/30" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }} />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onLogin={() => { setMfaChecked(false); setMfaRequired(false); }} />;
  }

  // Wait for MFA check
  if (!mfaChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  // MFA required but not verified - show MFA verify screen
  if (mfaRequired) {
    return <LoginPage onLogin={() => { setMfaRequired(false); setMfaChecked(false); }} mfaChallengeMode />;
  }

  // Admin required 2FA but user hasn't enrolled - show enrollment screen
  if (mfaNeedsEnroll) {
    return <LoginPage onLogin={() => { setMfaNeedsEnroll(false); setMfaChecked(false); }} mfaEnrollMode />;
  }

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-950/90 border-b border-white/5 px-4 py-3 flex items-center justify-between backdrop-blur-xl">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-200"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {currentNav && (
              <span className={`text-xs font-semibold ${accentClasses[currentNav.accent]?.text || 'text-white'}`}>
                {currentNav.name}
              </span>
            )}
          </div>
          <div className="w-9" />
        </div>

        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex">
          <aside className={`
            fixed top-0 left-0 z-50 h-full w-64
            bg-[#0d1117] border-r border-white/[0.06]
            transform transition-transform duration-300 ease-in-out
            lg:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            shadow-2xl shadow-black/50
          `}>
            <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
          </aside>

          <main className="flex-1 lg:ml-64 pt-20 lg:pt-8 pb-8 px-4 sm:px-6 lg:px-8 min-w-0">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/all-chats" element={<ChatList />} />
                <Route path="/chats" element={<ChatAnalysisList />} />
                <Route path="/personnel" element={<PersonnelAnalytics />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/monitoring" element={<Monitoring />} />
                <Route path="/bonus-settings" element={<BonusSettings />} />
                <Route path="/bonus-reports" element={<BonusReports />} />
                <Route path="/coaching" element={<CoachingCenter />} />
                <Route path="/callback-queue" element={<CallbackQueuePage />} />
                <Route path="/user-guide" element={<UserGuide />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/role-management" element={<RoleManagement />} />
                <Route path="/user-management" element={<UserManagement />} />
                <Route path="/brand-management" element={<BrandManagement />} />
                <Route path="/objection-report" element={<ObjectionReport />} />
                <Route path="/sync-logs" element={<SyncLogs />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}

export default App;
