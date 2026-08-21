import React from 'react';
import { AnonymousChatAutomatorConfig, AnonymousChatSession } from '../../types';
import {
  TrendingUp,
  Users,
  ShieldCheck,
  Sparkles,
  ShoppingBag,
  HelpCircle,
  Clock,
  ArrowUpRight,
  MessageSquare,
  Bot,
  Percent,
} from 'lucide-react';

interface AnonymousAnalyticsTabProps {
  config?: AnonymousChatAutomatorConfig;
  history?: AnonymousChatSession[];
}

export const AnonymousAnalyticsTab: React.FC<AnonymousAnalyticsTabProps> = ({
  config,
  history = [],
}) => {
  const stats = config?.stats || {
    totalChatsInitiated: 0,
    totalRepliesFromStrangers: 0,
    totalPitchSent: 0,
    totalInquiries: 0,
    totalSpamBotsSkipped: 0,
    recentInquiries: [],
  };

  const totalChats = Math.max(stats.totalChatsInitiated || 0, history.length);
  const totalReplies = stats.totalRepliesFromStrangers || 0;
  const totalPitches = stats.totalPitchSent || 0;
  const totalInquiries = stats.totalInquiries || 0;
  const totalSpamSkipped = stats.totalSpamBotsSkipped || 0;

  // Conversion rate = Inquiries / Pitches
  const conversionRate =
    totalPitches > 0 ? ((totalInquiries / totalPitches) * 100).toFixed(1) : '0.0';

  // Engagement rate = Replies / Chats
  const avgRepliesPerChat =
    totalChats > 0 ? (totalReplies / totalChats).toFixed(1) : '0.0';

  const recentInquiries = stats.recentInquiries || [];

  return (
    <div className="space-y-4 p-2 sm:p-4">
      {/* Header & KPI Summary */}
      <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold border border-violet-500/30">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">داشبورد آمار و نرخ تبدیل ربات هوشمند ناشناس</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                تحلیل جامع عملکرد مکالمات، معرفی محصول، سوالات دریافتی از مشتریان بالقوه و پالایش اسپم
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>گزارش‌گیری زنده و لحظه‌ای</span>
          </span>
        </div>

        {/* 4 Major KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {/* KPI 1: Total Chats */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>کل اتصالات به ناشناس</span>
              <Users className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-xl font-black text-white font-mono">{totalChats}</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>میانگین {avgRepliesPerChat} پیام در هر گفتگو</span>
            </div>
          </div>

          {/* KPI 2: Pitches Sent */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span>معرفی محصول و بنر</span>
              <ShoppingBag className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div className="text-xl font-black text-fuchsia-300 font-mono">{totalPitches}</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <span>ارسال هوشمند قبل از خروج</span>
            </div>
          </div>

          {/* KPI 3: Inquiries / Conversion Leads */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-emerald-500/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 text-xs">
              <span className="font-bold text-emerald-300">مشتریان راغب (Leads)</span>
              <HelpCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-black text-emerald-400 font-mono">{totalInquiries}</div>
            <div className="text-[10px] text-emerald-400/80 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" />
              <span>نرخ تبدیل: {conversionRate}%</span>
            </div>
          </div>

          {/* KPI 4: Spam Skipped */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 space-y-1">
            <div className="flex items-center justify-between text-slate-300 text-xs">
              <span className="font-bold text-amber-300">ربات‌های اسپم رد شده</span>
              <ShieldCheck className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-black text-amber-400 font-mono">{totalSpamSkipped}</div>
            <div className="text-[10px] text-amber-400/80 flex items-center gap-1">
              <span>صرفه‌جویی در زمان و توکن</span>
            </div>
          </div>
        </div>
      </div>

      {/* Conversion Funnel & Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Funnel Box */}
        <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-1">
          <h5 className="text-xs font-bold text-white flex items-center gap-2">
            <Percent className="w-4 h-4 text-violet-400" />
            <span>قیف تبدیل و معرفی محصول (Conversion Funnel)</span>
          </h5>

          <div className="space-y-2.5 pt-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">۱. اتصال به افراد ناشناس:</span>
                <span className="font-bold font-mono text-white">{totalChats}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2">
                <div className="bg-violet-500 h-2 rounded-full w-full" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">۲. گفتگو و مکالمه انسانی:</span>
                <span className="font-bold font-mono text-sky-400">{totalReplies}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2">
                <div
                  className="bg-sky-500 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, totalChats > 0 ? (totalReplies / totalChats) * 50 : 0)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">۳. ارسال بنر و پیام تبلیغاتی:</span>
                <span className="font-bold font-mono text-fuchsia-400">{totalPitches}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2">
                <div
                  className="bg-fuchsia-500 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, totalChats > 0 ? (totalPitches / totalChats) * 100 : 0)}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400 font-bold text-emerald-300">۴. سوالات و لیدها (Inquiries):</span>
                <span className="font-bold font-mono text-emerald-400">{totalInquiries}</span>
              </div>
              <div className="w-full bg-slate-900 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{
                    width: `${Math.min(100, totalPitches > 0 ? (totalInquiries / totalPitches) * 100 : 0)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Inquiries List */}
        <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>آخرین سوالات و ابراز علاقه‌های ثبت‌شده مخاطبان (Leads & Inquiries):</span>
            </h5>
            <span className="text-[10px] text-slate-400">
              {recentInquiries.length} مورد ثبت شده
            </span>
          </div>

          {recentInquiries.length === 0 ? (
            <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 text-center text-xs text-slate-500 space-y-1">
              <HelpCircle className="w-6 h-6 mx-auto text-slate-600 mb-2" />
              <div>هنوز سوال یا ابراز علاقه‌ای از مخاطبان دریافت نشده است.</div>
              <div className="text-[11px] text-slate-600">
                به محض اینکه هم‌صحبت درباره قیمت، تست رایگان، سرعت یا روش خرید سوال بپرسد، متن و زمان آن در اینجا ثبت می‌شود.
              </div>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
              {recentInquiries.map((inquiry, idx) => (
                <div
                  key={inquiry.id || idx}
                  className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 hover:border-emerald-500/40 transition-colors space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-bold text-white">{inquiry.partnerSummary || 'کاربر ناشناس'}</span>
                      {inquiry.productMentioned && (
                        <span className="text-[10px] bg-fuchsia-950/60 text-fuchsia-300 border border-fuchsia-700/40 px-2 py-0.5 rounded-full font-medium">
                          {inquiry.productMentioned}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-slate-500 text-[10px] font-mono">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(inquiry.timestamp).toLocaleTimeString('fa-IR')}</span>
                    </div>
                  </div>
                  <p className="text-xs text-emerald-200 bg-emerald-950/30 p-2 rounded-lg border border-emerald-900/40 font-sans leading-relaxed">
                    «{inquiry.questionSnippet}»
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
