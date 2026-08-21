import React, { useState, useEffect, useRef } from 'react';
import { AnonymousChatInstructions, AnonymousProductPromotion } from '../../types';
import {
  Sparkles,
  Bot,
  MessageSquare,
  Clock,
  LogOut,
  ShieldAlert,
  Check,
  RefreshCw,
  Info,
  Sliders,
  Send,
  RotateCcw,
  AlertCircle,
  Tag,
  Image as ImageIcon,
  Link as LinkIcon,
  Upload,
  Layers,
  HelpCircle,
  Zap,
  ShoppingBag,
  Flame,
  FileText,
  Trash2,
} from 'lucide-react';

interface AnonymousAiInstructionsTabProps {
  instructions: AnonymousChatInstructions;
  onSaveInstructions: (instructions: AnonymousChatInstructions) => Promise<void>;
}

const SAMPLE_PROMPTS = [
  {
    title: 'دستورالعمل جامع مبتنی بر ماشین حالت (S1-S15 پیشنهادی 🌸)',
    prompt: `[هویت و شخصیت اصلی (Core Persona)]:
شما یک دختر ۲۰ ساله ایرانی پرانرژی، مهربان و باهوش به نام سارا (ملودی) اهل تهران هستید که در یک ربات چت ناشناس تلگرام با یک فرد جدید در حال گپ زدن هستید.
- لحن: کاملاً خودمانی، صمیمی، دخترانه، تهرانی عامیانه و روان. استفاده از ایموجی‌های ملایم مثل 🌸 و ✨.
- طول پاسخ‌ها: حتماً و همیشه بسیار کوتاه (۱ الی ۲ جمله طبیعی تلگرامی).
- خط قرمز انسانی: هرگز و تحت هیچ شرایطی نگویید هوش مصنوعی یا ربات هستید. شما یک انسان واقعی پای گوشی هستید. کلمات کتابی، رسمی یا پیام‌های تبلیغاتی قالبی اکیداً ممنوع است.

══════════════════════════════════════════════
[سلسله‌مراتب تصمیم‌گیری و اولویت رفتار (Hierarchical Behavioral Protocol)]:
۱. اولویت یک (امنیت و احترام): اگر مخاطب بی‌احترامی کرد یا الفاظ زشت به کار برد، با متانت و کوتاهی پاسخ بده و وارد کل‌کل نشو (S13).
۲. اولویت دو (خداحافظی و خروج): اگر مخاطب گفت بای/خداحافظ یا قصد رفتن داشت، با مهربانی خداحافظی کن (S12).
۳. اولویت سه (عدم اصرار در رد پیشنهاد): اگر مخاطب گفت نه/نمیخوام/تبلیغه/علاقه‌ای ندارم، هرگز اصرار نکن، بحث تبلیغ را بلافاصله تمام کن و به چت دوستانه برگرد (S10).
۴. اولویت چهار (پاسخ به سوالات و کنجکاوی): اگر مخاطب درباره اینترنت، فیلترشکن، سرعت، تست، قیمت، آیفون/اندروید سوال کرد، مستقیماً و خودمانی بر اساس پایگاه دانش پاسخ بده (S6/S8).
۵. اولویت پنج (جریان طبیعی مکالمه و اولویت ارتباط): اولویت اول شما ارتباط انسانی و گفتگو است (Conversation First, Sales Second).

══════════════════════════════════════════════
[ماتریس حالات و رفتارهای مکالمه (State Machine Guidelines S1-S15)]:
- وضعیت S1 (سلام و شروع): احوال‌پرسی گرم و کوتاه.
- وضعیت S2 (تبادل اصل/سن/شهر): «سارا ۲۰ تهران، شما چی؟»
- وضعیت S3 (گپ کوتاه روزمره): صحبت درباره روزمرگی، کارهای امروز، گوشی، موسیقی.
- وضعیت S4 (پل ارتباطی ملایم): اشاره به وضعیت اینترنت یا کار با گوشی/اینستاگرام.
- وضعیت S5 (معرفی نرم / سطح ۱): اشاره گذرا به فیلترشکن خوب بدون فشار فروش.
- وضعیت S6 (پاسخ به کنجکاوی): پاسخ به سوالات مخاطب درباره کیفیت و سرعت.
- وضعیت S7 (ارائه پیشنهاد / سطح ۲): توضیح پلن‌ها، تست رایگان ۱ ساعته، و درج تگ [SEND_PROMO_CARD].
- وضعیت S8 (پاسخ به سوالات فنی و FAQ): سازگاری با سیستم‌عمل‌ها (iOS/Android/Windows)، پرداخت آسان، گارانتی بازگشت وجه.
- وضعیت S9 (ارائه راه‌ارتباطی): آیدی پشتیبانی «nova_vpn10» (حتماً بدون علامت @).
- وضعیت S10 (مدیریت عدم تمایل/نه شنیدن): پذیرش بدون اصرار: «باشه گلم اشکالی نداره، چه خبرا؟»
- وضعیت S11 (ادامه گفتگوی دوستانه): ادامه چت معمولی و انسانی.
- وضعیت S12 (خداحافظی قبل خروج): بهانه ملایم: «من کار فوری برام پیش اومد باید برم گلم، مراقب خودت باش 🌸»
- وضعیت S13 (محتوای نامناسب): برخورد سرد و کوتاه.
- وضعیت S14 (اسپم و بات): پاسخ بی‌تفاوت یا کوتاه.
- وضعیت S15 (پیگیری سکوت): «هستی؟ 🌸»

══════════════════════════════════════════════
[سیاست سه‌سطحی معرفی و فروش (Three-Tier Promotion Policy)]:
- سطح صفر (Level 0 - بدون تبلیغ): در دقایق اول چت یا هنگام احوال‌پرسی اولیه، هیچ تبلیغ یا پیشنهادی ندهید.
- سطح یک (Level 1 - اشاره نرم): فقط در صورتی که بحث به اینترنت یا اینستاگرام کشیده شد، اشاره کوتاهی به فیلترشکن خوب کنید.
- سطح دو (Level 2 - پیشنهاد کامل و CTA): فقط زمانی که مخاطب تمایل نشان داد، قیمت (۵۹ تومن تک‌کاربره، ۸۹ تومن دوکاربره) و تست رایگان را بگویید و تگ [SEND_PROMO_CARD] بزنید.

══════════════════════════════════════════════
[قوانین حیاتی نگارش و فرمت]:
۱. تمام اعداد را حتماً به حروف فارسی بنویسید (مثلاً «بیست» به جای 20، «پنجاه و نه هزار» به جای 59000).
۲. آیدی پشتیبانی را همیشه بدون کاراکتر @ بنویسید: nova_vpn10.
۳. در ابتدای مکالمه کلمات یا حروف انگلیسی نفرستید.
۴. بدون هیچ‌گونه پیشوند مانند «سارا:» یا علامت نقل‌قول پاسخ دهید.`,
  },
  {
    title: 'معرفی هوشمندانه کانال / فیلترشکن (VPN)',
    prompt: `شما یک کاربر عادی و بسیار صمیمی در چت ناشناس تلگرام هستید.
دستورالعمل چت:
۱. پاسخ‌های بسیار کوتاه (حداکثر ۱ یا ۲ جمله خودمانی).
۲. ابتدا سلام و احوال‌پرسی کوتاه و گرم کن.
۳. در پاسخ بعدی اگر از وضعیت پرسید یا پیام فرستاد، بگو داشتم تو اینستا می‌چرخیدم، راستی یه وی‌پی‌ان عالی پیدا کردم اصلا قطعی نداره برای یوتیوب و تلگرام.
۴. لحن کاملاً دوستانه، دلسوزانه و طبیعی باشد بدون کلمات رسمی و کتابی.`,
  },
  {
    title: 'چت آزاد و کوتاه دوستانه',
    prompt: `شما در یک ربات چت ناشناس تلگرام با یک کاربر ناشناس صحبت می‌کنید.
دستورالعمل:
- پاسخ‌هایت حداکثر ۱۰ تا ۱۵ کلمه باشد.
- با لحن عامیانه و تهرانی صحبت کن.
- به حرف‌های مخاطب گوش بده و متناسب با موضوع او پاسخ کوتاه بده.
- به هیچ وجه رسمی حرف نزن.`,
  },
];

const PRESET_GREETINGS = [
  'سلام خوبی؟ 🌸',
  'سلام چطوری؟',
  'سلام روزت بخیر 🌸',
  'سلام، خوبی؟ چه خبر؟',
  'سلام عزیزم چطوری؟',
  'سلام اصل میدی آشنا شیم؟',
  'سلااام چطوری؟ چیکارا می‌کنی؟',
];

const PRESET_FAREWELLS = [
  'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
  'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
  'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
  'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
  'قربونت من برم دیگه، مواظب خودت باش 💫',
  'فعلا بای عزیزم 👋',
];

export const AnonymousAiInstructionsTab: React.FC<AnonymousAiInstructionsTabProps> = ({
  instructions,
  onSaveInstructions,
}) => {
  const [localInstructions, setLocalInstructions] = useState<AnonymousChatInstructions>(instructions);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSavedJsonRef = useRef<string>(JSON.stringify(instructions));

  // Local raw text inputs for dash-separated keywords to guarantee smooth typing
  const [rawIgnoredPhrases, setRawIgnoredPhrases] = useState<string>(
    (instructions.customIgnoredSystemPhrases || []).join(' - ')
  );
  const [rawInappropriateKeywords, setRawInappropriateKeywords] = useState<string>(
    (instructions.inappropriateKeywords || []).join(' - ')
  );
  const [rawSpamBotKeywords, setRawSpamBotKeywords] = useState<string>(
    (instructions.spamBotKeywords || []).join(' - ')
  );

  // Only synchronize from props if the user does NOT have active unsaved edits (isDirty = false)
  useEffect(() => {
    const incomingJson = JSON.stringify(instructions);
    if (!isDirty && incomingJson !== lastSavedJsonRef.current) {
      lastSavedJsonRef.current = incomingJson;
      setLocalInstructions(instructions);
      setRawIgnoredPhrases((instructions.customIgnoredSystemPhrases || []).join(' - '));
      setRawInappropriateKeywords((instructions.inappropriateKeywords || []).join(' - '));
      setRawSpamBotKeywords((instructions.spamBotKeywords || []).join(' - '));
    }
  }, [instructions, isDirty]);

  const updateField = <K extends keyof AnonymousChatInstructions>(
    field: K,
    value: AnonymousChatInstructions[K]
  ) => {
    setIsDirty(true);
    setLocalInstructions((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const updatePromoField = <K extends keyof AnonymousProductPromotion>(
    field: K,
    value: AnonymousProductPromotion[K]
  ) => {
    setIsDirty(true);
    setLocalInstructions((prev) => {
      const currentPromo: AnonymousProductPromotion = prev.productPromotion || {
        enabled: true,
        productName: '',
        productDescription: '',
        imageUrl: '',
        contactHandleOrLink: '',
        sendMode: 'send_photo_with_caption_before_exit',
        sendAtMessageNumber: 3,
      };
      return {
        ...prev,
        productPromotion: {
          ...currentPromo,
          [field]: value,
        },
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveInstructions(localInstructions);
      lastSavedJsonRef.current = JSON.stringify(localInstructions);
      setIsDirty(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error(e);
      alert('خطا در ذخیره دستورالعمل. لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setLocalInstructions(instructions);
    setRawIgnoredPhrases((instructions.customIgnoredSystemPhrases || []).join(' - '));
    setRawInappropriateKeywords((instructions.inappropriateKeywords || []).join(' - '));
    lastSavedJsonRef.current = JSON.stringify(instructions);
    setIsDirty(false);
  };

  const handleSelectSample = (sampleText: string) => {
    updateField('systemPrompt', sampleText);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85);
          updatePromoField('imageUrl', compressed);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const promo = localInstructions.productPromotion || {
    enabled: false,
    productName: '',
    productDescription: '',
    imageUrl: '',
    contactHandleOrLink: '',
    sendMode: 'send_photo_with_caption_before_exit',
    sendAtMessageNumber: 3,
  };

  return (
    <div className="p-5 space-y-6" dir="rtl">
      {/* Top Banner */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
            <span>دستورالعمل هوش مصنوعی و محصول تبلیغاتی چت ناشناس</span>
            {isDirty && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                تغییرات ذخیره‌نشده
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            تنظیم پرامپت مکالمه هوش مصنوعی و همچنین عکس و توضیحات محصول ویژه چت با ناشناس (کاملاً مجزا از تبلیغات گروهی).
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isDirty && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isSaving}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>بازنشانی</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
              savedSuccess
                ? 'bg-emerald-600 shadow-emerald-950/50'
                : isDirty
                ? 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-950/50 ring-2 ring-fuchsia-400/50 animate-pulse'
                : 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-950/50'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-200" />
                <span className="text-emerald-100">ذخیره شد ✓</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره تغییرات دستورالعمل'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. DEDICATED ANONYMOUS CHAT PRODUCT & PHOTO PROMOTION SECTION */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-violet-950/40 via-slate-950/80 to-fuchsia-950/30 p-5 rounded-2xl border border-violet-800/40 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 border border-fuchsia-500/30 text-fuchsia-300 flex items-center justify-center shadow-md">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">عکس و توضیحات محصول تبلیغاتی چت ناشناس</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  مستقل از تبلیغات گروه‌ها
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                ربات در زمان چت با فرد ناشناس، از این تصویر و متن تبلیغاتی برای معرفی یا ارسال آفر استفاده می‌کند.
              </p>
            </div>
          </div>

          {/* Master Enable/Disable Toggle for Product Promo */}
          <label className="relative inline-flex items-center cursor-pointer gap-2.5 self-start sm:self-auto bg-slate-900/90 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-200">
              {promo.enabled ? 'تبلیغ محصول فعال است' : 'تبلیغ محصول خاموش'}
            </span>
            <input
              type="checkbox"
              checked={promo.enabled}
              onChange={(e) => updatePromoField('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-fuchsia-600"></div>
          </label>
        </div>

        {promo.enabled ? (
          <div className="space-y-5">
            {/* Product Image Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
              {/* Image Preview Box */}
              <div className="lg:col-span-1 flex flex-col items-center justify-center p-3 bg-slate-950/80 rounded-xl border border-slate-800 relative group min-h-[160px]">
                {promo.imageUrl ? (
                  <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <img
                      src={promo.imageUrl}
                      alt="عکس محصول تبلیغاتی"
                      referrerPolicy="no-referrer"
                      className="max-h-36 max-w-full rounded-lg object-contain border border-slate-800 shadow-md"
                    />
                    <button
                      type="button"
                      onClick={() => updatePromoField('imageUrl', '')}
                      className="absolute top-1 left-1 p-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/50 shadow transition-all"
                      title="حذف عکس"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-emerald-400 mt-2 font-medium">✓ عکس محصول تنظیم شد</span>
                  </div>
                ) : (
                  <div className="text-center p-4 space-y-2 text-slate-500">
                    <ImageIcon className="w-10 h-10 mx-auto text-slate-600" />
                    <p className="text-xs">عکسی انتخاب نشده است</p>
                    <p className="text-[10px] text-slate-600">لینک عکس را وارد کنید یا فایل آپلود نمایید</p>
                  </div>
                )}
              </div>

              {/* Image Inputs & Upload */}
              <div className="lg:col-span-2 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                    آدرس تصویر یا بنر محصول (Image URL):
                  </label>
                  <input
                    type="url"
                    value={promo.imageUrl || ''}
                    onChange={(e) => updatePromoField('imageUrl', e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none font-mono text-left"
                    dir="ltr"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 rounded-xl bg-violet-950/60 hover:bg-violet-900 border border-violet-700/50 text-violet-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>آپلود تصویر از حافظه دستگاه</span>
                  </button>

                  <span className="text-[11px] text-slate-400">
                    (پشتیبانی از فرمت‌های JPG, PNG و WebP)
                  </span>
                </div>
              </div>
            </div>

            {/* Product Details Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-fuchsia-400" />
                  نام / عنوان محصول یا سرویس:
                </label>
                <input
                  type="text"
                  value={promo.productName || ''}
                  onChange={(e) => updatePromoField('productName', e.target.value)}
                  placeholder="مثال: فیلترشکن اختصاصی پرسرعت V2Ray یا کتونی نایک..."
                  className="w-full bg-slate-900 border border-slate-800 focus:border-fuchsia-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none font-sans"
                />
              </div>

              {/* Contact Handle or Link */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <LinkIcon className="w-3.5 h-3.5 text-sky-400" />
                    آیدی پشتیبانی تلگرام (بدون کاراکتر @):
                  </span>
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                    ارسال فقط بعد از ۲ دقیقه
                  </span>
                </label>
                <input
                  type="text"
                  value={promo.contactHandleOrLink || ''}
                  onChange={(e) => updatePromoField('contactHandleOrLink', e.target.value.replace('@', ''))}
                  placeholder="nova_vpn10"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none font-mono text-left"
                  dir="ltr"
                />
              </div>
            </div>

            {/* 2-Minute Strict Rule Banner Notice */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 leading-relaxed space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <span>⏱️ قانون حیاتی ارسال عکس، اعداد و آیدی (محدودیت ۲ دقیقه):</span>
              </div>
              <p className="text-[11px] opacity-90">
                در مکالمات <strong>زیر ۲ دقیقه</strong>، ارسال هرگونه عکس، بنر، اعداد (به حروف فارسی تبدیل می‌شود)، کلمات انگلیسی و آیدی پشتیبانی اکیداً ممنوع و مسدود است. آیدی پشتیبانی دقیقاً به صورت <strong>nova_vpn10</strong> (بدون @) و عکس محصول <strong>صرفاً پس از گذشت ۲ دقیقه مکالمه واقعی</strong> توسط ربات هوشمند ارسال خواهد شد.
              </p>
            </div>

            {/* Product Description / Pitch Text */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  متن توضیحات، آفر، مزایا یا کپشن محصول برای کاربر ناشناس:
                </span>
                <span className="text-[11px] text-slate-400">توضیحات جذاب و کوتاه</span>
              </label>
              <textarea
                rows={3}
                value={promo.productDescription || ''}
                onChange={(e) => updatePromoField('productDescription', e.target.value)}
                placeholder="راستی یه وی‌پی‌ان عالی دارم بدون قطعی برای اینستا و یوتیوب، تست رایگان هم داره 🚀"
                className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none leading-relaxed font-sans"
              />
            </div>

            {/* Sending Strategy in Anonymous Chat */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <label className="text-xs font-bold text-white flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-400" />
                استراتژی ارسال عکس و توضیحات در چت ناشناس:
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Option 1: Send Photo + Caption on Final Message */}
                <div
                  onClick={() => updatePromoField('sendMode', 'send_photo_with_caption_before_exit')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    promo.sendMode === 'send_photo_with_caption_before_exit'
                      ? 'bg-fuchsia-950/40 border-fuchsia-500 ring-1 ring-fuchsia-500/50 text-white'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1">
                      <span>📸 ارسال در آخرین پیام قبل از خروج</span>
                      <span className="text-[9px] bg-fuchsia-500/20 text-fuchsia-300 px-1.5 py-0.5 rounded-full">
                        پیشنهادی 🚀
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="sendMode"
                      checked={promo.sendMode === 'send_photo_with_caption_before_exit'}
                      onChange={() => updatePromoField('sendMode', 'send_photo_with_caption_before_exit')}
                      className="accent-fuchsia-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    چند پیام اول صمیمی چت می‌کند و در پیام پایانی، عکس بنر به همراه متن توضیحات فرستاده شده و سپس ربات چت را قطع می‌کند.
                  </p>
                </div>

                {/* Option 2: AI Natural conversational pitch */}
                <div
                  onClick={() => updatePromoField('sendMode', 'ai_natural_mention')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    promo.sendMode === 'ai_natural_mention'
                      ? 'bg-fuchsia-950/40 border-fuchsia-500 ring-1 ring-fuchsia-500/50 text-white'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1">
                      <span>🧠 معرفی هوشمند و پویا توسط AI</span>
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">
                        هوشمند ⚡
                      </span>
                    </span>
                    <input
                      type="radio"
                      name="sendMode"
                      checked={promo.sendMode === 'ai_natural_mention'}
                      onChange={() => updatePromoField('sendMode', 'ai_natural_mention')}
                      className="accent-fuchsia-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    هوش مصنوعی مکالمه را تحلیل کرده و در هر زمان از چت که احساس کند موقعیت مناسب است، متن و توضیحات را به صورت خودمانی و طبیعی به مخاطب پیشنهاد می‌دهد.
                  </p>
                </div>

                {/* Option 3: Send at specific message number */}
                <div
                  onClick={() => updatePromoField('sendMode', 'send_custom_card_at_step')}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                    promo.sendMode === 'send_custom_card_at_step'
                      ? 'bg-fuchsia-950/40 border-fuchsia-500 ring-1 ring-fuchsia-500/50 text-white'
                      : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">🔢 ارسال در پیام شماره مشخص</span>
                    <input
                      type="radio"
                      name="sendMode"
                      checked={promo.sendMode === 'send_custom_card_at_step'}
                      onChange={() => updatePromoField('sendMode', 'send_custom_card_at_step')}
                      className="accent-fuchsia-500"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] text-slate-400">در پیام شماره:</span>
                    <input
                      type="number"
                      value={promo.sendAtMessageNumber ?? 2}
                      onChange={(e) => updatePromoField('sendAtMessageNumber', Math.max(1, Number(e.target.value) || 1))}
                      min={1}
                      max={15}
                      className="w-12 bg-slate-950 border border-slate-800 rounded px-1 text-center text-xs font-bold text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Special options when AI Smart Mention is active */}
              {promo.sendMode === 'ai_natural_mention' && (
                <div className="p-3.5 bg-fuchsia-950/20 border border-fuchsia-800/40 rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-fuchsia-400" />
                      <span className="font-bold text-xs text-white">تنظیمات هوشمندی AI در انتخاب زمان ارسال:</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                      <span className="text-[11px] font-semibold text-slate-300">
                        {promo.aiSendBannerWithPitch !== false ? 'ارسال عکس بنر فعال' : 'فقط متن خودمانی'}
                      </span>
                      <input
                        type="checkbox"
                        checked={promo.aiSendBannerWithPitch !== false}
                        onChange={(e) => updatePromoField('aiSendBannerWithPitch', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-fuchsia-600"></div>
                    </label>
                  </div>
                  <p className="text-[11px] text-fuchsia-200/90 leading-relaxed">
                    💡 <strong>نحوه عملکرد:</strong> هوش مصنوعی مکالمه کاربر را بررسی می‌کند. اگر مخاطب درباره نیازها، وضعیت نت، علایق یا اصل صحبت کند، یا پس از چند پیام چت صمیمی، هوش مصنوعی در هر لحظه‌ای که حس کند بهترین زمان است، متن و توضیحات تبلیغ را می‌فرستد و در صورت فعال بودن گزینه بالا، عکس بنر نیز همزمان ارسال می‌شود.
                  </p>
                </div>
              )}

              {/* 2-Minute Photo Delay Rule & Exit Guarantee Banner */}
              <div className="space-y-2">
                <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl flex items-start gap-2.5 text-xs text-amber-200">
                  <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 leading-relaxed">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-white">قانون محدودیت زمانی ۲ دقیقه برای ارسال عکس به ناشناس:</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                        حداقل ۲ دقیقه (۱۲۰ ثانیه)
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-200/90">
                      طبق سازوکار ربات‌های چت ناشناس، ارسال عکس زودتر از ۲ دقیقه از شروع مکالمه برای مخاطب ناشناس قابل مشاهده نیست. ربات به طور خودکار این زمان را محاسبه کرده و تا قبل از ۲ دقیقه متن کامل را ارسال می‌کند و پس از گذشت ۲ دقیقه عکس بنر را می‌فرستد.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-violet-950/30 border border-violet-700/40 rounded-xl flex items-start gap-2.5 text-xs text-violet-200">
                  <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 leading-relaxed">
                    <span className="font-bold text-white">تضمین ارسال عکس و متن تبلیغ قبل از هرگونه خروج زودهنگام:</span>
                    <p className="text-[11px] text-violet-300">
                      در تمامی شرایط خروج (اتمام سقف پیام‌ها، قطع زودهنگام توسط مخاطب، اعلام خداحافظی یا اتمام زمان)، ربات تضمین می‌کند که بنر و متن تبلیغاتی قبل از آغاز توالی دکمه‌های خروج به مخاطب تحویل داده شود (مگر اینکه در حین مکالمه قبلاً ارسال شده باشد).
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature 2: Product FAQ & Knowledge Base (پایگاه دانش سوالات متداول و پاسخ‌های هوشمند) */}
            <div className="p-4 bg-slate-900/80 border border-fuchsia-500/40 rounded-2xl space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-fuchsia-400" />
                    <div>
                      <h5 className="font-bold text-xs text-white">پایگاه دانش سوالات متداول و پاسخ‌های محصول (Product FAQ & Knowledge Base)</h5>
                      <p className="text-[11px] text-slate-400">
                        پاسخ‌دهی دقیق و هوشمندانه به سوالات مخاطبان درباره قیمت، تست رایگان، سرعت، تخفیف، آی‌پی ثابت و روش پرداخت
                      </p>
                    </div>
                  </div>
                </div>

                {/* Free Text Knowledge Base Area */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>توضیحات تکمیلی، پلن‌های قیمتی و گارانتی محصول:</span>
                    <span className="text-[10px] text-slate-500">برای درک عمیق‌تر مدل هوش مصنوعی</span>
                  </label>
                  <textarea
                    rows={3}
                    value={promo.knowledgeBaseText || ''}
                    onChange={(e) => updatePromoField('knowledgeBaseText', e.target.value)}
                    placeholder="مثال: اکانت یک‌ماهه ۵۰ تومن، سه‌ماهه ۱۲۰ تومن. سرورها پرسرعت آلمان و فنلاند با آی‌پی ثابت مخصوص ترید و اینستاگرام. دارای تست رایگان ۲ ساعته..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl p-3 text-xs text-white placeholder:text-slate-600 focus:outline-none leading-relaxed font-sans"
                  />
                </div>

                {/* FAQ Structured Items List */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      پرسش‌ها و پاسخ‌های کلیدی ({promo.faqItems?.length || 0} مورد):
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const curList = [...(promo.faqItems || [])];
                        curList.push({
                          id: 'faq_' + Date.now(),
                          question: '',
                          answer: '',
                          keywords: [],
                        });
                        updatePromoField('faqItems', curList);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-fuchsia-950/60 hover:bg-fuchsia-900 border border-fuchsia-600/40 text-fuchsia-300 text-[11px] font-semibold flex items-center gap-1 transition-all"
                    >
                      <span>+ افزودن پرسش و پاسخ جدید</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                    {(promo.faqItems && promo.faqItems.length > 0 ? promo.faqItems : []).map((faq, fIdx) => (
                      <div key={faq.id || fIdx} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-fuchsia-400 font-bold w-5 text-center font-mono">Q{fIdx + 1}</span>
                          <input
                            type="text"
                            value={faq.question}
                            onChange={(e) => {
                              const cur = [...(promo.faqItems || [])];
                              cur[fIdx] = { ...cur[fIdx], question: e.target.value };
                              updatePromoField('faqItems', cur);
                            }}
                            placeholder="سوال مخاطب (مثلاً: تست رایگان داری؟ یا قیمتش چنده؟)"
                            className="flex-1 bg-slate-900 border border-slate-800 focus:border-fuchsia-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const cur = [...(promo.faqItems || [])];
                              cur.splice(fIdx, 1);
                              updatePromoField('faqItems', cur);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                            title="حذف این پرسش"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex items-start gap-2">
                          <span className="text-[10px] text-emerald-400 font-bold w-5 text-center font-mono mt-2">A{fIdx + 1}</span>
                          <textarea
                            rows={2}
                            value={faq.answer}
                            onChange={(e) => {
                              const cur = [...(promo.faqItems || [])];
                              cur[fIdx] = { ...cur[fIdx], answer: e.target.value };
                              updatePromoField('faqItems', cur);
                            }}
                            placeholder="پاسخ صمیمی و خودمانی (مثلاً: آره عزیزم تست ۲ ساعته رایگان داریم، به آیدی پیام بدی برات می‌فرسته)"
                            className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none leading-relaxed"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            {/* Dedicated Save Button for Product Promotion */}
            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-3 bg-slate-950/40 p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[11px] text-slate-300">
                  اطلاعات محصول (تصویر، عنوان، آیدی و توضیحات) مستقیماً روی سرور ذخیره می‌شود.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                  savedSuccess
                    ? 'bg-emerald-600 shadow-emerald-950/50'
                    : isDirty
                    ? 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-950/50 ring-2 ring-fuchsia-400/50'
                    : 'bg-violet-600 hover:bg-violet-500 shadow-violet-950/50'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-200" />
                    <span>اطلاعات محصول ذخیره شد ✓</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره عکس و مشخصات محصول'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800/80 text-center text-xs text-slate-400">
            معرفی محصول اختصاصی چت ناشناس در حال حاضر غیرفعال است. با روشن کردن کلید بالا، می‌توانید عکس و توضیحات محصول را وارد کنید.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. IMMEDIATE GREETING & ICE-BREAKER ON CONNECT */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-emerald-500/30 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30 shadow">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">ارسال سلام/شروع فوری به محض اتصال (Ice-breaker)</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  کاملاً قابل تنظیم
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                رفع معطلی چت با ارسال خودکار و فوری پیام سلام/شروع بلافاصله پس از اتصال به مخاطب ناشناس
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.initiateGreetingOnConnect ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.initiateGreetingOnConnect ?? true}
              onChange={(e) => updateField('initiateGreetingOnConnect', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {(localInstructions.initiateGreetingOnConnect ?? true) && (
          <div className="space-y-4 pt-3 border-t border-slate-800/80">
            {/* Greeting Mode Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => updateField('greetingMode', 'single')}
                className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                  (localInstructions.greetingMode || 'single') === 'single'
                    ? 'bg-emerald-950/40 border-emerald-500/70 ring-1 ring-emerald-500/30 text-white'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">📌 پیام سلام ثابت (یک متن مشخص)</span>
                  <input
                    type="radio"
                    name="greetingMode"
                    checked={(localInstructions.greetingMode || 'single') === 'single'}
                    onChange={() => updateField('greetingMode', 'single')}
                    className="accent-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  به همه مخاطبان جدید همواره یک متن سلام یکسان ارسال می‌شود.
                </p>
              </div>

              <div
                onClick={() => updateField('greetingMode', 'random_list')}
                className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                  localInstructions.greetingMode === 'random_list'
                    ? 'bg-emerald-950/40 border-emerald-500/70 ring-1 ring-emerald-500/30 text-white'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">🎲 چرخش تصادفی بین چند متن سلام</span>
                  <input
                    type="radio"
                    name="greetingMode"
                    checked={localInstructions.greetingMode === 'random_list'}
                    onChange={() => updateField('greetingMode', 'random_list')}
                    className="accent-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  در هر اتصال جدید به طور تصادفی یکی از پیام‌های لیست را ارسال می‌کند تا چت تنوع داشته باشد.
                </p>
              </div>
            </div>

            {/* Mode 1: Single Greeting Input */}
            {(localInstructions.greetingMode || 'single') === 'single' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>متن پیام سلام/شروع اولیه:</span>
                  <span className="text-[11px] text-slate-500">برای تغییر، متن زیر را ویرایش کنید</span>
                </label>
                <input
                  type="text"
                  value={localInstructions.initialGreetingText ?? 'سلام خوبی؟ 🌸'}
                  onChange={(e) => updateField('initialGreetingText', e.target.value)}
                  placeholder="سلام خوبی؟ 🌸"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            )}

            {/* Mode 2: Multi-Greeting List */}
            {localInstructions.greetingMode === 'random_list' && (
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>لیست پیام‌های سلام برای چرخش تصادفی:</span>
                  <span className="text-[11px] text-emerald-400 font-medium">
                    {(localInstructions.initialGreetings || []).length} پیام در لیست
                  </span>
                </label>

                {/* List items */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {(localInstructions.initialGreetings && localInstructions.initialGreetings.length > 0
                    ? localInstructions.initialGreetings
                    : ['سلام خوبی؟ 🌸', 'سلام چطوری؟', 'سلام روزت بخیر 🌸', 'سلام، خوبی؟ چه خبر؟']
                  ).map((greetItem, gIdx) => (
                    <div
                      key={gIdx}
                      className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800"
                    >
                      <span className="text-[10px] text-slate-500 w-5 text-center font-mono">
                        {gIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={greetItem}
                        onChange={(e) => {
                          const currentList = [
                            ...(localInstructions.initialGreetings && localInstructions.initialGreetings.length > 0
                              ? localInstructions.initialGreetings
                              : ['سلام خوبی؟ 🌸', 'سلام چطوری؟', 'سلام روزت بخیر 🌸', 'سلام، خوبی؟ چه خبر؟']),
                          ];
                          currentList[gIdx] = e.target.value;
                          updateField('initialGreetings', currentList);
                        }}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none font-sans"
                        placeholder="متن پیام سلام..."
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const currentList = [
                            ...(localInstructions.initialGreetings && localInstructions.initialGreetings.length > 0
                              ? localInstructions.initialGreetings
                              : ['سلام خوبی؟ 🌸', 'سلام چطوری؟', 'سلام روزت بخیر 🌸', 'سلام، خوبی؟ چه خبر؟']),
                          ];
                          if (currentList.length > 1) {
                            currentList.splice(gIdx, 1);
                            updateField('initialGreetings', currentList);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="حذف این پیام"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new greeting row */}
                <button
                  type="button"
                  onClick={() => {
                    const currentList = [
                      ...(localInstructions.initialGreetings && localInstructions.initialGreetings.length > 0
                        ? localInstructions.initialGreetings
                        : ['سلام خوبی؟ 🌸', 'سلام چطوری؟', 'سلام روزت بخیر 🌸', 'سلام، خوبی؟ چه خبر؟']),
                    ];
                    currentList.push('سلام چطوری؟ خوبی؟');
                    updateField('initialGreetings', currentList);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-700/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <span>+ افزودن متن سلام جدید به لیست</span>
                </button>
              </div>
            )}

            {/* Quick Preset Greeting Chips */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-slate-400 font-medium">
                پیشنهادهای آماده برای انتخاب سریع:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_GREETINGS.map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      if ((localInstructions.greetingMode || 'single') === 'single') {
                        updateField('initialGreetingText', preset);
                      } else {
                        const currentList = [
                          ...(localInstructions.initialGreetings && localInstructions.initialGreetings.length > 0
                            ? localInstructions.initialGreetings
                            : []),
                        ];
                        if (!currentList.includes(preset)) {
                          currentList.push(preset);
                          updateField('initialGreetings', currentList);
                        }
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-500/50 text-slate-300 hover:text-emerald-200 text-[11px] transition-all"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Delay Setting & Live Preview Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>تاخیر ارسال سلام بعد از اتصال:</span>
                  <span className="text-emerald-400 font-bold font-mono">
                    {(localInstructions.greetingDelaySeconds ?? 0.8).toFixed(1)} ثانیه
                  </span>
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min="0.2"
                    max="4.0"
                    step="0.2"
                    value={localInstructions.greetingDelaySeconds ?? 0.8}
                    onChange={(e) => updateField('greetingDelaySeconds', parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  شبیه‌سازی اکشن Typing قبل از ارسال سلام تا کاملاً طبیعی به نظر برسد.
                </p>
              </div>

              {/* Live Preview Box */}
              <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <span>نمای ارسالی به هم‌صحبت:</span>
                </span>
                <div className="bg-emerald-950/30 border border-emerald-800/40 p-2.5 rounded-lg text-xs text-emerald-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-medium truncate">
                    {(localInstructions.greetingMode || 'single') === 'single'
                      ? (localInstructions.initialGreetingText ?? 'سلام خوبی؟ 🌸')
                      : ((localInstructions.initialGreetings && localInstructions.initialGreetings[0]) || 'سلام خوبی؟ 🌸')}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Save Ice-breaker Button */}
            <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-slate-400">
                ⚡ با ذخیره این بخش، تنظیمات پیام شروع فوراً در اتوماسیون اعمال خواهد شد.
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات سلام و شروع'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2B. PRE-EXIT FAREWELL MESSAGE (پیام خداحافظی قبل از تبلیغ و خروج) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-rose-500/30 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs border border-rose-500/30 shadow">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">ارسال پیام خداحافظی قبل از تبلیغ و قطع ارتباط (Pre-Exit Farewell)</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                  پیام اتمام چت
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                ارسال متنی محترمانه و خودمانی (مثلاً «خب عزیزم من باید برم کاری پیش اومد 🌸») دقیقاً پس از رسیدن به سقف پیام و پیش از ارسال تصویر/متن تبلیغاتی و خروج
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.enablePreExitFarewell ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.enablePreExitFarewell ?? true}
              onChange={(e) => updateField('enablePreExitFarewell', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
          </label>
        </div>

        {(localInstructions.enablePreExitFarewell ?? true) && (
          <div className="space-y-4 pt-3 border-t border-slate-800/80">
            {/* Farewell Mode Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => updateField('farewellMode', 'single')}
                className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                  (localInstructions.farewellMode || 'single') === 'single'
                    ? 'bg-rose-950/40 border-rose-500/70 ring-1 ring-rose-500/30 text-white'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">📌 پیام خداحافظی ثابت (یک متن مشخص)</span>
                  <input
                    type="radio"
                    name="farewellMode"
                    checked={(localInstructions.farewellMode || 'single') === 'single'}
                    onChange={() => updateField('farewellMode', 'single')}
                    className="accent-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  قبل از خروج به همه مخاطبان همواره همین یک متن خداحافظی مشخص ارسال می‌شود.
                </p>
              </div>

              <div
                onClick={() => updateField('farewellMode', 'random_list')}
                className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 ${
                  localInstructions.farewellMode === 'random_list'
                    ? 'bg-rose-950/40 border-rose-500/70 ring-1 ring-rose-500/30 text-white'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-white">🎲 چرخش تصادفی بین چند متن خداحافظی</span>
                  <input
                    type="radio"
                    name="farewellMode"
                    checked={localInstructions.farewellMode === 'random_list'}
                    onChange={() => updateField('farewellMode', 'random_list')}
                    className="accent-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  در هر نوبت خروج به طور تصادفی یکی از پیام‌های لیست زیر برای خداحافظی طبیعی‌تر انتخاب می‌شود.
                </p>
              </div>
            </div>

            {/* Mode 1: Single Farewell Input */}
            {(localInstructions.farewellMode || 'single') === 'single' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>متن پیام خداحافظی قبل از ارسال تبلیغ و خروج:</span>
                  <span className="text-[11px] text-slate-500">برای تغییر، متن زیر را ویرایش کنید</span>
                </label>
                <input
                  type="text"
                  value={localInstructions.preExitFarewellText ?? 'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸'}
                  onChange={(e) => updateField('preExitFarewellText', e.target.value)}
                  placeholder="خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸"
                  className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            )}

            {/* Mode 2: Multi-Farewell List */}
            {localInstructions.farewellMode === 'random_list' && (
              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>لیست پیام‌های خداحافظی برای چرخش تصادفی:</span>
                  <span className="text-[11px] text-rose-400 font-medium">
                    {(localInstructions.preExitFarewells || []).length} پیام در لیست
                  </span>
                </label>

                {/* List items */}
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                  {(localInstructions.preExitFarewells && localInstructions.preExitFarewells.length > 0
                    ? localInstructions.preExitFarewells
                    : [
                        'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
                        'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
                        'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
                        'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
                      ]
                  ).map((farewellItem, fIdx) => (
                    <div
                      key={fIdx}
                      className="flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-800"
                    >
                      <span className="text-[10px] text-slate-500 w-5 text-center font-mono">
                        {fIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={farewellItem}
                        onChange={(e) => {
                          const currentList = [
                            ...(localInstructions.preExitFarewells && localInstructions.preExitFarewells.length > 0
                              ? localInstructions.preExitFarewells
                              : [
                                  'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
                                  'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
                                  'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
                                  'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
                                ]),
                          ];
                          currentList[fIdx] = e.target.value;
                          updateField('preExitFarewells', currentList);
                        }}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none font-sans"
                        placeholder="متن پیام خداحافظی..."
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const currentList = [
                            ...(localInstructions.preExitFarewells && localInstructions.preExitFarewells.length > 0
                              ? localInstructions.preExitFarewells
                              : [
                                  'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
                                  'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
                                  'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
                                  'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
                                ]),
                          ];
                          if (currentList.length > 1) {
                            currentList.splice(fIdx, 1);
                            updateField('preExitFarewells', currentList);
                          }
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="حذف این پیام"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new farewell row */}
                <button
                  type="button"
                  onClick={() => {
                    const currentList = [
                      ...(localInstructions.preExitFarewells && localInstructions.preExitFarewells.length > 0
                        ? localInstructions.preExitFarewells
                        : [
                            'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
                            'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
                            'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
                            'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
                          ]),
                    ];
                    currentList.push('فعلا گلم، مراقب خودت باش 🌸');
                    updateField('preExitFarewells', currentList);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-700/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <span>+ افزودن متن خداحافظی جدید به لیست</span>
                </button>
              </div>
            )}

            {/* Quick Preset Farewell Chips */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-slate-400 font-medium">
                پیشنهادهای آماده برای انتخاب سریع:
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_FAREWELLS.map((preset, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      if ((localInstructions.farewellMode || 'single') === 'single') {
                        updateField('preExitFarewellText', preset);
                      } else {
                        const currentList = [
                          ...(localInstructions.preExitFarewells && localInstructions.preExitFarewells.length > 0
                            ? localInstructions.preExitFarewells
                            : []),
                        ];
                        if (!currentList.includes(preset)) {
                          currentList.push(preset);
                          updateField('preExitFarewells', currentList);
                        }
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-500/50 text-slate-300 hover:text-rose-200 text-[11px] transition-all"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Timing & Live Preview Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>تاخیر بین پیام خداحافظی و پیام تبلیغاتی:</span>
                  <span className="text-rose-400 font-bold font-mono">
                    {(localInstructions.farewellDelaySeconds ?? 1.5).toFixed(1)} ثانیه
                  </span>
                </label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.5"
                    value={localInstructions.farewellDelaySeconds ?? 1.5}
                    onChange={(e) => updateField('farewellDelaySeconds', parseFloat(e.target.value))}
                    className="flex-1 accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  زمان طبیعی وقفه برای اینکه ابتدا پیام خداحافظی ارسال شده و سپس تصویر و کپشن محصول ارسال گردد.
                </p>
              </div>

              {/* Live Preview Box */}
              <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                  <span>نمای ارسالی به هم‌صحبت قبل از خروج:</span>
                </span>
                <div className="bg-rose-950/30 border border-rose-800/40 p-2.5 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                  <span className="font-medium truncate">
                    {(localInstructions.farewellMode || 'single') === 'single'
                      ? (localInstructions.preExitFarewellText ?? 'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸')
                      : ((localInstructions.preExitFarewells && localInstructions.preExitFarewells[0]) || 'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸')}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Save Farewell Button */}
            <div className="pt-2 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-slate-400">
                ⚡ با ذخیره این بخش، پیام خداحافظی پیش از خروج و تبلیغ در اتوماسیون فعال می‌شود.
              </span>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-rose-950/40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{isSaving ? 'در حال ذخیره...' : 'ذخیره تنظیمات پیام خداحافظی'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN AI SYSTEM PROMPT CARD */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-fuchsia-400" />
            <span>دستورالعمل لحن و نحوه صحبت هوش مصنوعی (System Prompt):</span>
          </label>

          {/* Sample Prompts Chips */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">نمونه پرامپت‌های آماده:</span>
            {SAMPLE_PROMPTS.map((sp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSample(sp.prompt)}
                className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-fuchsia-950/50 border border-slate-800 hover:border-fuchsia-600 text-slate-300 hover:text-fuchsia-200 text-[11px] font-medium transition-all"
              >
                {sp.title}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={7}
          value={localInstructions.systemPrompt || ''}
          onChange={(e) => updateField('systemPrompt', e.target.value)}
          placeholder="دستورالعمل دقیق خود را برای هوش مصنوعی بنویسید (مثلاً: تو یک دختر ۲۰ ساله به نام سارا هستی. با لحن صمیمی و کوتاه ۱ یا ۲ جمله‌ای چت کن...)"
          className="w-full bg-slate-900 border border-slate-800 focus:border-fuchsia-500 rounded-xl p-4 text-xs text-white placeholder:text-slate-600 focus:outline-none leading-relaxed font-sans"
        />

        <div className="p-3 bg-fuchsia-950/20 border border-fuchsia-800/30 rounded-xl flex items-start gap-2 text-[11px] text-fuchsia-200 leading-relaxed">
          <Info className="w-4 h-4 text-fuchsia-400 flex-shrink-0 mt-0.5" />
          <span>
            <strong>نکته هوش مصنوعی:</strong> Gemini مکالمات فرد ناشناس را دریافت کرده و متناسب با سناریو و محصول بالا، پاسخ‌های طبیعی، کوتاه و انسانی تولید می‌کند.
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. AI CONVERSATION MEMORY & SESSION ISOLATION (حافظه و تفکیک جلسات) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-cyan-500/30 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs border border-cyan-500/30 shadow">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">🧠 حافظه هوشمند و تفکیک کامل جلسات مکالمه</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-medium">
                  جدید و بهینه‌سازی شده
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                تضمین یادآوری پیوسته حرف‌های مخاطب جاری + ریست و فراموشی کامل افراد قبلی در هر اتصال جدید
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2 border-t border-slate-800/80">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Control 1: Strict Session Isolation */}
            <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  تفکیک تضمینی جلسات (Session Isolation)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localInstructions.enforceSessionIsolation ?? true}
                    onChange={(e) => updateField('enforceSessionIsolation', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                با روشن بودن این گزینه، به محض قطع شدن یک مکالمه و شروع چت با فرد جدید، تمام حافظه قبلی ریست شده و هوش مصنوعی می‌داند با یک شخص کاملاً جدید در حال گفتگو است.
              </p>
            </div>

            {/* Control 2: Extract Partner Demographics */}
            <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  استخراج خودکار مشخصات مخاطب (سن، جنسیت، شهر)
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localInstructions.extractPartnerProfileInfo ?? true}
                    onChange={(e) => updateField('extractPartnerProfileInfo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                اگر ربات در پیام شروع مشخصاتی مانند «پسر ۲۲ ساله تهران» یا تگ کاربر را اعلام کند، هوش مصنوعی آن را استخراج و در حافظه این مکالمه لحاظ می‌کند.
              </p>
            </div>

            {/* Control 3: Dynamic Session Phase Context */}
            <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-violet-400"></span>
                  تزریق هوشمند فاز مکالمه به هوش مصنوعی
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localInstructions.dynamicSessionStatePrompt ?? true}
                    onChange={(e) => updateField('dynamicSessionStatePrompt', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                هوش مصنوعی در هر نوبت پاسخ، می‌داند که پیام شماره چندم از سقف چت است (مثلاً پیام شروع آشنایی است یا پیام قبل از خداحافظی و خروج).
              </p>
            </div>

            {/* Control 4: Memory Window Size Slider */}
            <div className="bg-slate-900/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  عمق حافظه مکالمه جاری (Memory Window):
                </span>
                <span className="text-cyan-400 font-bold font-mono text-xs">
                  {localInstructions.memoryWindowSize ?? 10} پیام اخیر
                </span>
              </div>
              <div className="pt-1">
                <input
                  type="range"
                  min="4"
                  max="20"
                  step="2"
                  value={localInstructions.memoryWindowSize ?? 10}
                  onChange={(e) => updateField('memoryWindowSize', parseInt(e.target.value) || 10)}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                تعداد پیام‌های رد و بدل شده اخیر با همان هم‌صحبت که هوش مصنوعی در پاسخ‌های بعدی به خاطر دارد.
              </p>
            </div>
          </div>

          {/* Memory Feature Highlight Banner */}
          <div className="p-3 bg-cyan-950/30 border border-cyan-700/40 rounded-xl flex items-start gap-2.5 text-xs text-cyan-200">
            <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-white">نحوه کارکرد سیستم حافظه و تفکیک مکالمات:</span>
              <p className="text-[11px] text-cyan-300">
                ۱. در طول یک چت، هوش مصنوعی کل تاریخچه گفتگوی همان فرد را به صورت پیوسته در نظر می‌گیرد تا پاسخ‌ها مرتبط و منطقی باشند.<br />
                ۲. به محض شناسایی پیام قطع اتصال یا رسیدن به سقف پیام و خروج، شناسه جلسه و تاریخچه آن بایگانی شده و جلسه بعدی با حافظه کاملاً خالی و صفر شروع می‌شود.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. MULTI-BUBBLE MESSAGING (ارسال پیام‌های چندتکه‌ای طبیعی و روان) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-violet-500/30 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-xs border border-violet-500/30 shadow">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">ارسال پیام‌های چندتکه‌ای طبیعی (Multi-Bubble Messaging)</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 font-medium">
                  احساس انسانی ۱۰۰٪
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                شکستن خودکار پاسخ‌های چندجمله‌ای هوش مصنوعی به پیام‌های متوالی و کوتاه با مکث طبیعی بین آن‌ها (دقیقاً مثل چت انسانی)
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.enableMultiBubble ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.enableMultiBubble ?? true}
              onChange={(e) => updateField('enableMultiBubble', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
          </label>
        </div>

        {(localInstructions.enableMultiBubble ?? true) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-800/80">
            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>حداکثر تعداد حباب در هر نوبت پاسخ:</span>
                <span className="text-violet-400 font-bold font-mono text-xs">
                  {localInstructions.multiBubbleMaxChunks ?? 3} حباب (پیام)
                </span>
              </label>
              <input
                type="range"
                min="2"
                max="5"
                step="1"
                value={localInstructions.multiBubbleMaxChunks ?? 3}
                onChange={(e) => updateField('multiBubbleMaxChunks', parseInt(e.target.value) || 3)}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                اگر پاسخ هوش مصنوعی طولانی باشد، حداکثر به این تعداد پیام کوتاه تفکیک و فرستاده می‌شود.
              </p>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>مکث بین حباب‌های پیام متوالی:</span>
                <span className="text-violet-400 font-bold font-mono text-xs">
                  {(localInstructions.multiBubbleDelaySeconds ?? 1.2).toFixed(1)} ثانیه
                </span>
              </label>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={localInstructions.multiBubbleDelaySeconds ?? 1.2}
                onChange={(e) => updateField('multiBubbleDelaySeconds', parseFloat(e.target.value) || 1.2)}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                فاصله زمانی کوتاه همراه با انیمیشن تایپ بین ارسال هر حباب تا حباب بعدی.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. DYNAMIC REALISTIC TYPING SPEED (شبیه‌سازی سرعت تایپ پویا و واقع‌گرایانه) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-sky-500/30 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs border border-sky-500/30 shadow">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">سرعت تایپ پویا متناسب با طول پیام (Dynamic Typing Speed)</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 font-medium">
                  شبیه‌سازی تایپ دست
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                محاسبه زمان مکث تایپ بر اساس تعداد حروف متن به علاوه خطای انسانی و لرزش تصادفی (Jitter)
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.dynamicTypingSpeed ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.dynamicTypingSpeed ?? true}
              onChange={(e) => updateField('dynamicTypingSpeed', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
          </label>
        </div>

        {(localInstructions.dynamicTypingSpeed ?? true) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/80">
            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>سرعت تایپ هر حرف:</span>
                <span className="text-sky-400 font-bold font-mono text-xs">
                  {localInstructions.typingSpeedMsPerChar ?? 35} ms/حرف
                </span>
              </label>
              <input
                type="range"
                min="15"
                max="80"
                step="5"
                value={localInstructions.typingSpeedMsPerChar ?? 35}
                onChange={(e) => updateField('typingSpeedMsPerChar', parseInt(e.target.value) || 35)}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">
                سرعت شبیه‌سازی تایپ یک کاربر سریع در کیبورد گوشی (۳۵ میلی‌ثانیه میانگین استاندارد است).
              </p>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>حداقل تاخیر تایپ:</span>
                <span className="text-sky-400 font-bold font-mono text-xs">
                  {(localInstructions.minTypingDelaySeconds ?? 0.8).toFixed(1)} ثانیه
                </span>
              </label>
              <input
                type="range"
                min="0.4"
                max="3.0"
                step="0.2"
                value={localInstructions.minTypingDelaySeconds ?? 0.8}
                onChange={(e) => updateField('minTypingDelaySeconds', parseFloat(e.target.value) || 0.8)}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">حتی برای پاسخ‌های تک کلمه‌ای، این مقدار حداقل مکث اعمال می‌شود.</p>
            </div>

            <div className="bg-slate-900/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>سقف حداکثر تاخیر:</span>
                <span className="text-sky-400 font-bold font-mono text-xs">
                  {(localInstructions.maxTypingDelaySeconds ?? 4.5).toFixed(1)} ثانیه
                </span>
              </label>
              <input
                type="range"
                min="2.0"
                max="8.0"
                step="0.5"
                value={localInstructions.maxTypingDelaySeconds ?? 4.5}
                onChange={(e) => updateField('maxTypingDelaySeconds', parseFloat(e.target.value) || 4.5)}
                className="w-full accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">جلوگیری از معطلی بیش از حد برای پیام‌های طولانی.</p>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 7. ANTI-SPAM & SPAM BOT FAST SKIP (فیلتر سریع ربات‌ها و ارسال‌کنندگان لینک) */}
      {/* ========================================================================= */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-amber-500/30 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30 shadow">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-white">رد سریع ربات‌های تبلیغاتی و لینک‌های اسپم (Fast Spam/Bot Filter)</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium">
                  صرفه‌جویی در زمان و توکن
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                اگر پیام اول مخاطب حاوی لینک کانال، جوین اجباری، بنر تبلیغاتی یا عبارات تبلیغاتی باشد، بات فوراً لفت داده و وقت را هدر نمی‌دهد
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.autoSkipSpamBots ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.autoSkipSpamBots ?? true}
              onChange={(e) => updateField('autoSkipSpamBots', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>

        {(localInstructions.autoSkipSpamBots ?? true) && (
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>کلمات و الگوهای شناسایی ربات تبلیغاتی (جدا شده با خط تیره -):</span>
              <span className="text-[10px] text-amber-400 font-mono">
                {(localInstructions.spamBotKeywords || []).length} الگوی ثبت‌شده
              </span>
            </label>
            <input
              type="text"
              value={rawSpamBotKeywords}
              onChange={(e) => {
                const val = e.target.value;
                setRawSpamBotKeywords(val);
                const parsed = val
                  .split(/[-–—]/)
                  .map((k) => k.trim())
                  .filter(Boolean);
                updateField('spamBotKeywords', parsed);
              }}
              placeholder="مثال: t.me/ - https:// - جوین شین - کانال تلگرام - ربات زیر - پورن - شارژ رایگان"
              className="w-full bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-sans"
            />
            <p className="text-[10px] text-slate-400">
              ⚡ در صورت دریافت پیامی با هر یک از این الگوها، بدون مصرف توکن و ارسال پاسخ هوش مصنوعی، دکمه بعدی زده می‌شود و در آمار به عنوان ربات اسپم ثبت می‌گردد.
            </p>
          </div>
        )}
      </div>

      {/* Dialogue Rules & Exit Limits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Max Messages Limit */}
        <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center font-bold text-xs">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-white">تعداد پیام مکالمه قبل از خروج</h4>
              <p className="text-[11px] text-slate-400">سقف مجاز پیام‌های ربات با هر فرد</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-300">
              بعد از چند پیام از چت خارج شود؟
            </span>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <input
                type="number"
                value={localInstructions.maxMessagesPerChat ?? 4}
                onChange={(e) =>
                  updateField('maxMessagesPerChat', Math.max(1, Number(e.target.value) || 1))
                }
                min={1}
                max={30}
                className="w-12 bg-transparent text-white font-bold text-center text-sm focus:outline-none"
              />
              <span className="text-xs text-slate-400">پیام</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            به عنوان مثال اگر عدد ۳ را بگذارید، پس از ۳ بار پاسخ‌گویی به مخاطب، بات به صورت خودکار مراحل دکمه‌های خروج را می‌زند و با نفر بعدی صحبت می‌کند.
          </p>
        </div>

        {/* Natural Typing Delay */}
        <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-white">تاخیر شبیه‌سازی تایپ</h4>
              <p className="text-[11px] text-slate-400">مکث طبیعی قبل از ارسال پاسخ</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-xs text-slate-300">
              تاخیر ارسال پاسخ هوش مصنوعی:
            </span>
            <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
              <input
                type="number"
                value={localInstructions.replyDelaySeconds ?? 1.5}
                onChange={(e) =>
                  updateField('replyDelaySeconds', Math.max(0.5, Number(e.target.value) || 0.5))
                }
                min={0.5}
                max={10}
                step={0.5}
                className="w-12 bg-transparent text-white font-bold text-center text-sm focus:outline-none"
              />
              <span className="text-xs text-slate-400">ثانیه</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            در این مدت اکشن «Typing...» در تلگرام فعال می‌شود تا مخاطب حس کند یک انسان واقعی در حال تایپ است.
          </p>
        </div>
      </div>

      {/* Stranger Silence Handling */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 font-bold text-xs text-white">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>مدیریت سکوت یا عدم پاسخ مخاطب:</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs text-slate-300">حداکثر زمان انتظار:</span>
            <input
              type="number"
              value={localInstructions.silenceTimeoutSeconds ?? 30}
              onChange={(e) =>
                updateField('silenceTimeoutSeconds', Math.max(10, Number(e.target.value) || 10))
              }
              min={10}
              max={180}
              className="w-12 bg-transparent text-white font-bold text-center text-xs focus:outline-none"
            />
            <span className="text-xs text-slate-400">ثانیه</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={localInstructions.enableSilenceNudge ?? true}
                onChange={(e) => updateField('enableSilenceNudge', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
            <span className="text-xs text-slate-300">
              ارسال پیام پیگیری خودکار در صورت سکوت مخاطب
            </span>
          </div>

          {localInstructions.enableSilenceNudge && (
            <input
              type="text"
              value={localInstructions.silenceNudgeText || ''}
              onChange={(e) => updateField('silenceNudgeText', e.target.value)}
              placeholder="هستی؟ 🌸"
              className="bg-slate-900 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-1.5 text-xs text-white w-36 text-center focus:outline-none"
            />
          )}
        </div>
      </div>

      {/* Consecutive Message Aggregation & Buffer Setting */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">تجمیع پیام‌های متوالی مخاطب (Message Aggregation)</h4>
            <p className="text-[11px] text-slate-400">پاسخ‌دهی به کل پیام‌های پشت سر هم مخاطب در قالب یک پیام واحد</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-slate-300">
            مدت زمان انتظار برای دریافت پیام‌های بعدی مخاطب:
          </span>
          <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <input
              type="number"
              value={localInstructions.messageAggregationDelaySeconds ?? 2.5}
              onChange={(e) =>
                updateField('messageAggregationDelaySeconds', Math.max(0.5, Number(e.target.value) || 0.5))
              }
              min={0.5}
              max={10}
              step={0.5}
              className="w-12 bg-transparent text-white font-bold text-center text-sm focus:outline-none"
            />
            <span className="text-xs text-slate-400">ثانیه</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          اگر مخاطب متنی را در چند پیام پیاپی بفرستد (مثلاً «سلام»، «خوبی»، «اصل میدی؟»)، بات به مدت مشخص‌شده صبر کرده، تمامی پیام‌ها را تجمیع نموده و یک پاسخ جامع و مرتبط می‌دهد.
        </p>
      </div>

      {/* System & Bot Messages Filter (Ignore List) */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 font-bold text-xs text-emerald-300">
          <ShieldAlert className="w-4 h-4 text-emerald-400" />
          <span>فیلتر و نادیده‌گیری پیام‌های سیستمی ربات (Ignore System Alerts):</span>
        </div>
        <p className="text-[11px] text-slate-400">
          پیام‌هایی که شامل این عبارت‌ها باشند به عنوان پیام مخاطب پردازش نشده و هوش مصنوعی پاسخی به آن‌ها نمی‌دهد (عبارات و جملات را با خط تیره <span className="text-emerald-400 font-bold text-xs">-</span> از هم جدا کنید):
        </p>
        <textarea
          rows={3}
          value={rawIgnoredPhrases}
          onChange={(e) => {
            const val = e.target.value;
            setRawIgnoredPhrases(val);
            const parsed = val
              .split(/[-–—\n]/)
              .map((k) => k.trim())
              .filter(Boolean);
            updateField('customIgnoredSystemPhrases', parsed);
          }}
          placeholder="مثال: به هیچ کاربری در ربات اعتماد نکنید - 1 سکه رایگان - پروفایل هایپر گپ را مشاهده کرد - اخطار"
          className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-white focus:outline-none leading-relaxed font-sans"
        />
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap">
          <span className="text-slate-400">فیلترهای پیش‌فرض فعال:</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">اخطار عدم اعتماد</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">سکه رایگان سیستم</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">مشاهده پروفایل هایپرگپ</span>
          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">جمله خوش‌آمدگویی/اتصال</span>
        </div>
      </div>

      {/* Auto-Exit on Partner Goodbye / Exit Intent */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-rose-500/30 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-white">تشخیص هوشمند خداحافظی مخاطب و خروج خودکار</h4>
              <p className="text-[11px] text-slate-400">شناسایی قصد خروج یا خداحافظی هم‌صحبت و ارسال تبلیغ قبل از ترک چت</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">
              {(localInstructions.autoExitOnPartnerBye ?? true) ? 'فعال' : 'غیرفعال'}
            </span>
            <input
              type="checkbox"
              checked={localInstructions.autoExitOnPartnerBye ?? true}
              onChange={(e) => updateField('autoExitOnPartnerBye', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
          </label>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          اگر مخاطب کلماتی نظیر «خداحافظ»، «بای»، «باید برم»، «فعلا» یا «لفت بده» ارسال کند، ربات معطل نمانده، پیام خداحافظی و تبلیغ محصول را ارسال نموده و بلافاصله توالی دکمه‌های خروج را اجرا می‌کند.
        </p>
      </div>

      {/* Inappropriate words protection */}
      <div className="bg-slate-950/60 p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 font-bold text-xs text-rose-300">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>خروج فوری در صورت دریافت کلمات نامناسب یا فحاشی:</span>
        </div>
        <p className="text-[11px] text-slate-400">
          اگر مخاطب هر یک از این کلمات را بفرستد، بات فوراً چت را ترک کرده و به نفر بعدی متصل می‌شود (کلمات را با خط تیره <span className="text-rose-400 font-bold text-xs">-</span> از هم جدا کنید):
        </p>
        <input
          type="text"
          value={rawInappropriateKeywords}
          onChange={(e) => {
            const val = e.target.value;
            setRawInappropriateKeywords(val);
            const parsed = val
              .split(/[-–—]/)
              .map((k) => k.trim())
              .filter(Boolean);
            updateField('inappropriateKeywords', parsed);
          }}
          placeholder="کلمات را با خط تیره (-) جدا کنید (مثلاً: بلاک - اسپم - فحش - تبلیغات)"
          className="w-full bg-slate-900 border border-slate-800 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none font-sans"
        />
      </div>
    </div>
  );
};
