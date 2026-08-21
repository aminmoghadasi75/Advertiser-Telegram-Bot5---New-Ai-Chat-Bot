import React, { useState } from 'react';
import { ShieldCheck, Bot, UserPlus, Link, Check, Sparkles, Sliders, MessageSquare } from 'lucide-react';
import { AntiBotSettings } from '../types';

interface AntiBotSettingsCardProps {
  settings?: AntiBotSettings;
  onSaveAntiBotSettings: (settings: AntiBotSettings) => Promise<void>;
}

export const AntiBotSettingsCard: React.FC<AntiBotSettingsCardProps> = ({
  settings,
  onSaveAntiBotSettings,
}) => {
  const [autoClickCaptcha, setAutoClickCaptcha] = useState(settings?.autoClickCaptcha ?? true);
  const [autoForceJoinChannels, setAutoForceJoinChannels] = useState(settings?.autoForceJoinChannels ?? true);
  const [autoInviteContacts, setAutoInviteContacts] = useState(settings?.autoInviteContacts ?? true);
  const [contactsToInviteCount, setContactsToInviteCount] = useState(settings?.contactsToInviteCount ?? 3);
  const [sendGreetingFirst, setSendGreetingFirst] = useState(settings?.sendGreetingFirst ?? true);
  const [greetingMessage, setGreetingMessage] = useState(settings?.greetingMessage ?? 'سلام بچه ها');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveAntiBotSettings({
        autoClickCaptcha,
        autoForceJoinChannels,
        autoInviteContacts,
        contactsToInviteCount,
        sendGreetingFirst,
        greetingMessage,
      });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-100 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              موتور هوشمند عبور از قفل‌ها و احراز هویت گروه‌ها (Anti-Bot Bypass Engine)
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> هوش مصنوعی
              </span>
            </h3>
            <p className="text-xs text-slate-400">حل خودکار کاپچاها، عضویت در کانال‌های اجباری و افزودن مخاطبین جهت آزاد کردن ارسال پیام</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Toggle 0: Send Initial Test Greeting (e.g. "سلام بچه ها") */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs text-white block">
                  ارسال پیام احوالپرسی اولیه جهت تحریک و تست واکنش ربات نگهبان
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  ارسال یک پیام ساده انسانی (مانند «سلام بچه ها») و شکیبایی جهت دریافت واکنش یا کاپچای ربات ناظر قبل از ارسال تبلیغ اصلی.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={sendGreetingFirst}
              onChange={(e) => setSendGreetingFirst(e.target.checked)}
              className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-purple-500 accent-purple-500 cursor-pointer flex-shrink-0"
            />
          </div>

          {sendGreetingFirst && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3 pr-9">
              <label className="text-xs text-slate-300 font-medium">
                متن پیام تست اولیه:
              </label>
              <input
                type="text"
                value={greetingMessage}
                onChange={(e) => setGreetingMessage(e.target.value)}
                placeholder="سلام بچه ها"
                className="w-48 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-right text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          )}
        </div>

        {/* Toggle 1: Auto Click Inline Buttons / Captcha */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 mt-0.5">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                کلیک خودکار روی دکمه‌های شیشه‌ای «من ربات نیستم» / تایید کاپچا
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                ربات پس از ورود به گروه، دکمه‌های شیشه‌ای ربات‌های نگهبان (RoseBot, GroupHelp, Shield...) را شناسایی و به صورت خودکار تایید می‌کند.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoClickCaptcha}
            onChange={(e) => setAutoClickCaptcha(e.target.checked)}
            className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-purple-500 accent-purple-500 cursor-pointer flex-shrink-0"
          />
        </div>

        {/* Toggle 2: Auto Force Join Channels */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mt-0.5">
              <Link className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs text-white block">
                عضویت هوشمند در کانال‌های اجباری قفل گروه
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                اگر گروه ارسال پیام را مشروط به عضویت در یک کانال کرده باشد، ربات خودکار در آن کانال عضو شده و دکمه بررسی را فشار می‌دهد.
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoForceJoinChannels}
            onChange={(e) => setAutoForceJoinChannels(e.target.checked)}
            className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-purple-500 accent-purple-500 cursor-pointer flex-shrink-0"
          />
        </div>

        {/* Toggle 3: Auto Invite Contacts */}
        <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-0.5">
                <UserPlus className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs text-white block">
                  افزودن هوشمند مخاطبین تلگرام جهت آزاد شدن قفل ارسال (Force Add Members)
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  چنانچه ربات گروه درخواست اضافه کردن ۵ یا ۱۰ نفر کند، سیستم به صورت رندوم مخاطبین اکانت شما را به گروه اضافه می‌نماید.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoInviteContacts}
              onChange={(e) => setAutoInviteContacts(e.target.checked)}
              className="w-5 h-5 rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-purple-500 accent-purple-500 cursor-pointer flex-shrink-0"
            />
          </div>

          {autoInviteContacts && (
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3 pr-9">
              <label className="text-xs text-slate-300 font-medium">
                تعداد مخاطبین جهت اد کردن در هر گروه:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={contactsToInviteCount}
                  onChange={(e) => setContactsToInviteCount(parseInt(e.target.value) || 3)}
                  className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <span className="text-xs text-slate-400">نفر</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1">
          {savedSuccess ? (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <Check className="w-4 h-4" /> تنظیمات هوشمند عبور از قفل‌ها ذخیره شد.
            </span>
          ) : (
            <span className="text-[11px] text-slate-500">
              ⚡ تمامی فرآیندها کاملاً ناتیو و شبیه‌سازی‌شده مانند رفتار کاربر واقعی انجام می‌شوند.
            </span>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <Sliders className="w-4 h-4" />
            <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات هوشمند'}</span>
          </button>
        </div>

      </form>
    </div>
  );
};
