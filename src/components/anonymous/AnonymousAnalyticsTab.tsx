import React, { useMemo, useState } from 'react';
import { AnonymousChatAutomatorConfig, AnonymousChatSession, ConversationState, Intent, PromotionLevel } from '../../types';
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
  Layers,
  Award,
  AlertCircle,
  Zap,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import {
  AnalyticsTracker,
  AnalyticsEventName,
  AnalyticsObjectionCategory,
  FunnelStage,
  Step7AnalyticsReport,
  recordStepAnalytics,
} from '../../analytics';

interface AnonymousAnalyticsTabProps {
  config?: AnonymousChatAutomatorConfig;
  history?: AnonymousChatSession[];
}

export const AnonymousAnalyticsTab: React.FC<AnonymousAnalyticsTabProps> = ({
  config,
  history = [],
}) => {
  const [activeAnalyticsSubTab, setActiveAnalyticsSubTab] = useState<'funnel' | 'leads' | 'objections' | 'promotions'>('funnel');

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

  // Step 7 Analytics Report generation from history
  const analyticsReport: Step7AnalyticsReport = useMemo(() => {
    const tracker = new AnalyticsTracker();

    if (history.length === 0) {
      // Return default synthetic seed report if history is empty
      return tracker.generateReport();
    }

    for (const session of history) {
      const sessId = session.id;
      const startTime = session.startedAt || new Date().toISOString();

      tracker.trackEvent({
        eventName: AnalyticsEventName.SESSION_STARTED,
        timestamp: startTime,
        sessionId: sessId,
        previousState: ConversationState.CONNECTING,
        currentState: session.conversationState || ConversationState.INITIAL_GREETING,
        detectedIntent: session.lastIntent || Intent.GREETING,
        leadScore: session.leadScore || 0,
        metadata: {
          turnCount: 1,
          botUsername: session.botUsername,
        },
      });

      if (session.transcript && session.transcript.length > 0) {
        let currentTurn = 1;
        for (const msg of session.transcript) {
          if (msg.sender === 'stranger') {
            tracker.trackEvent({
              eventName: AnalyticsEventName.MESSAGE_RECEIVED,
              timestamp: msg.timestamp || startTime,
              sessionId: sessId,
              previousState: session.previousState || ConversationState.INITIAL_GREETING,
              currentState: session.conversationState || ConversationState.ENGAGED,
              detectedIntent: session.lastIntent || Intent.QUESTION,
              leadScore: session.leadScore || 10,
              metadata: {
                turnCount: currentTurn,
                userMessage: msg.text,
              },
            });
            currentTurn++;
          }
        }
      }

      if (session.promoSent || session.lastPromotionTurn) {
        tracker.trackEvent({
          eventName: AnalyticsEventName.CTA_SHOWN,
          timestamp: session.endedAt || startTime,
          sessionId: sessId,
          previousState: session.previousState || ConversationState.ENGAGED,
          currentState: session.conversationState || ConversationState.PRODUCT_INTEREST,
          detectedIntent: session.lastIntent || Intent.PRODUCT_CURIOUS,
          leadScore: session.leadScore || 45,
          metadata: {
            promotionLevel: session.promotionLevel || PromotionLevel.DIRECT_OFFER,
            turnCount: session.lastPromotionTurn || 2,
            ctaShown: true,
          },
        });
      }

      if (session.inquiryDetected || session.conversationState === ConversationState.SUPPORT_HANDOFF) {
        tracker.trackEvent({
          eventName: AnalyticsEventName.CTA_ACCEPTED,
          timestamp: session.endedAt || startTime,
          sessionId: sessId,
          previousState: session.conversationState || ConversationState.PRODUCT_INTEREST,
          currentState: ConversationState.SUPPORT_HANDOFF,
          detectedIntent: Intent.PURCHASE_INTENT,
          leadScore: Math.max(session.leadScore || 0, 75),
          metadata: {
            ctaAccepted: true,
            inquirySnippet: session.inquirySnippet,
          },
        });

        tracker.trackConversion(
          sessId,
          ConversationState.SUPPORT_HANDOFF,
          Intent.PURCHASE_INTENT,
          Math.max(session.leadScore || 0, 80),
          { inquirySnippet: session.inquirySnippet }
        );
      }

      if (session.objectionsCount && session.objectionsCount > 0) {
        tracker.trackEvent({
          eventName: AnalyticsEventName.OBJECTION_DETECTED,
          timestamp: startTime,
          sessionId: sessId,
          previousState: ConversationState.PRODUCT_INTEREST,
          currentState: ConversationState.OBJECTION_HANDLING,
          detectedIntent: Intent.OBJECTION,
          leadScore: session.leadScore || 30,
          metadata: {
            objectionCategory: session.conversationContext?.lastObjectionCategory || AnalyticsObjectionCategory.PRICE,
          },
        });
      }

      if (session.rejectionsCount && session.rejectionsCount > 0) {
        tracker.trackEvent({
          eventName: AnalyticsEventName.REJECTION_DETECTED,
          timestamp: startTime,
          sessionId: sessId,
          previousState: ConversationState.PRODUCT_INTEREST,
          currentState: ConversationState.REJECTED,
          detectedIntent: Intent.REJECTION,
          leadScore: 0,
          metadata: { isPromotionLocked: true },
        });
      }
    }

    return tracker.generateReport();
  }, [history]);

  const recentInquiries = stats.recentInquiries || [];
  const funnel = analyticsReport.funnelMetrics.funnelReport;
  const leadInsights = analyticsReport.leadMetrics.insights;
  const objectionReport = analyticsReport.objectionMetrics.objectionReport;
  const promoReport = analyticsReport.promotionMetrics.promotionReport;

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
              <h4 className="font-bold text-sm text-white">داشبورد آنالیتیکس و هوش فروش (Step 7 Intelligence)</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ردیابی قیف ۸ مرحله‌ای تبدیل، امتیازدهی لید، تحلیل اعتراضات و نرخ اثربخشی CTA
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

      {/* Sub-Tabs for Step 7 Analytics Modules */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveAnalyticsSubTab('funnel')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeAnalyticsSubTab === 'funnel'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Percent className="w-3.5 h-3.5" />
          <span>قیف تبدیل ۸ مرحله‌ای</span>
        </button>
        <button
          onClick={() => setActiveAnalyticsSubTab('leads')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeAnalyticsSubTab === 'leads'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>هوش و امتیازدهی لید (Lead Intelligence)</span>
        </button>
        <button
          onClick={() => setActiveAnalyticsSubTab('objections')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeAnalyticsSubTab === 'objections'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>تحلیل اعتراضات (Objections)</span>
        </button>
        <button
          onClick={() => setActiveAnalyticsSubTab('promotions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeAnalyticsSubTab === 'promotions'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-900 text-slate-400 hover:text-white'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>اثربخشی آفر و CTA</span>
        </button>
      </div>

      {/* SUBTAB 1: 8-STAGE FUNNEL */}
      {activeAnalyticsSubTab === 'funnel' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-violet-400" />
                <span>مراحل ۸ گانه قیف تبدیل مخاطب ناشناس (8-Stage Conversion Funnel)</span>
              </h5>
              <span className="text-[11px] text-emerald-400 font-mono font-bold">
                نرخ تبدیل کلی: {funnel.overallConversionRate}%
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {funnel.stages.map((stage) => {
                const percentageOfTotal =
                  funnel.totalSessions > 0
                    ? ((stage.count / funnel.totalSessions) * 100).toFixed(1)
                    : '0';

                return (
                  <div key={stage.stageNumber} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-[10px] flex items-center justify-center font-bold font-mono">
                          {stage.stageNumber}
                        </span>
                        <span className="font-medium">{stage.stageName}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span className="text-white font-bold">{stage.count} مورد</span>
                        <span className="text-slate-400">({percentageOfTotal}%)</span>
                        <span className="text-emerald-400">تبدیل: {stage.conversionRateFromPrevious}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-violet-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Number(percentageOfTotal))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-1">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <span>خلاصه بازدهی قیف</span>
            </h5>
            <div className="space-y-2 text-xs text-slate-300 pt-2">
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">نقطه بیشترین ریزش (Drop-off):</div>
                <div className="font-bold text-amber-300 font-mono text-xs">{funnel.biggestDropOffStage}</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">میانگین نوبت تا تبدیل:</div>
                <div className="font-bold text-emerald-300 font-mono text-xs">{funnel.avgTurnsToConversion} نوبت گفتگو</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">میانگین زمان مکالمه تا تبدیل:</div>
                <div className="font-bold text-sky-300 font-mono text-xs">{funnel.avgTimeToConversionSeconds} ثانیه</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: LEAD INTELLIGENCE */}
      {activeAnalyticsSubTab === 'leads' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-1">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-violet-400" />
              <span>توزیع امتیاز لیدها (Lead Score)</span>
            </h5>
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-rose-300 font-bold">لیدهای داغ (Hot Leads: 56-100)</span>
                  <span className="font-mono font-bold text-white">{leadInsights.distribution.hot}</span>
                </div>
                <p className="text-[10px] text-rose-400/80">آماده خرید، استعلام قیمت یا تست رایگان</p>
              </div>

              <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-300 font-bold">لیدهای گرم (Warm Leads: 26-55)</span>
                  <span className="font-mono font-bold text-white">{leadInsights.distribution.warm}</span>
                </div>
                <p className="text-[10px] text-amber-400/80">علاقه‌مند به محصول یا دارای نیاز به فیلترشکن</p>
              </div>

              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">لیدهای سرد (Cold Leads: 0-25)</span>
                  <span className="font-mono font-bold text-white">{leadInsights.distribution.cold}</span>
                </div>
                <p className="text-[10px] text-slate-500">گفتگوی عمومی، چت کوتاه یا نامرتبط</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>قصد‌های با بالاترین نرخ تبدیل (Top Converting Intents)</span>
            </h5>
            <div className="space-y-2 pt-2">
              {leadInsights.highestConvertingIntents.length === 0 ? (
                <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                  هنوز اطلاعات قصد و تبدیل کافی ثبت نشده است.
                </div>
              ) : (
                leadInsights.highestConvertingIntents.slice(0, 5).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="font-mono font-bold text-white">{item.intent}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-slate-400">{item.conversions} تبدیل از {item.total} مورد</span>
                      <span className="text-emerald-400 font-bold">نرخ تبدیل: {item.conversionRate}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: OBJECTION INTELLIGENCE */}
      {activeAnalyticsSubTab === 'objections' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-1">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>شاخص‌های بازیابی اعتراضات</span>
            </h5>
            <div className="space-y-2.5 pt-2 text-xs">
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">تعداد کل اعتراضات:</div>
                <div className="font-bold text-white font-mono text-sm">{objectionReport.totalObjections}</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">نرخ بازیابی موفق (Recovery Rate):</div>
                <div className="font-bold text-emerald-300 font-mono text-sm">{objectionReport.recoverySuccessRate}%</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">تبدیل به خرید پس از اعتراض:</div>
                <div className="font-bold text-sky-300 font-mono text-sm">{objectionReport.objectionToPurchaseConversionRate}%</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-400" />
              <span>تفکیک دسته‌بندی اعتراضات مخاطبان (Objection Taxonomy)</span>
            </h5>
            <div className="space-y-2 pt-2">
              {objectionReport.categoryBreakdown.map((cat) => (
                <div
                  key={cat.category}
                  className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-violet-300 font-bold">
                      {cat.category}
                    </span>
                    <span className="text-slate-300 font-bold">{cat.count} مورد</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-emerald-400">بازیابی: {cat.recoveryRate}%</span>
                    <span className="text-sky-400">خرید: {cat.conversionRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 4: PROMOTION & CTA PERFORMANCE */}
      {activeAnalyticsSubTab === 'promotions' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-1">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-fuchsia-400" />
              <span>اثربخشی CTA و گاردریل‌ها</span>
            </h5>
            <div className="space-y-2.5 pt-2 text-xs">
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">کل CTA های ارائه شده:</div>
                <div className="font-bold text-white font-mono text-sm">{promoReport.ctaEffectiveness.shownCount}</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">نرخ پذیرش CTA:</div>
                <div className="font-bold text-emerald-300 font-mono text-sm">{promoReport.ctaEffectiveness.acceptanceRate}%</div>
              </div>
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="text-[11px] text-slate-400">رعایت گاردریل‌های ایمنی:</div>
                <div className="font-bold text-emerald-400 font-mono text-sm">{promoReport.guardrailSafetyComplianceRate}%</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 md:col-span-2">
            <h5 className="text-xs font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>انواع CTA بر اساس بهترین بازدهی</span>
            </h5>
            <div className="space-y-2 pt-2">
              {promoReport.bestPerformingCTATypes.length === 0 ? (
                <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
                  هنوز اطلاعات کافی از ارائه CTA ثبت نشده است.
                </div>
              ) : (
                promoReport.bestPerformingCTATypes.map((cta, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                      <span className="font-mono font-bold text-white">{cta.ctaType}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[11px]">
                      <span className="text-slate-400">{cta.acceptedCount} پذیرش از {cta.shownCount} بار نمایش</span>
                      <span className="text-emerald-400 font-bold">نرخ تبدیل: {cta.conversionRate}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Recent Inquiries List */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
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
  );
};

