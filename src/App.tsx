import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { TelegramAuthModal } from './components/TelegramAuthModal';
import { AddAccountModal } from './components/AddAccountModal';
import { TargetGroupsCard } from './components/TargetGroupsCard';
import { CampaignCard } from './components/CampaignCard';
import { SchedulerCard } from './components/SchedulerCard';
import { AccountManagerCard } from './components/AccountManagerCard';
import { AntiBotSettingsCard } from './components/AntiBotSettingsCard';
import { MonitoringConsoleCard } from './components/MonitoringConsoleCard';
import { BroadcastReportCard } from './components/BroadcastReportCard';
import { AnonymousBotsCard } from './components/AnonymousBotsCard';
import { LogsConsole } from './components/LogsConsole';
import {
  AppState,
  TelegramCredentials,
  TargetGroup,
  ProductCampaign,
  SchedulerConfig,
  AntiBotSettings,
  AnonymousBotProfile,
  AnonymousChatAutomatorConfig,
} from './types';
import {
  Send,
  Power,
  Sparkles,
  Layers,
  CheckCircle,
  Bot,
  Megaphone,
  Users,
  Terminal,
  ShieldCheck,
  StopCircle,
  RefreshCw,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';

export default function App() {
  const [appState, setAppState] = useState<AppState>({
    credentials: {
      apiId: '',
      apiHash: '',
      phoneNumber: '',
      sessionString: '',
      isConnected: false,
    },
    groups: [],
    campaigns: [],
    scheduler: {
      intervalMinutes: 5,
      jitterSeconds: 20,
      dailyLimit: 100,
      nightModePause: true,
      isAutoRunActive: false,
      totalSentCount: 0,
      totalSuccessCount: 0,
      totalFailedCount: 0,
    },
    logs: [],
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [isSendingNow, setIsSendingNow] = useState(false);
  const [isStoppingBroadcast, setIsStoppingBroadcast] = useState(false);
  const [activeMainTab, setActiveMainTab] = useState<'anonymous_bot' | 'group_broadcast' | 'accounts' | 'logs'>('anonymous_bot');

  // Fetch complete state from Express backend and sync with localStorage
  const fetchState = async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data: AppState = await res.json();
        setAppState(data);
        if (data.activeBroadcastProgress && !data.activeBroadcastProgress.isRunning) {
          setIsSendingNow(false);
        }
        localStorage.setItem('telegram_promoter_persistent_backup', JSON.stringify(data));
      }
    } catch (err) {
      // Quietly retry on next interval if server is restarting
      console.warn('Syncing app state...');
    }
  };

  useEffect(() => {
    fetchState();
    // Fast polling (1s) when broadcasting is active, regular polling (3.5s) otherwise
    const isRunning = isSendingNow || Boolean(appState.activeBroadcastProgress?.isRunning);
    const intervalMs = isRunning ? 1000 : 3500;
    const timer = setInterval(fetchState, intervalMs);
    return () => clearInterval(timer);
  }, [isSendingNow, appState.activeBroadcastProgress?.isRunning]);

  // Save Credentials
  const handleSaveCredentials = async (apiId: string, apiHash: string, phoneNumber: string, botToken?: string) => {
    const res = await fetch('/api/credentials/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiId, apiHash, phoneNumber, botToken }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ذخیره کلیدها');
    }
    await fetchState();
  };

  // Send Code
  const handleSendCode = async (phoneNumber: string) => {
    const res = await fetch('/api/credentials/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ارسال کد تایید');
    }
    await fetchState();
  };

  // Verify OTP
  const handleVerifyCode = async (phoneCode: string, password?: string) => {
    const res = await fetch('/api/credentials/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneCode, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در تایید کد');
    }
    await fetchState();
  };

  // Logout
  const handleLogout = async () => {
    await fetch('/api/credentials/logout', { method: 'POST' });
    await fetchState();
  };

  // Multi-Account Handlers
  const handleSelectActiveAccount = async (id: string) => {
    await fetch('/api/accounts/select-active', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: id }),
    });
    await fetchState();
  };

  const handleToggleAccountActive = async (id: string, isActive: boolean) => {
    await fetch('/api/accounts/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: id, isActive }),
    });
    await fetchState();
  };

  const handleDeleteAccount = async (id: string) => {
    await fetch('/api/accounts/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: id }),
    });
    await fetchState();
  };

  // Group Handlers
  const handleAddGroup = async (title: string, usernameOrLink: string, category?: string) => {
    await fetch('/api/groups/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, usernameOrLink, category }),
    });
    await fetchState();
  };

  const handleAddBulkGroups = async (bulkText: string, category?: string) => {
    const res = await fetch('/api/groups/add-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bulkText, category }),
    });
    const data = await res.json().catch(() => ({}));
    await fetchState();
    return data.addedCount || 0;
  };

  const handleToggleGroup = async (id: string, isActive: boolean) => {
    await fetch('/api/groups/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    });
    await fetchState();
  };

  const handleToggleAllGroups = async (isActive: boolean) => {
    await fetch('/api/groups/toggle-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    await fetchState();
  };

  const handleDeleteGroup = async (id: string) => {
    await fetch('/api/groups/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await fetchState();
  };

  const handleDeletePostedGroups = async () => {
    await fetch('/api/groups/delete-posted', { method: 'POST' });
    await fetchState();
  };

  const handleDeleteBulkGroupsByIds = async (ids: string[]) => {
    await fetch('/api/groups/delete-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    await fetchState();
  };

  // Campaign Handlers
  const handleSaveCampaign = async (campaign: Partial<ProductCampaign>) => {
    const res = await fetch('/api/campaigns/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaign),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'خطا در ذخیره‌سازی کمپین');
    }
    await fetchState();
  };

  const handleDeleteCampaign = async (id: string) => {
    await fetch('/api/campaigns/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    await fetchState();
  };

  const handleToggleCampaign = async (id: string, isActive: boolean) => {
    await fetch('/api/campaigns/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive }),
    });
    await fetchState();
  };

  // Scheduler Updates
  const handleUpdateScheduler = async (config: Partial<SchedulerConfig>) => {
    await fetch('/api/scheduler/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    await fetchState();
  };

  const handleSaveAntiBotSettings = async (antiBotSettings: AntiBotSettings) => {
    await fetch('/api/scheduler/update-antibot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(antiBotSettings),
    });
    await fetchState();
  };

  const handleToggleAutoRun = async (active: boolean) => {
    await handleUpdateScheduler({ isAutoRunActive: active });
  };

  // Immediate Broadcast
  const handleSendNow = async () => {
    setIsSendingNow(true);
    try {
      const res = await fetch('/api/broadcast/send-now', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || 'خطا در آغاز ارسال');
        setIsSendingNow(false);
      }
      await fetchState();
    } catch (err: any) {
      console.error(err);
      alert('خطا در ارسال درخواست به سرور: ' + (err.message || ''));
      setIsSendingNow(false);
    }
  };

  // Stop / Cancel Active Broadcast
  const handleStopBroadcast = async () => {
    setIsStoppingBroadcast(true);
    try {
      await fetch('/api/broadcast/stop', { method: 'POST' });
      setIsSendingNow(false);
      await fetchState();
    } catch (err) {
      console.error('Error stopping broadcast:', err);
    } finally {
      setIsStoppingBroadcast(false);
      setIsSendingNow(false);
      await fetchState();
    }
  };

  // Direct Test Send to Specific Target
  const handleTestSendTarget = async (target: string) => {
    try {
      const res = await fetch('/api/send-direct-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`خطای ارسال پیام تست: ${data.error || 'ناشناخته'}`);
      } else {
        alert(`✅ پیام تست با موفقیت به ${target} ارسال شد.`);
      }
      await fetchState();
    } catch (err: any) {
      alert(`خطا در ارتباط با سرور: ${err.message}`);
    }
  };

  // Clear Logs
  const handleClearLogs = async () => {
    await fetch('/api/logs/clear', { method: 'POST' });
    await fetchState();
  };

  // Sync Telegram Groups directly
  const handleSyncGroups = async () => {
    try {
      const res = await fetch('/api/telegram/sync-groups', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(`خطای همگام‌سازی گروه‌ها: ${data.error || 'پاسخی از تلگرام دریافت نشد'}`);
      } else {
        alert(`همگام‌سازی کامل گروه‌ها انجام شد!\nتعداد گروه‌های جدید: ${data.addedCount || 0}\nتعداد گروه‌های به‌روزرسانی شده: ${data.updatedCount || 0}`);
      }
      await fetchState();
    } catch (err: any) {
      alert(`خطا در ارتباط با سرور: ${err.message}`);
    }
  };

  // Clear Monitoring Reports
  const handleClearMonitoringReports = async () => {
    await fetch('/api/monitoring/clear', { method: 'POST' });
    await fetchState();
  };

  // Mark Group Manual Review Completed
  const handleMarkReviewed = async (groupId: string) => {
    await fetch('/api/monitoring/mark-reviewed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId }),
    });
    await fetchState();
  };

  // Recheck Anti-Bot Barriers and Send Campaign to Specific Group
  const handleRecheckAndSend = async (groupId: string) => {
    try {
      const res = await fetch('/api/groups/recheck-and-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`خطا در بررسی مجدد یا ارسال: ${data.error || 'ارسال انجام نشد'}`);
      } else {
        alert(`✅ ${data.message}`);
      }
      await fetchState();
    } catch (err: any) {
      alert(`خطا در ارتباط با سرور: ${err.message}`);
    }
  };

  // Anonymous Chat Handlers
  const handleUpdateAnonymousConfig = async (updates: Partial<AnonymousChatAutomatorConfig>) => {
    const res = await fetch('/api/anonymous/update-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در به‌روزرسانی تنظیمات چت ناشناس');
    }
    await fetchState();
  };

  const handleSaveAnonymousBot = async (bot: AnonymousBotProfile) => {
    const res = await fetch('/api/anonymous/save-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bot),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'خطا در ذخیره ربات ناشناس');
    }
    await fetchState();
  };

  const handleDeleteAnonymousBot = async (botId: string) => {
    await fetch('/api/anonymous/delete-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId }),
    });
    await fetchState();
  };

  const handleStartAnonymousAutomator = async (botId?: string) => {
    try {
      const res = await fetch('/api/anonymous/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`خطا در شروع چت ناشناس:\n${data.error || 'عملیات ناموفق بود'}`);
        if (data.needAuth) {
          setIsAuthModalOpen(true);
        }
      }
      await fetchState();
    } catch (err: any) {
      alert(`خطا در ارتباط با سرور: ${err.message}`);
      await fetchState();
    }
  };

  const handleStopAnonymousAutomator = async () => {
    await fetch('/api/anonymous/stop', { method: 'POST' });
    await fetchState();
  };

  const handleNextAnonymousStranger = async () => {
    await fetch('/api/anonymous/next-stranger', { method: 'POST' });
    await fetchState();
  };

  const handleSendAnonymousManualMessage = async (text: string) => {
    const res = await fetch('/api/anonymous/send-manual-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const data = await res.json();
      alert(`خطا در ارسال پیام دستی: ${data.error || 'ارسال نشد'}`);
    }
    await fetchState();
  };

  const handleClearAnonymousHistory = async () => {
    await fetch('/api/anonymous/clear-history', { method: 'POST' });
    await fetchState();
  };

  const [isSavingAllState, setIsSavingAllState] = useState(false);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<string | null>(null);

  const handleSaveAll = async () => {
    setIsSavingAllState(true);
    try {
      const res = await fetch('/api/save-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduler: appState.scheduler,
          groups: appState.groups,
          campaigns: appState.campaigns,
          anonymousAutomator: appState.anonymousAutomator,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'خطا در ذخیره اطلاعات');
      }
      setLastSavedTimestamp(data.timestamp || new Date().toISOString());
      await fetchState();
    } catch (err: any) {
      console.error(err);
      alert('خطا در ذخیره‌سازی اطلاعات: ' + err.message);
    } finally {
      setIsSavingAllState(false);
    }
  };

  const isBroadcastingActive = isSendingNow || Boolean(appState.activeBroadcastProgress?.isRunning);
  const activeGroupsCount = appState.groups.filter((g) => g.isActive).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white" dir="rtl">
      
      {/* Global Header Bar with Segmented Module Tabs */}
      <Header
        credentials={appState.credentials}
        accounts={appState.accounts || []}
        activeAccountId={appState.activeAccountId}
        scheduler={appState.scheduler}
        anonymousConfig={appState.anonymousAutomator}
        activeNavTab={activeMainTab}
        onNavTabChange={(tab) => setActiveMainTab(tab)}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onOpenAddAccount={() => setIsAddAccountModalOpen(true)}
        onLogout={handleLogout}
        onSaveAll={handleSaveAll}
        isSavingAll={isSavingAllState}
        lastSavedTime={lastSavedTimestamp}
        onRestoreState={(newState) => setAppState(newState)}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* ================================================================= */}
        {/* MODULE 1: ANONYMOUS BOT AUTOMATION & AI CHAT (ملودی & چت ناشناس) */}
        {/* ================================================================= */}
        {activeMainTab === 'anonymous_bot' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <AnonymousBotsCard
              config={appState.anonymousAutomator}
              activeSession={appState.activeAnonymousSession}
              history={appState.anonymousSessionHistory || []}
              currentTestRun={appState.currentTestRun}
              previousTestRuns={appState.previousTestRuns || []}
              isConnected={appState.credentials.isConnected}
              credentials={appState.credentials}
              accounts={appState.accounts || []}
              activeAccountId={appState.activeAccountId}
              onSelectActiveAccount={handleSelectActiveAccount}
              onOpenAddAccountModal={() => setIsAddAccountModalOpen(true)}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onUpdateConfig={handleUpdateAnonymousConfig}
              onSaveBot={handleSaveAnonymousBot}
              onDeleteBot={handleDeleteAnonymousBot}
              onStartAutomator={handleStartAnonymousAutomator}
              onStopAutomator={handleStopAnonymousAutomator}
              onNextStranger={handleNextAnonymousStranger}
              onSendManualMessage={handleSendAnonymousManualMessage}
              onClearHistory={handleClearAnonymousHistory}
            />
          </div>
        )}

        {/* ================================================================= */}
        {/* MODULE 2: GROUP BROADCASTS & ANTI-BOT ENGINE (ارسال به گروه‌ها) */}
        {/* ================================================================= */}
        {activeMainTab === 'group_broadcast' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Top Dedicated Broadcast Hub Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Left: Module Summary */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0">
                    <Megaphone className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-bold text-base text-white flex items-center gap-2">
                      کنترل پنل ارسال تبلیغات به گروه‌های تلگرام
                      {appState.scheduler.isAutoRunActive && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                          ارسال خودکار روشن است
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      ارسال هوشمند پست‌ها و بنرها با رعایت فاصله زمانی، جلوگیری از بلاک و تقسیم کار بین اکانت‌ها
                    </p>
                  </div>
                </div>

                {/* Right: Broadcast Master Action Button Cluster */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  
                  {/* Master Auto-Run Switch */}
                  <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-xs text-slate-300 font-medium px-2 flex items-center gap-1.5">
                      <Power className={`w-3.5 h-3.5 ${appState.scheduler.isAutoRunActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                      زمان‌بندی خودکار:
                    </span>
                    <button
                      onClick={() => handleToggleAutoRun(!appState.scheduler.isAutoRunActive)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        appState.scheduler.isAutoRunActive
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                      }`}
                    >
                      <span>{appState.scheduler.isAutoRunActive ? 'فعال ✓' : 'غیرفعال'}</span>
                    </button>
                  </div>

                  {/* Immediate Start / Stop Broadcast Button */}
                  {isBroadcastingActive ? (
                    <button
                      onClick={handleStopBroadcast}
                      disabled={isStoppingBroadcast}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all active:scale-95 animate-pulse"
                    >
                      <StopCircle className="w-4 h-4" />
                      <span>{isStoppingBroadcast ? 'در حال لغو...' : 'توقف فوری ارسال'}</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleSendNow}
                      disabled={!appState.credentials.isConnected || appState.groups.length === 0}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg active:scale-95 ${
                        appState.credentials.isConnected && appState.groups.length > 0
                          ? 'bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-blue-500 text-white shadow-sky-500/25'
                          : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      }`}
                    >
                      <Send className="w-4 h-4" />
                      <span>شروع ارسال به گروه‌ها</span>
                    </button>
                  )}

                </div>

              </div>

              {/* Status Metric Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-slate-400">گروه‌های فعال برای ارسال</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">
                    {activeGroupsCount.toLocaleString('fa-IR')} از {appState.groups.length.toLocaleString('fa-IR')}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-slate-400">فاصله زمانی هر ارسال</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    هر {appState.scheduler.intervalMinutes} دقیقه
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-slate-400">کل ارسال‌های موفق</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5 font-mono">
                    {appState.scheduler.totalSuccessCount.toLocaleString('fa-IR')}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800/80 text-center">
                  <div className="text-[11px] text-slate-400">سقف ارسال ۲۴ ساعته</div>
                  <div className="text-sm font-bold text-indigo-300 mt-0.5 font-mono">
                    {(appState.scheduler.dailySentCount || 0).toLocaleString('fa-IR')} / {appState.scheduler.dailyLimit.toLocaleString('fa-IR')}
                  </div>
                </div>
              </div>

            </div>

            {/* Live Parallel Multi-Account Broadcast Worker Monitor */}
            {isBroadcastingActive && (
              <div className="bg-gradient-to-br from-indigo-950/80 via-slate-900 to-sky-950/80 border border-indigo-500/40 rounded-2xl p-5 shadow-2xl space-y-4 animate-in fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/20 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                    <h3 className="font-bold text-base text-white flex items-center gap-2">
                      مانیتورینگ زنده کانال‌های ارسال همزمان (Live Parallel Workers)
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        در حال اجرا
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-300 flex items-center gap-3">
                      <span>
                        پیشرفت کل:{' '}
                        <strong className="text-emerald-400 font-mono">
                          {appState.activeBroadcastProgress?.completedGroups || 0} از {appState.activeBroadcastProgress?.totalGroups || appState.groups.length} گروه
                        </strong>
                      </span>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold font-mono">
                        {appState.activeBroadcastProgress?.successCount || 0} موفق
                      </span>
                      {Boolean(appState.activeBroadcastProgress?.failedCount) && (
                        <>
                          <span>•</span>
                          <span className="text-rose-400 font-bold font-mono">
                            {appState.activeBroadcastProgress?.failedCount} خطا/توزیع مجدد
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      onClick={handleStopBroadcast}
                      disabled={isStoppingBroadcast}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all flex items-center gap-1.5 active:scale-95 animate-pulse"
                    >
                      <span>{isStoppingBroadcast ? 'در حال توقف...' : 'توقف فوری'}</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((appState.activeBroadcastProgress?.completedGroups || 0) /
                            Math.max(1, appState.activeBroadcastProgress?.totalGroups || appState.groups.length)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>

                {/* Individual Worker Cards */}
                {appState.activeBroadcastProgress?.workers && appState.activeBroadcastProgress.workers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {appState.activeBroadcastProgress.workers.map((worker, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 space-y-2 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-xs text-white truncate flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                            <span>{worker.accountName || `اکانت ${idx + 1}`}</span>
                          </div>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${
                              worker.status === 'sending'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 animate-pulse'
                                : worker.status === 'antibot_verifying'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : worker.status === 'flood_waited'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : worker.status === 'cooldown'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {worker.status === 'sending'
                              ? 'در حال ارسال'
                              : worker.status === 'antibot_verifying'
                              ? 'ارزیابی آنتی‌بات'
                              : worker.status === 'flood_waited'
                              ? 'محدودیت FloodWait'
                              : worker.status === 'cooldown'
                              ? 'استراحت هوشمند'
                              : worker.status === 'finished'
                              ? 'تکمیل شده'
                              : 'آماده‌سازی'}
                          </span>
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono dir-ltr">{worker.accountPhone}</div>

                        <div className="text-[11px] text-slate-300 bg-slate-900/80 p-1.5 rounded border border-slate-800/80 truncate">
                          {worker.lastAction || 'در حال پردازش صف...'}
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span className="text-emerald-400 font-bold font-mono">{worker.sentSuccessCount} ارسال موفق</span>
                          {worker.failedCount > 0 && (
                            <span className="text-rose-400 font-mono">{worker.failedCount} خطا</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Main 2-Column Dashboard Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left/Primary Column (7 cols): Campaign Post & Anti-Bot Engine */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Product Campaign Editor & Live Telegram Preview */}
                <CampaignCard
                  campaigns={appState.campaigns}
                  onSaveCampaign={handleSaveCampaign}
                  onDeleteCampaign={handleDeleteCampaign}
                  onToggleCampaign={handleToggleCampaign}
                />

                {/* Smart Anti-Bot & Lock Bypass Engine */}
                <AntiBotSettingsCard
                  settings={appState.scheduler.antiBot}
                  onSaveAntiBotSettings={handleSaveAntiBotSettings}
                />

              </div>

              {/* Right Column (5 cols): Target Groups & Scheduler */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Target Groups Manager */}
                <TargetGroupsCard
                  groups={appState.groups}
                  onAddGroup={handleAddGroup}
                  onAddBulkGroups={handleAddBulkGroups}
                  onToggleGroup={handleToggleGroup}
                  onToggleAllGroups={handleToggleAllGroups}
                  onDeleteGroup={handleDeleteGroup}
                  onDeletePostedGroups={handleDeletePostedGroups}
                  onDeleteBulkGroupsByIds={handleDeleteBulkGroupsByIds}
                  onTestSendTarget={handleTestSendTarget}
                  onSyncGroups={handleSyncGroups}
                />

                {/* Scheduler & Anti-Spam Safeguards */}
                <SchedulerCard
                  scheduler={appState.scheduler}
                  onUpdateScheduler={handleUpdateScheduler}
                  onSendNow={handleSendNow}
                  onStopBroadcast={handleStopBroadcast}
                  isSendingNow={isBroadcastingActive}
                />

              </div>

            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODULE 3: MULTI-ACCOUNT MANAGEMENT (مدیریت اکانت‌ها) */}
        {/* ================================================================= */}
        {activeMainTab === 'accounts' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <AccountManagerCard
              accounts={appState.accounts || []}
              activeAccountId={appState.activeAccountId}
              onSelectActiveAccount={handleSelectActiveAccount}
              onToggleAccountActive={handleToggleAccountActive}
              onDeleteAccount={handleDeleteAccount}
              onReauthAccount={(acc) => {
                setIsAuthModalOpen(true);
              }}
              onOpenAddAccountModal={() => setIsAddAccountModalOpen(true)}
            />
          </div>
        )}

        {/* ================================================================= */}
        {/* MODULE 4: MONITORING, REPORTS & LIVE LOGS (کنسول و گزارشات) */}
        {/* ================================================================= */}
        {activeMainTab === 'logs' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Real-Time Group Barrier Monitoring & Process Console */}
            <MonitoringConsoleCard
              reports={appState.monitoringReports || []}
              onRefresh={fetchState}
              onClear={handleClearMonitoringReports}
              onMarkReviewed={handleMarkReviewed}
              onRecheckAndSend={handleRecheckAndSend}
            />

            {/* Comprehensive Broadcast Execution Report */}
            <BroadcastReportCard
              lastReport={appState.lastBroadcastReport}
              history={appState.broadcastHistory || []}
            />

            {/* Live Terminal / Log Feed */}
            <LogsConsole
              logs={appState.logs}
              onClearLogs={handleClearLogs}
              onRefresh={fetchState}
            />

          </div>
        )}

      </main>

      {/* Telegram Auth & API Keys Modal */}
      <TelegramAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        credentials={appState.credentials}
        accounts={appState.accounts || []}
        activeAccountId={appState.activeAccountId}
        onSelectActiveAccount={handleSelectActiveAccount}
        onDeleteAccount={handleDeleteAccount}
        onSaveCredentials={handleSaveCredentials}
        onSendCode={handleSendCode}
        onVerifyCode={handleVerifyCode}
        onLogout={handleLogout}
      />

      {/* Add New Telegram Account Modal */}
      <AddAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => setIsAddAccountModalOpen(false)}
        defaultApiId={appState.credentials.apiId}
        defaultApiHash={appState.credentials.apiHash}
        onAccountAdded={fetchState}
      />

    </div>
  );
}
