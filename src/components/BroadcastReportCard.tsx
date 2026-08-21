import React, { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  Bot,
  Clock,
  UserCheck,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import { BroadcastReport, BroadcastGroupDetail } from '../types';

interface BroadcastReportCardProps {
  lastReport?: BroadcastReport;
  history?: BroadcastReport[];
}

export const BroadcastReportCard: React.FC<BroadcastReportCardProps> = ({
  lastReport,
  history = [],
}) => {
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<BroadcastReport | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const activeReport = selectedReport || lastReport;

  if (!activeReport) {
    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">گزارش جامع اجرای تبلیغات</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              آمار دقیق پیام‌های موفق، ناموفق، اکانت‌های شرکت‌کننده و گروه‌های با ربات ناظر حل‌شده
            </p>
          </div>
        </div>
        <div className="py-8 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl my-4 bg-slate-950/40">
          <BarChart3 className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-pulse" />
          <p className="text-xs font-medium">هنوز هیچ نوبت ارسالی اجرا نشده است.</p>
          <p className="text-[11px] text-slate-500 mt-1">
            با کلیک روی «ارسال آنی همین حالا» یا فعال‌سازی ارسال خودکار، گزارش تفکیکی هربار اجرا در این بخش ثبت می‌شود.
          </p>
        </div>
      </div>
    );
  }

  const successRate = activeReport.totalAttempted > 0
    ? Math.round((activeReport.successCount / activeReport.totalAttempted) * 100)
    : 0;

  const filteredDetails = (activeReport.details || []).filter(
    (d) =>
      d.groupTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.usernameOrLink.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-slate-900/90 border border-sky-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-md relative overflow-hidden">
      
      {/* Background Subtle Glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base text-white">گزارش جامع آخرین اجرای تبلیغات</h3>
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-bold">
                {activeReport.campaignTitle}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                زمان اجرا: <strong className="text-slate-200">{activeReport.timestamp}</strong>
              </span>
              <span>•</span>
              <span>مدت زمان: <strong className="text-slate-200">{activeReport.durationSeconds} ثانیه</strong></span>
            </div>
          </div>
        </div>

        {history.length > 1 && (
          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all active:scale-95"
          >
            <History className="w-3.5 h-3.5 text-sky-400" />
            <span>تاریخچه اجراها ({history.length})</span>
          </button>
        )}
      </div>

      {/* 4 Main Execution Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        
        {/* 1. Total Attempted */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 relative overflow-hidden">
          <span className="text-xs text-slate-400 block font-medium">گروه‌های اقدام‌شده</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-white font-mono">{activeReport.totalAttempted}</span>
            <span className="text-xs text-slate-400">گروه</span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-1">مجموع درخواست ارسال</span>
        </div>

        {/* 2. Success Count */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 relative overflow-hidden">
          <div className="absolute top-2 left-2 text-emerald-500/20">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <span className="text-xs text-emerald-400 block font-medium">پیام‌های موفق ثبت‌شده</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-emerald-400 font-mono">{activeReport.successCount}</span>
            <span className="text-xs text-emerald-500 font-bold">({successRate}٪)</span>
          </div>
          <span className="text-[10px] text-emerald-400/80 block mt-1">ارسال و تایید کامل</span>
        </div>

        {/* 3. Failed Count */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/30 relative overflow-hidden">
          <div className="absolute top-2 left-2 text-rose-500/20">
            <XCircle className="w-8 h-8" />
          </div>
          <span className="text-xs text-rose-400 block font-medium">پیام‌های ثبت‌نشده (خطا)</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-rose-400 font-mono">{activeReport.failedCount}</span>
            <span className="text-xs text-rose-400">پیام</span>
          </div>
          <span className="text-[10px] text-rose-400/80 block mt-1">نیازمند بازبینی/ربات</span>
        </div>

        {/* 4. Anti-Bot Obstacle Solved Count */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-purple-500/30 relative overflow-hidden">
          <div className="absolute top-2 left-2 text-purple-500/20">
            <Bot className="w-8 h-8" />
          </div>
          <span className="text-xs text-purple-400 block font-medium">عبور و ارسال موفق با ربات</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-purple-300 font-mono">{activeReport.botResolvedCount}</span>
            <span className="text-[11px] text-purple-400 font-medium">از {activeReport.botDetectedCount} بات</span>
          </div>
          <span className="text-[10px] text-purple-300/80 block mt-1">مانع ناظر برطرف شد</span>
        </div>

      </div>

      {/* Participating Accounts & Multi-Account Workload Breakdown */}
      <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5 text-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-slate-300">
              اکانت‌های مشارکت‌کننده: <strong className="text-white font-mono">{activeReport.accountsUsedCount} اکانت</strong>
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              activeReport.dispatchMode === 'parallel_multichannel'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {activeReport.dispatchMode === 'parallel_multichannel' ? '⚡ ارسال همزمان و موازی' : '🔄 چرخش تک‌اکانتی نوبتی'}
            </span>
          </div>

          {/* Success Rate Visual Progress */}
          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
            <span className="text-slate-400 text-[11px]">بازدهی این اجرا:</span>
            <div className="w-28 bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-500"
                style={{ width: `${successRate}%` }}
              />
            </div>
            <span className="font-bold font-mono text-emerald-400">{successRate}٪</span>
          </div>
        </div>

        {/* Account Breakdown Cards if available */}
        {activeReport.accountBreakdown && activeReport.accountBreakdown.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
            {activeReport.accountBreakdown.map((accStat, idx) => (
              <div key={idx} className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-white text-[11px] truncate flex items-center gap-1">
                    <span>{accStat.accountName || 'اکانت تلگرام'}</span>
                    {accStat.hitRateLimit && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 rounded font-normal">محدودیت موقت</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono dir-ltr truncate">{accStat.accountPhone}</div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-bold text-emerald-400 font-mono text-xs">{accStat.sentCount} موفق</span>
                  {accStat.failedCount > 0 && (
                    <span className="text-rose-400 text-[10px] block font-mono">{accStat.failedCount} خطا</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expand/Collapse Detailed Group Table Button */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
        <button
          onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
          className="flex items-center gap-2 text-xs font-bold text-sky-400 hover:text-sky-300 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>{isDetailsExpanded ? 'پنهان‌سازی ریز جزئیات ارسال گروه‌ها' : `مشاهده ریز جزئیات ارسال به تفکیک ${activeReport.details?.length || 0} گروه`}</span>
          {isDetailsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {selectedReport && (
          <button
            onClick={() => setSelectedReport(undefined)}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            بازگشت به آخرین گزارش
          </button>
        )}
      </div>

      {/* Detailed Group Breakdown Section */}
      {isDetailsExpanded && (
        <div className="mt-3 space-y-3 animate-in fade-in duration-200">
          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="جستجو در گروه، نام کاربری یا وضعیت..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Group Details List */}
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filteredDetails.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                هیچ جزئیاتی برای این جستجو یافت نشد.
              </div>
            ) : (
              filteredDetails.map((item, index) => (
                <div
                  key={index}
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 text-xs transition-colors ${
                    item.status === 'success'
                      ? 'bg-slate-950/80 border-emerald-500/20'
                      : item.status === 'skipped'
                      ? 'bg-slate-950/50 border-slate-800'
                      : 'bg-rose-950/10 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.status === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : item.status === 'skipped' ? (
                      <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white truncate">{item.groupTitle}</span>
                        {item.botDetected && (
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                            item.botResolved
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          }`}>
                            🤖 {item.botResolved ? 'ربات ناظر خنثی شد' : 'دارای ربات ناظر'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                        <span className="dir-ltr font-mono text-sky-400">{item.usernameOrLink}</span>
                        {item.accountPhone && (
                          <>
                            <span>•</span>
                            <span>اکانت: <strong className="text-slate-200 dir-ltr font-mono">{item.accountPhone}</strong></span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <span className={`text-[11px] font-medium block ${
                      item.status === 'success' ? 'text-emerald-400' : item.status === 'skipped' ? 'text-slate-400' : 'text-rose-400'
                    }`}>
                      {item.message || (item.status === 'success' ? 'ارسال شد' : 'خطا')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                تاریخچه اجراهای اخیر ارسال تبلیغات
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5">
              {history.map((rpt) => (
                <div
                  key={rpt.id}
                  onClick={() => {
                    setSelectedReport(rpt);
                    setShowHistoryModal(false);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    activeReport.id === rpt.id
                      ? 'bg-sky-500/10 border-sky-500/40'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white">
                    <span>{rpt.campaignTitle}</span>
                    <span className="text-slate-400 text-[11px] font-normal">{rpt.timestamp}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-2 flex-wrap">
                    <span className="text-emerald-400 font-bold">{rpt.successCount} موفق</span>
                    <span>•</span>
                    <span className="text-rose-400">{rpt.failedCount} ناموفق</span>
                    <span>•</span>
                    <span className="text-purple-300">{rpt.botResolvedCount} بات حل‌شده</span>
                    <span>•</span>
                    <span>زمان: {rpt.durationSeconds} ثانیه</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-950 border-t border-slate-800 text-right">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
