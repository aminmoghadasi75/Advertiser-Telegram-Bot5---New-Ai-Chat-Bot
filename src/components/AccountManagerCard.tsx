import React, { useState } from 'react';
import { Users, UserPlus, ShieldCheck, AlertTriangle, RefreshCw, Trash2, Power, CheckCircle, Clock, Zap, Phone, Sparkles, Layers, ShieldAlert, Cpu } from 'lucide-react';
import { TelegramAccount } from '../types';

interface AccountManagerCardProps {
  accounts: TelegramAccount[];
  activeAccountId?: string;
  onSelectActiveAccount: (id: string) => Promise<void>;
  onToggleAccountActive: (id: string, isActive: boolean) => Promise<void>;
  onDeleteAccount: (id: string) => Promise<void>;
  onReauthAccount?: (acc: TelegramAccount) => void;
  onOpenAddAccountModal: () => void;
}

export const AccountManagerCard: React.FC<AccountManagerCardProps> = ({
  accounts = [],
  activeAccountId,
  onSelectActiveAccount,
  onToggleAccountActive,
  onDeleteAccount,
  onReauthAccount,
  onOpenAddAccountModal,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const activeAccountsCount = accounts.filter(a => a.isActive && a.status !== 'disabled' && (!a.floodWaitUntil || a.floodWaitUntil < Date.now())).length;

  const handleSelectActive = async (id: string) => {
    setLoadingId(id);
    try {
      await onSelectActiveAccount(id);
    } finally {
      setLoadingId(null);
    }
  };

  const handleToggle = async (id: string, current: boolean) => {
    setLoadingId(id);
    try {
      await onToggleAccountActive(id, !current);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('آیا از حذف این اکانت از سیستم اطمینان دارید؟')) {
      setLoadingId(id);
      try {
        await onDeleteAccount(id);
      } finally {
        setLoadingId(null);
      }
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl space-y-4">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-white flex items-center gap-2">
              مدیریت اکانت‌ها و ارسال همزمان موازی (Multi-Account Parallel Engine)
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full font-medium">
                {accounts.length.toLocaleString('fa-IR')} اکانت متصل ({activeAccountsCount.toLocaleString('fa-IR')} فعال همزمان)
              </span>
            </h2>
            <p className="text-xs text-slate-400">تقسیم هوشمند کارها بین تمام اکانت‌ها، ارسال همزمان بدون تداخل و توزیع مجدد در صورت محدودیت</p>
          </div>
        </div>

        <button
          onClick={onOpenAddAccountModal}
          className="flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          <span>افزودن اکانت جدید</span>
        </button>
      </div>

      {/* Parallel Multi-Worker Capability Banner */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-sky-950/60 border border-indigo-500/30 rounded-xl p-3.5 text-xs text-indigo-100 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-white">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>موتور ارسال موازی و تقسیم خودکار کار (Parallel Dispatch & Auto Failover):</span>
          </div>
          {activeAccountsCount > 1 && (
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              ⚡ شتاب {activeAccountsCount} برابری فعال است
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-[11px]">
          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex items-start gap-2">
            <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 block">ارسال همزمان و مستقل:</strong>
              <span className="text-slate-400">تمام اکانت‌های فعال به صورت موازی گروه‌های مختلف را بدون تداخل پردازش می‌کنند.</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 block">عدم تکرار پیام در یک گروه:</strong>
              <span className="text-slate-400">قفل اتمیک گروه‌ها مانع از ارسال پیام مشابه توسط دو اکانت در یک گروه می‌شود.</span>
            </div>
          </div>

          <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 flex items-start gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-200 block">توزیع مجدد خودکار (Failover):</strong>
              <span className="text-slate-400">اگر اکانتی به محدودیت بخورد، گروه‌هایش سریعاً بین سایر اکانت‌های سالم تقسیم می‌شود.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts List */}
      {accounts.length === 0 ? (
        <div className="text-center py-8 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs space-y-2">
          <Users className="w-8 h-8 text-slate-600 mx-auto" />
          <p>هنوز اکانتی اضافه نشده است.</p>
          <button
            onClick={onOpenAddAccountModal}
            className="text-indigo-400 hover:text-indigo-300 underline font-bold"
          >
            کلیک کنید تا اولين اکانت متصل شود
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((acc) => {
            const isPrimary = acc.id === activeAccountId;
            const isFloodWait = acc.status === 'flood_wait' || (acc.floodWaitUntil && acc.floodWaitUntil > Date.now());
            const fullName = [acc.userProfile?.firstName, acc.userProfile?.lastName].filter(Boolean).join(' ') || 'کاربر تلگرام';

            return (
              <div
                key={acc.id}
                className={`bg-slate-950 rounded-xl p-3.5 border transition-all space-y-3 relative ${
                  isPrimary
                    ? 'border-indigo-500 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/50'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Primary Badge */}
                {isPrimary && (
                  <span className="absolute -top-2.5 left-3 bg-indigo-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                    اصلی / پیش‌فرض
                  </span>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-800 to-indigo-900 border border-slate-700 flex items-center justify-center font-bold text-white text-sm">
                      {fullName.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-white flex items-center gap-1.5">
                        <span>{fullName}</span>
                        {acc.userProfile?.username && (
                          <span className="text-[11px] text-indigo-400 font-normal dir-ltr">
                            (@{acc.userProfile.username})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono dir-ltr">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>{acc.phoneNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div>
                    {isFloodWait ? (
                      <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>محدودیت موقت تلگرام</span>
                      </span>
                    ) : acc.isActive ? (
                      <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>فعال در ارسال موازی</span>
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-medium">
                        غیرفعال
                      </span>
                    )}
                  </div>
                </div>

                {/* Account Stats Bar */}
                <div className="bg-slate-900/80 rounded-lg p-2 flex items-center justify-between text-[11px] text-slate-300 border border-slate-800/80">
                  <span className="text-slate-400">عملکرد ارسال امروز:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    {(acc.dailySentCount || 0).toLocaleString('fa-IR')} پیام موفق
                  </span>
                </div>

                {/* Account Controls */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isPrimary && (
                      <button
                        onClick={() => handleSelectActive(acc.id)}
                        disabled={loadingId === acc.id}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-all"
                      >
                        اصلی
                      </button>
                    )}

                    <button
                      onClick={() => handleToggle(acc.id, acc.isActive)}
                      disabled={loadingId === acc.id}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                        acc.isActive
                          ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {acc.isActive ? 'شرکت در ارسال: بله' : 'شرکت در ارسال: خیر'}
                    </button>

                    {onReauthAccount && (
                      <button
                        onClick={() => onReauthAccount(acc)}
                        className="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 text-[11px] font-semibold transition-all flex items-center gap-1"
                        title="تمدید نشست و درخواست کد ۵ رقمی جدید تلگرام"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>تمدید نشست</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(acc.id)}
                    disabled={loadingId === acc.id}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="حذف این اکانت"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
};

