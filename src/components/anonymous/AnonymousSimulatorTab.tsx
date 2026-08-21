import React, { useState } from 'react';
import {
  AnonymousChatInstructions,
  ConversationState,
  Intent,
  PromotionLevel,
  ConversationContext,
} from '../../types';
import {
  MessageCircle,
  Sparkles,
  Send,
  RotateCcw,
  User,
  Zap,
  ShoppingBag,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Play,
  Shield,
  Activity,
  Award,
  Lock,
  Unlock,
  Clock,
  Code2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AnonymousSimulatorTabProps {
  instructions: AnonymousChatInstructions;
}

interface SimulatedMessage {
  sender: 'stranger' | 'ai';
  text: string;
  imageUrl?: string;
  isPromo?: boolean;
  time: string;
  stepOutput?: any;
}

export const AnonymousSimulatorTab: React.FC<AnonymousSimulatorTabProps> = ({
  instructions,
}) => {
  const [messages, setMessages] = useState<SimulatedMessage[]>([
    { sender: 'ai', text: 'سلام چطوری؟ خوبی؟ 🌸', time: 'هم‌اکنون' },
  ]);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(60); // Default to 60s (<2min)
  const [currentCtx, setCurrentCtx] = useState<Partial<ConversationContext>>({
    state: ConversationState.INITIAL_GREETING,
    intent: Intent.GREETING,
    leadScore: 0,
    promotionLevel: PromotionLevel.NO_PROMOTION,
    promotionLock: false,
    turnCount: 1,
  });

  const [testSummary, setTestSummary] = useState<any>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showDirectiveDetails, setShowDirectiveDetails] = useState(false);

  const quickPrompts = [
    'سلام اصل میدی؟',
    'سلام چطوری؟ خوبی؟',
    'اینستاگرامم اصلاً وصل نمیشه، تو فیلترشکن خوب سراغ داری؟',
    'قیمت فیلترشکنت چنده؟ اکانت تست داری؟',
    'نه اصلاً فیلترشکن نمی‌خوام، تبلیغات نکن',
    'چیکارا میکنی الان؟ مشغولی؟',
    'دختری یا پسر؟ کجایی هستی؟',
    'عکس میدی ببینمت؟',
    'آیدی یا کانال تلگرام داری؟',
    'بای من باید برم خوشحال شدم',
  ];

  const handleRunTests = async () => {
    setIsRunningTests(true);
    setShowTestModal(true);
    try {
      const res = await fetch('/api/anonymous/run-conversation-tests');
      const data = await res.json();
      if (data.success) {
        setTestSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to run conversation tests:', err);
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleSend = async (customText?: string) => {
    const userMsg = (customText || input).trim();
    if (!userMsg || isTyping) return;

    const newHistory: SimulatedMessage[] = [
      ...messages,
      { sender: 'stranger', text: userMsg, time: 'هم‌اکنون' },
    ];
    setMessages(newHistory);
    setInput('');
    setIsTyping(true);

    const promo = instructions.productPromotion;

    try {
      const res = await fetch('/api/anonymous/test-ai-simulation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: newHistory.map((m) => ({
            sender: m.sender === 'stranger' ? 'stranger' : 'me_melody',
            text: m.text,
          })),
          instructions,
          sessionContext: {
            elapsedSeconds: elapsedSec,
            isUnder2Minutes: elapsedSec < 120,
            currentTurn: messages.filter((m) => m.sender === 'ai').length,
            maxTurns: instructions.maxMessagesPerChat || 4,
            conversationContext: currentCtx,
          },
        }),
      });

      const data = await res.json();
      const replyText = data.reply || 'مرسی منم خوبم، چیکارا میکنی؟';

      if (data.stepOutput?.updatedContext) {
        setCurrentCtx(data.stepOutput.updatedContext);
      }

      const shouldSendBanner =
        promo?.enabled &&
        (data.shouldSendPromoCard ||
          (data.promoMentioned && promo.sendMode === 'ai_natural_mention' && promo.imageUrl));

      if (shouldSendBanner && promo.imageUrl) {
        let finalPromoText = replyText;
        if (promo.contactHandleOrLink && !finalPromoText.includes(promo.contactHandleOrLink)) {
          finalPromoText += `\n💬 آیدی: ${promo.contactHandleOrLink.replace(/^@/, '')}`;
        }
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: finalPromoText,
            imageUrl: promo.imageUrl,
            isPromo: true,
            time: 'هم‌اکنون (معرفی هوشمند با بنر 🧠🖼)',
            stepOutput: data.stepOutput,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'ai',
            text: replyText,
            isPromo: Boolean(data.promoMentioned),
            time: data.promoMentioned ? 'هم‌اکنون (معرفی در متن 💬)' : 'هم‌اکنون',
            stepOutput: data.stepOutput,
          },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'سلام عزیزم، منم خوبم تو چطوری؟',
          time: 'هم‌اکنون',
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = () => {
    setMessages([
      { sender: 'ai', text: 'سلام چطوری؟ خوبی؟ 🌸', time: 'هم‌اکنون' },
    ]);
    setInput('');
    setCurrentCtx({
      state: ConversationState.INITIAL_GREETING,
      intent: Intent.GREETING,
      leadScore: 0,
      promotionLevel: PromotionLevel.NO_PROMOTION,
      promotionLock: false,
      turnCount: 1,
    });
  };

  return (
    <div className="p-5 space-y-5" dir="rtl">
      {/* Header & Controls */}
      <div className="bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">محیط شبیه‌ساز چت و تست ماشین وضعیت گفتگو</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              آزمایش تعاملی و بی‌درنگ Intent Engine، ماشین وضعیت ۱۵ مرحله‌ای، امتیازدهی لید و خط‌مشی فروش
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={handleRunTests}
            className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-violet-950/50 flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>اجرای آزمون‌های خودکار (Unit & E2E)</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="شروع مجدد شبیه‌ساز"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>شروع مجدد</span>
          </button>
        </div>
      </div>

      {/* Real-time State Machine Context Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200">وضعیت زنده ماشین مکالمه (State Machine Context):</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Time toggle */}
            <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-slate-300">زمان مکالمه:</span>
              <button
                type="button"
                onClick={() => setElapsedSec(elapsedSec < 120 ? 150 : 60)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
                  elapsedSec < 120
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {elapsedSec < 120 ? 'زیر ۲ دقیقه (۶۰s)' : 'بالای ۲ دقیقه (۱۵۰s)'}
              </button>
            </div>

            {/* Promotion Lock */}
            <div
              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl border ${
                currentCtx.promotionLock
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}
            >
              {currentCtx.promotionLock ? (
                <>
                  <Lock className="w-3 h-3" />
                  <span>قفل تبلیغ: فعال (رد صریح)</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  <span>قفل تبلیغ: غیرفعال</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* State Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1">وضعیت جاری (State):</span>
            <span className="font-bold text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/40 text-[11px]">
              {currentCtx.state || 'S1_GREETING'}
            </span>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1">آخرین قصد (Intent):</span>
            <span className="font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40 text-[11px]">
              {currentCtx.intent || 'GREETING'}
            </span>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1">امتیاز لید (Lead Score):</span>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, currentCtx.leadScore || 0))}%` }}
                />
              </div>
              <span className="font-bold text-emerald-400 text-[11px]">
                {currentCtx.leadScore || 0}/100
              </span>
            </div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-1">سطح مجاز تبلیغات:</span>
            <span
              className={`font-bold text-[11px] px-2 py-0.5 rounded border ${
                currentCtx.promotionLevel === PromotionLevel.DIRECT_OFFER
                  ? 'bg-fuchsia-950/60 text-fuchsia-300 border-fuchsia-800/40'
                  : currentCtx.promotionLevel === PromotionLevel.SOFT_MENTION
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {currentCtx.promotionLevel || 'NO_PROMOTION'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Test Prompt Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap pl-1">
          سناریوهای تست سریع:
        </span>
        {quickPrompts.map((prompt, pIdx) => (
          <button
            key={pIdx}
            type="button"
            onClick={() => handleSend(prompt)}
            disabled={isTyping}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-sky-950/60 border border-slate-800 hover:border-sky-500/50 text-slate-300 hover:text-sky-200 transition-all whitespace-nowrap text-[11px]"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Chat Transcript Stage */}
      <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 h-[420px] overflow-y-auto space-y-3 flex flex-col justify-between">
        <div className="space-y-3 overflow-y-auto">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-2.5 ${
                m.sender === 'stranger' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  m.sender === 'stranger'
                    ? 'bg-slate-800 text-slate-300 border border-slate-700'
                    : m.isPromo
                    ? 'bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-500/50'
                    : 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                }`}
              >
                {m.sender === 'stranger' ? <User className="w-3.5 h-3.5" /> : m.isPromo ? '🛍' : '🌸'}
              </div>

              <div
                className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed space-y-2 ${
                  m.sender === 'stranger'
                    ? 'bg-slate-800 text-white rounded-tr-none'
                    : m.isPromo
                    ? 'bg-gradient-to-br from-fuchsia-950/80 via-slate-900 to-violet-950/70 text-slate-100 border border-fuchsia-700/50 rounded-tl-none shadow-lg'
                    : 'bg-gradient-to-br from-violet-950/80 to-slate-900 text-slate-100 border border-violet-800/40 rounded-tl-none'
                }`}
              >
                {/* Promo Image if present */}
                {m.imageUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950/60 p-1">
                    <img
                      src={m.imageUrl}
                      alt="محصول تبلیغاتی"
                      referrerPolicy="no-referrer"
                      className="max-h-48 w-full object-contain rounded-lg"
                    />
                  </div>
                )}

                <div className="font-semibold whitespace-pre-wrap">{m.text}</div>

                {m.sender === 'ai' && (
                  <div className="pt-2 border-t border-white/5 space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="flex items-center gap-1 text-fuchsia-300 font-medium">
                        <Sparkles className="w-3 h-3" />
                        {m.isPromo ? 'ارسال عکس و محصول' : 'پاسخ هوش مصنوعی (Deterministic Pipeline)'}
                      </span>
                      <span>{m.time}</span>
                    </div>

                    {m.stepOutput && (
                      <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-300 bg-black/40 px-2 py-1 rounded-lg">
                        <span>🎯 قصد: {m.stepOutput.intentResult.intent}</span>
                        <span>•</span>
                        <span>🧠 وضعیت: {m.stepOutput.updatedContext.state}</span>
                        <span>•</span>
                        <span>📈 امتیاز: {m.stepOutput.updatedContext.leadScore}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-2 text-xs text-fuchsia-400 p-2">
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-ping" />
              <span>پردازش خط‌مشی مکالمه و تولید پاسخ...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input Box */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="پیام خود را به عنوان مخاطب ناشناس بنویسید..."
          disabled={isTyping}
          className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-3 text-xs text-white placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!input.trim() || isTyping}
          className="px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-sky-950/50 flex-shrink-0"
        >
          <Send className="w-4 h-4 rotate-180" />
          <span>ارسال تست</span>
        </button>
      </div>

      {/* Test Suite Modal */}
      {showTestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-violet-400" />
                <h4 className="font-bold text-sm text-white">
                  نتایج آزمون‌های اعتبارسنجی خودکار موتور مکالمه (Test Suite)
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
              {isRunningTests ? (
                <div className="text-center py-10 space-y-3">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-slate-300">در حال اجرای آزمون‌های واحد و سناریوهای انتها به انتها...</p>
                </div>
              ) : testSummary ? (
                <>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">کل آزمون‌ها</span>
                      <span className="font-bold text-sm text-white">{testSummary.total}</span>
                    </div>
                    <div className="bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-800/40">
                      <span className="text-[11px] text-emerald-400 block">موفق</span>
                      <span className="font-bold text-sm text-emerald-300">{testSummary.passed}</span>
                    </div>
                    <div className="bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/40">
                      <span className="text-[11px] text-rose-400 block">ناموفق</span>
                      <span className="font-bold text-sm text-rose-300">{testSummary.failed}</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">زمان اجرا</span>
                      <span className="font-bold text-sm text-sky-400">{testSummary.durationMs}ms</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-300 text-xs">جزئیات آزمون‌ها:</h5>
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {testSummary.results.map((t: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-xl border flex items-center justify-between ${
                            t.passed
                              ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-200'
                              : 'bg-rose-950/30 border-rose-800/40 text-rose-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {t.passed ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                            )}
                            <span className="font-medium text-[11px]">{t.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400">{t.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
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
