import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  AppState,
  TargetGroup,
  ProductCampaign,
  LogEntry,
  TelegramCredentials,
  SchedulerConfig,
  GroupMonitoringReport,
  AnonymousBotProfile,
  AnonymousChatInstructions,
  AnonymousChatSession,
  AnonymousChatAutomatorConfig,
  AnonymousChatMessage,
  AnonymousBotButtonStep,
  AnonymousProductPromotion,
  TelegramAccount,
  AnonymousDialogueTurn,
  AnonymousPartnerConversation,
  AnonymousPromptTestRun,
  AnonymousAnalyticsReport,
  ConversationState,
  Intent,
  PromotionLevel,
  ObjectionCategory,
  ConversationContext,
} from './src/types.js';
import {
  processConversationTurn,
  createInitialConversationContext,
  buildPromptDirective,
  ConversationStepOutput,
} from './src/conversation/conversationEngine.js';
import { validateAndSanitizeResponse } from './src/conversation/responseValidator.js';
import { runAllConversationTests, TestSuiteSummary } from './src/conversation/conversationTests.js';
import { GOLD_DATASET } from './src/evaluation/goldDataset.js';
import { runFullEvaluation, replaySingleConversation } from './src/evaluation/replayEngine.js';
import { runAllEvaluationTests } from './src/evaluation/evaluationTests.js';
import { exportTracesToCSV, exportReportToJSON } from './src/evaluation/exportUtils.js';
import { ReplayMode } from './src/evaluation/evaluationTypes.js';
import { HealthService } from './src/reliability/healthService.js';
import { telemetry } from './src/observability/telemetry.js';
import { logger, sanitizePii } from './src/observability/logger.js';
import { validateRuntimeConfig, getRuntimeConfig } from './src/config/runtimeConfig.js';

// Telegram Phone Number Cleaner & Normalizer
function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  let res = String(phone)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
    .replace(/[\s\-\(\)]/g, '')
    .trim();
  if (res.startsWith('00')) {
    res = '+' + res.slice(2);
  } else if (res.startsWith('09')) {
    res = '+98' + res.slice(1);
  } else if (res.startsWith('98')) {
    res = '+' + res;
  } else if (!res.startsWith('+') && /^\d+$/.test(res)) {
    res = '+' + res;
  }
  return res;
}

const DEFAULT_API_ID = '2040';
const DEFAULT_API_HASH = 'b18441a1ff607e10a989891a5462e627';

// GramJS import for Telegram MTProto
let TelegramClient: any = null;
let StringSession: any = null;
let Api: any = null;
let computeCheck: any = null;

async function loadGramJS() {
  if (TelegramClient) return;
  try {
    const telegramPkg = await import('telegram');
    const sessionsPkg = await import('telegram/sessions/index.js');
    const passwordPkg = await import('telegram/Password.js').catch(() => null);
    TelegramClient = telegramPkg.TelegramClient;
    Api = telegramPkg.Api;
    StringSession = sessionsPkg.StringSession;
    if (passwordPkg) {
      computeCheck = passwordPkg.computeCheck;
    }
  } catch (err) {
    console.log('GramJS loaded with fallback mode:', (err as Error).message);
  }
}

async function verify2FAPassword(client: any, passwordStr: string, apiIdNum?: number, apiHash?: string) {
  if (computeCheck && Api && Api.account && Api.account.GetPassword && Api.auth && Api.auth.CheckPassword) {
    const passwordSrpResult = await client.invoke(new Api.account.GetPassword());
    const passwordSrpCheck = await computeCheck(passwordSrpResult, passwordStr);
    return await client.invoke(
      new Api.auth.CheckPassword({
        password: passwordSrpCheck,
      })
    );
  } else if (client.signInWithPassword) {
    return await client.signInWithPassword(
      { apiId: apiIdNum || 0, apiHash: apiHash || '' },
      {
        password: () => passwordStr,
        onError: (err: any) => {
          throw err;
        },
      }
    );
  } else {
    throw new Error('متد تایید رمز دو مرحله‌ای در دسترس نیست');
  }
}

const app = express();
const PORT = 3000;

// Body parser
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// PRODUCTION HEALTH & OBSERVABILITY PROBES
app.get('/api/health', (req, res) => {
  const health = HealthService.getDetailedHealth(
    appState?.credentials?.isConnected || false,
    appState?.credentials?.phoneNumber
  );
  res.status(health.status === 'DOWN' ? 503 : 200).json(health);
});

app.get('/api/ready', (req, res) => {
  const readiness = HealthService.getReadiness();
  res.status(readiness.code).json(readiness);
});

app.get('/api/live', (req, res) => {
  const liveness = HealthService.getLiveness();
  res.status(liveness.code).json(liveness);
});

app.get('/api/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(telemetry.formatPrometheusMetrics());
});

app.get('/api/observability/stats', (req, res) => {
  res.json({
    success: true,
    snapshot: telemetry.getSnapshot(),
    logs: logger.getRecentLogs().slice(-50),
  });
});

app.get('/api/config/validate', (req, res) => {
  const validation = validateRuntimeConfig();
  res.json({
    success: true,
    validation: {
      valid: validation.valid,
      warnings: validation.warnings,
      errors: validation.errors,
      config: sanitizePii(validation.config),
    },
  });
});

// Memory / File Persistence
const DATA_FILE = path.join(process.cwd(), 'telegram_promoter_data.json');

const defaultAnonymousAutomatorConfig: AnonymousChatAutomatorConfig = {
  isActive: false,
  selectedBotId: 'bot_hypergap',
  bots: [
    {
      id: 'bot_hypergap',
      name: 'ربات هایپر گپ (@HyperGap)',
      botUsername: '@HyperGap',
      startCommand: '/start',
      autoDismissPopups: true,
      fuzzyButtonMatching: true,
      popupOkKeywords: ['OK', 'ok', 'تایید', 'بله', 'قبول', 'باشه', 'فهمیدم'],
      entrySteps: [
        {
          id: 'step_hg_1',
          label: 'به یه ناشناس وصلم کن!',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.2,
        },
        {
          id: 'step_hg_2',
          label: 'جستجوی شانسی',
          buttonLocation: 'inline_button',
          delaySeconds: 1.0,
        },
        {
          id: 'step_hg_3',
          label: '🎲 جستجوی شانسی 🎲',
          buttonLocation: 'inline_button',
          delaySeconds: 1.0,
        },
      ],
      connectionKeywords: [
        'به مخاطب وصل شدی',
        'یک هم‌صحبت پیدا شد',
        'یک همصحبت پیدا شد',
        'وصل شدی',
        'متصل شدید',
        'مخاطب پیدا شد',
        'هم‌اکنون در حال گفتگو هستید',
        'وصلتون کردم',
        'شروع مکالمه',
      ],
      exitSteps: [
        {
          id: 'exit_hg_1',
          label: 'پایان چت',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.0,
        },
        {
          id: 'exit_hg_2',
          label: 'اتمام چت',
          buttonLocation: 'inline_button',
          delaySeconds: 1.5,
        },
      ],
      partnerDisconnectedKeywords: ['مخاطب گفتگو را بست', 'مخاطب چت را ترک کرد', 'چت را ترک کرد', 'قطع شد', 'مکالمه پایان یافت'],
      delayBetweenButtonsMs: 1200,
      enabled: true,
      notes: 'ربات هایپرگپ با ترتیب کلیک منو، دکمه شیشه‌ای و خروج چندمرحله‌ای',
    },
    {
      id: 'bot_bichat',
      name: 'ربات بای چت (@BiChatBot)',
      botUsername: '@BiChatBot',
      startCommand: '/start',
      autoDismissPopups: true,
      fuzzyButtonMatching: true,
      entrySteps: [
        {
          id: 'step_bc_1',
          label: 'چت با ناشناس 🎭',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.2,
        },
        {
          id: 'step_bc_2',
          label: 'همسن و همشهری',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.0,
        },
        {
          id: 'step_bc_3',
          label: 'شروع جستجو 🔍',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.2,
        },
      ],
      connectionKeywords: [
        'وصل شدی',
        'متصل شدید',
        'مخاطب پیدا شد',
        'یک همصحبت پیدا شد',
        'سلام کن',
      ],
      exitSteps: [
        {
          id: 'exit_bc_1',
          label: '❌ پایان چت',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.0,
        },
        {
          id: 'exit_bc_2',
          label: 'بله، مطمئنم',
          buttonLocation: 'inline_button',
          delaySeconds: 1.0,
        },
      ],
      partnerDisconnectedKeywords: ['مخاطب گفتگو را بست', 'چت را ترک کرد', 'قطع شد', 'مکالمه پایان یافت'],
      delayBetweenButtonsMs: 1500,
      enabled: true,
      notes: 'ربات محبوب بای‌چت با منوی کیبورد و خروج مستقیم',
    },
    {
      id: 'bot_chatgram',
      name: 'ربات چت‌گرام (@ChatGramBot)',
      botUsername: '@ChatGramBot',
      startCommand: '/start',
      autoDismissPopups: true,
      fuzzyButtonMatching: true,
      entrySteps: [
        {
          id: 'step_cg_1',
          label: '🎭 چت ناشناس',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.2,
        },
        {
          id: 'step_cg_2',
          label: '🔍 جستجوی هم‌صحبت',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.0,
        },
        {
          id: 'step_cg_3',
          label: '👥 فرقی ندارد',
          buttonLocation: 'inline_button',
          delaySeconds: 1.2,
        },
      ],
      connectionKeywords: [
        'وصل شدید',
        'هم‌صحبت پیدا شد',
        'متصل شدید',
        'مکالمه آغاز شد',
      ],
      exitSteps: [
        {
          id: 'exit_cg_1',
          label: '❌ پایان گفتگو',
          buttonLocation: 'reply_keyboard',
          delaySeconds: 1.0,
        },
      ],
      partnerDisconnectedKeywords: ['کاربر از چت خارج شد', 'مکالمه پایان یافت', 'چت قطع شد'],
      delayBetweenButtonsMs: 1500,
      enabled: true,
      notes: 'ربات چت‌گرام با گزینه‌های سریع جستجوی هم‌صحبت',
    },
  ],
  instructions: {
    systemPrompt: `[هویت و شخصیت اصلی (Core Persona)]:
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
- وضعیت S8 (پاسخ به سوالات فنی و FAQ): سازگاری با سیستم‌عامل‌ها (iOS/Android/Windows)، پرداخت آسان، گارانتی بازگشت وجه.
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
    maxMessagesPerChat: 4,
    memoryWindowSize: 10,
    enforceSessionIsolation: true,
    extractPartnerProfileInfo: true,
    dynamicSessionStatePrompt: true,
    initiateGreetingOnConnect: true,
    initialGreetingText: 'سلام خوبی؟ 🌸',
    initialGreetings: ['سلام خوبی؟ 🌸', 'سلام چطوری؟', 'سلام روزت بخیر 🌸', 'سلام، خوبی؟ چه خبر؟'],
    greetingMode: 'single',
    greetingDelaySeconds: 0.8,
    enablePreExitFarewell: true,
    preExitFarewellText: 'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
    preExitFarewells: [
      'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸',
      'فعلا گلم، من یه کاری برام پیش اومد باید برم 🌹',
      'خوشحال شدم از هم‌کلامی، فعلا خداحافظ 👋',
      'من کار فوری برام پیش اومد باید برم، روزت بخیر ✨',
    ],
    farewellMode: 'single',
    farewellDelaySeconds: 1.5,
    sendPromoBeforeExitAlways: true,
    replyDelaySeconds: 1.2,
    messageAggregationDelaySeconds: 1.5,
    silenceTimeoutSeconds: 30,
    enableSilenceNudge: true,
    silenceNudgeText: 'هستی؟ 🌸',
    
    // ۱. ارسال پیام‌های چندتکه‌ای (Multi-bubble Messaging)
    enableMultiBubble: true,
    multiBubbleMaxChunks: 2,
    multiBubbleDelaySeconds: 1.5,

    // ۲. سرعت تایپ پویا و هوشمند (Dynamic Typing Speed)
    dynamicTypingSpeed: true,
    typingSpeedMsPerChar: 35,
    minTypingDelaySeconds: 1.0,
    maxTypingDelaySeconds: 6.0,

    // ۳. فیلتر سریع ربات‌های تبلیغاتی و اسپمرها (Spam / Bot Skip)
    autoSkipSpamBots: true,
    spamBotKeywords: [
      't.me/',
      'telegram.me/',
      'joinchat',
      'chat.whatsapp.com',
      'instagram.com/',
      'عضویت در کانال',
      'کانال تلگرام',
      'پست آخر کانال',
      'شارژ رایگان',
      'فروش اکانت',
      'ربات هوشمند',
      'صیغه',
      'همسریابی',
      'کارت به کارت',
      'پکیج',
      'تخفیف ویژه کانال',
      'افزایش ممبر',
      'بیا پیوی',
      'بیا کانالم',
    ],

    inappropriateKeywords: ['بلاک', 'اسپم', 'کس نگو', 'حرومزاده', 'بیناموس', 'فحش', 'گمشو', 'کسشعر', 'کص', 'کیر', 'جنده', 'حرومی', 'سکس', 'سیکتیر'],
    productPromotion: {
      enabled: true,
      productName: 'فیلترشکن پرسرعت بدون قطعی (نوا وی‌پی‌ان)',
      productDescription: 'راستی یه وی‌پی‌ان عالی دارم بدون قطعی برای اینستاگرام و یوتیوب، تست رایگان هم داره 🌸',
      imageUrl: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop&q=80',
      contactHandleOrLink: '@FastVpnSupport',
      sendMode: 'send_photo_with_caption_before_exit',
      sendAtMessageNumber: 3,
      faqItems: [
        {
          id: 'faq_1',
          question: 'قیمت و پلن‌ها چطوریه؟',
          answer: 'پلن ۱ ماهه نامحدود تک‌کاربره ۵۹ تومن و دو کاربره ۸۹ تومنه عزیزم، تخفیف تمدید هم داریم.',
          keywords: ['قیمت', 'چنده', 'تعرفه', 'پلن', 'هزینه', 'چند تومن'],
        },
        {
          id: 'faq_2',
          question: 'اکانت تست رایگان میدید؟',
          answer: 'آره گلم، داخل پشتیبانی پیام بدی یک کانفیگ تست ۱ ساعته کاملاً رایگان تقدیمت میشه.',
          keywords: ['تست', 'تست رایگان', 'امتحان', 'تستی'],
        },
        {
          id: 'faq_3',
          question: 'روی چه گوشی‌هایی کار میکنه؟',
          answer: 'روی همه گوشی‌ها آیفون (iOS)، اندروید و حتی ویندوز با نرم‌افزارهای V2rayNG و Streisand وصل میشه.',
          keywords: ['آیفون', 'اندروید', 'گوشی', 'ویندوز', 'دستگاه'],
        },
        {
          id: 'faq_4',
          question: 'نحوه پرداخت و خرید چطوریه؟',
          answer: 'کارت به کارت شتابی و کریپتو (تتر/ترون) داریم و تحویل اکانت زیر ۲ دقیقه آنی هستش.',
          keywords: ['پرداخت', 'کارت به کارت', 'خرید', 'واریز', 'حساب'],
        },
      ],
      knowledgeBaseText: 'پشتیبانی ۲۴ ساعته در تلگرام، سرورهای اختصاصی فنلاند و آلمان بدون افت پینگ و گارانتی بازگشت کامل وجه تا ۲۴ ساعت در صورت عدم رضایت.',
    },
  },
  loopForever: true,
  cooldownBetweenChatsSeconds: 4,
  stats: {
    totalChatsInitiated: 0,
    totalCompletedChats: 0,
    totalRepliesFromStrangers: 0,
    totalPromoSent: 0,
    totalInquiriesAfterPromo: 0,
    totalSpamBotsSkipped: 0,
  },
};

function normalizeAnonymousAutomatorConfig(incoming: any): AnonymousChatAutomatorConfig {
  const baseInst = defaultAnonymousAutomatorConfig.instructions;
  const incInst = incoming?.instructions || {};

  const incPromo = incInst.productPromotion || incoming?.productPromotion || {};
  const basePromo = baseInst.productPromotion || {
    enabled: true,
    productName: '',
    productDescription: '',
    imageUrl: '',
    contactHandleOrLink: '',
    sendMode: 'send_photo_with_caption_before_exit',
    sendAtMessageNumber: 3,
  };

  const mergedPromo: AnonymousProductPromotion = {
    enabled: incPromo.enabled !== undefined ? Boolean(incPromo.enabled) : basePromo.enabled,
    productName: typeof incPromo.productName === 'string' ? incPromo.productName : basePromo.productName,
    productDescription: typeof incPromo.productDescription === 'string' ? incPromo.productDescription : basePromo.productDescription,
    imageUrl: typeof incPromo.imageUrl === 'string' ? incPromo.imageUrl : basePromo.imageUrl,
    contactHandleOrLink: typeof incPromo.contactHandleOrLink === 'string' ? incPromo.contactHandleOrLink : basePromo.contactHandleOrLink,
    sendMode: incPromo.sendMode || basePromo.sendMode,
    sendAtMessageNumber: typeof incPromo.sendAtMessageNumber === 'number' ? incPromo.sendAtMessageNumber : basePromo.sendAtMessageNumber,
    aiSendBannerWithPitch: incPromo.aiSendBannerWithPitch !== undefined ? Boolean(incPromo.aiSendBannerWithPitch) : (basePromo.aiSendBannerWithPitch ?? true),
    minPhotoDelaySeconds: typeof incPromo.minPhotoDelaySeconds === 'number' ? incPromo.minPhotoDelaySeconds : (basePromo.minPhotoDelaySeconds ?? 0),
    faqItems: Array.isArray(incPromo.faqItems) ? incPromo.faqItems : (basePromo.faqItems || []),
    knowledgeBaseText: typeof incPromo.knowledgeBaseText === 'string' ? incPromo.knowledgeBaseText : (basePromo.knowledgeBaseText || ''),
  };

  const mergedInstructions: AnonymousChatInstructions = {
    systemPrompt: typeof incInst.systemPrompt === 'string' ? incInst.systemPrompt : baseInst.systemPrompt,
    maxMessagesPerChat: typeof incInst.maxMessagesPerChat === 'number' ? incInst.maxMessagesPerChat : baseInst.maxMessagesPerChat,
    autoExitOnPartnerBye: incInst.autoExitOnPartnerBye !== undefined ? Boolean(incInst.autoExitOnPartnerBye) : (baseInst.autoExitOnPartnerBye ?? true),
    memoryWindowSize: typeof incInst.memoryWindowSize === 'number' ? incInst.memoryWindowSize : (baseInst.memoryWindowSize || 10),
    enforceSessionIsolation: incInst.enforceSessionIsolation !== undefined ? Boolean(incInst.enforceSessionIsolation) : (baseInst.enforceSessionIsolation ?? true),
    extractPartnerProfileInfo: incInst.extractPartnerProfileInfo !== undefined ? Boolean(incInst.extractPartnerProfileInfo) : (baseInst.extractPartnerProfileInfo ?? true),
    dynamicSessionStatePrompt: incInst.dynamicSessionStatePrompt !== undefined ? Boolean(incInst.dynamicSessionStatePrompt) : (baseInst.dynamicSessionStatePrompt ?? true),
    
    // Multi-bubble
    enableMultiBubble: incInst.enableMultiBubble !== undefined ? Boolean(incInst.enableMultiBubble) : (baseInst.enableMultiBubble ?? true),
    multiBubbleMaxChunks: typeof incInst.multiBubbleMaxChunks === 'number' ? incInst.multiBubbleMaxChunks : (baseInst.multiBubbleMaxChunks || 2),
    multiBubbleDelaySeconds: typeof incInst.multiBubbleDelaySeconds === 'number' ? incInst.multiBubbleDelaySeconds : (baseInst.multiBubbleDelaySeconds || 1.5),

    // Dynamic Typing Speed
    dynamicTypingSpeed: incInst.dynamicTypingSpeed !== undefined ? Boolean(incInst.dynamicTypingSpeed) : (baseInst.dynamicTypingSpeed ?? true),
    typingSpeedMsPerChar: typeof incInst.typingSpeedMsPerChar === 'number' ? incInst.typingSpeedMsPerChar : (baseInst.typingSpeedMsPerChar || 35),
    minTypingDelaySeconds: typeof incInst.minTypingDelaySeconds === 'number' ? incInst.minTypingDelaySeconds : (baseInst.minTypingDelaySeconds || 1.0),
    maxTypingDelaySeconds: typeof incInst.maxTypingDelaySeconds === 'number' ? incInst.maxTypingDelaySeconds : (baseInst.maxTypingDelaySeconds || 6.0),

    // Spam / Bot Skip
    autoSkipSpamBots: incInst.autoSkipSpamBots !== undefined ? Boolean(incInst.autoSkipSpamBots) : (baseInst.autoSkipSpamBots ?? true),
    spamBotKeywords: Array.isArray(incInst.spamBotKeywords) && incInst.spamBotKeywords.length > 0 ? incInst.spamBotKeywords : (baseInst.spamBotKeywords || []),

    initiateGreetingOnConnect: incInst.initiateGreetingOnConnect !== undefined ? Boolean(incInst.initiateGreetingOnConnect) : baseInst.initiateGreetingOnConnect,
    initialGreetingText: typeof incInst.initialGreetingText === 'string' ? incInst.initialGreetingText : baseInst.initialGreetingText,
    initialGreetings: Array.isArray(incInst.initialGreetings) && incInst.initialGreetings.length > 0 ? incInst.initialGreetings : baseInst.initialGreetings,
    greetingMode: incInst.greetingMode || baseInst.greetingMode,
    greetingDelaySeconds: typeof incInst.greetingDelaySeconds === 'number' ? incInst.greetingDelaySeconds : baseInst.greetingDelaySeconds,
    enablePreExitFarewell: incInst.enablePreExitFarewell !== undefined ? Boolean(incInst.enablePreExitFarewell) : baseInst.enablePreExitFarewell,
    preExitFarewellText: typeof incInst.preExitFarewellText === 'string' ? incInst.preExitFarewellText : baseInst.preExitFarewellText,
    preExitFarewells: Array.isArray(incInst.preExitFarewells) && incInst.preExitFarewells.length > 0 ? incInst.preExitFarewells : baseInst.preExitFarewells,
    farewellMode: incInst.farewellMode || baseInst.farewellMode,
    farewellDelaySeconds: typeof incInst.farewellDelaySeconds === 'number' ? incInst.farewellDelaySeconds : baseInst.farewellDelaySeconds,
    sendPromoBeforeExitAlways: incInst.sendPromoBeforeExitAlways !== undefined ? Boolean(incInst.sendPromoBeforeExitAlways) : baseInst.sendPromoBeforeExitAlways,
    replyDelaySeconds: typeof incInst.replyDelaySeconds === 'number' ? incInst.replyDelaySeconds : baseInst.replyDelaySeconds,
    messageAggregationDelaySeconds: typeof incInst.messageAggregationDelaySeconds === 'number' ? incInst.messageAggregationDelaySeconds : baseInst.messageAggregationDelaySeconds,
    silenceTimeoutSeconds: typeof incInst.silenceTimeoutSeconds === 'number' ? incInst.silenceTimeoutSeconds : baseInst.silenceTimeoutSeconds,
    enableSilenceNudge: incInst.enableSilenceNudge !== undefined ? Boolean(incInst.enableSilenceNudge) : baseInst.enableSilenceNudge,
    silenceNudgeText: typeof incInst.silenceNudgeText === 'string' ? incInst.silenceNudgeText : baseInst.silenceNudgeText,
    inappropriateKeywords: Array.isArray(incInst.inappropriateKeywords) ? incInst.inappropriateKeywords : baseInst.inappropriateKeywords,
    customIgnoredSystemPhrases: Array.isArray(incInst.customIgnoredSystemPhrases) ? incInst.customIgnoredSystemPhrases : baseInst.customIgnoredSystemPhrases,
    productPromotion: mergedPromo,
  };

  const rawBots = Array.isArray(incoming?.bots) && incoming.bots.length > 0
    ? incoming.bots
    : defaultAnonymousAutomatorConfig.bots;

  const normalizedBots: AnonymousBotProfile[] = rawBots.map((b: any) => ({
    id: b.id || `bot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: b.name || 'ربات ناشناس',
    botUsername: b.botUsername || '@bot',
    startCommand: b.startCommand || '/start',
    entrySteps: Array.isArray(b.entrySteps) ? b.entrySteps.map((s: any, idx: number) => ({
      id: s.id || `entry_${idx}`,
      label: s.label || '',
      buttonLocation: s.buttonLocation || 'reply_keyboard',
      triggerMode: s.triggerMode || 'after_delay',
      triggerKeyword: s.triggerKeyword || '',
      delaySeconds: typeof s.delaySeconds === 'number' ? s.delaySeconds : 1.0,
      matchMode: s.matchMode || 'exact',
      autoConfirmPopup: Boolean(s.autoConfirmPopup),
    })) : [],
    connectionKeywords: Array.isArray(b.connectionKeywords) ? b.connectionKeywords : [],
    exitSteps: Array.isArray(b.exitSteps) ? b.exitSteps.map((s: any, idx: number) => ({
      id: s.id || `exit_${idx}`,
      label: s.label === '❌ پایان چت' ? 'پایان چت' : (s.label || ''),
      buttonLocation: s.buttonLocation || 'reply_keyboard',
      triggerMode: s.triggerMode || 'after_delay',
      triggerKeyword: s.triggerKeyword || '',
      delaySeconds: typeof s.delaySeconds === 'number' ? s.delaySeconds : 1.0,
      matchMode: s.matchMode || 'exact',
      autoConfirmPopup: Boolean(s.autoConfirmPopup),
    })) : [],
    partnerDisconnectedKeywords: Array.isArray(b.partnerDisconnectedKeywords) ? b.partnerDisconnectedKeywords : [],
    notInChatKeywords: Array.isArray(b.notInChatKeywords) ? b.notInChatKeywords : [],
    alreadyInChatKeywords: Array.isArray(b.alreadyInChatKeywords) ? b.alreadyInChatKeywords : [],
    autoDismissPopups: b.autoDismissPopups !== undefined ? Boolean(b.autoDismissPopups) : true,
    popupOkKeywords: Array.isArray(b.popupOkKeywords) ? b.popupOkKeywords : ['OK', 'ok', 'تایید', 'بله'],
    fuzzyButtonMatching: b.fuzzyButtonMatching !== undefined ? Boolean(b.fuzzyButtonMatching) : true,
    delayBetweenButtonsMs: typeof b.delayBetweenButtonsMs === 'number' ? b.delayBetweenButtonsMs : 1200,
    enabled: b.enabled !== undefined ? Boolean(b.enabled) : true,
    notes: b.notes || '',
    customIgnoredKeywords: Array.isArray(b.customIgnoredKeywords) ? b.customIgnoredKeywords : [],
  }));

  const selBotId = incoming?.selectedBotId && normalizedBots.some((b) => b.id === incoming.selectedBotId)
    ? incoming.selectedBotId
    : normalizedBots[0]?.id || 'bot_hypergap';

  return {
    isActive: Boolean(incoming?.isActive),
    selectedBotId: selBotId,
    bots: normalizedBots,
    instructions: mergedInstructions,
    loopForever: incoming?.loopForever !== undefined ? Boolean(incoming.loopForever) : true,
    cooldownBetweenChatsSeconds: typeof incoming?.cooldownBetweenChatsSeconds === 'number' ? incoming.cooldownBetweenChatsSeconds : 3,
    stats: {
      totalChatsInitiated: Number(incoming?.stats?.totalChatsInitiated) || 0,
      totalRepliesFromStrangers: Number(incoming?.stats?.totalRepliesFromStrangers) || 0,
      lastActiveAt: incoming?.stats?.lastActiveAt || undefined,
    },
  };
}

// Default initial state
let appState: AppState = {
  credentials: {
    apiId: '22239448',
    apiHash: '18f904bed04337c78b82e6faf8575259',
    phoneNumber: '',
    sessionString: '',
    isConnected: false,
  },
  groups: [
    {
      id: 'group_user_test',
      title: 'ارسال مستقیم به کاربری @amin_moghadasi',
      usernameOrLink: '@amin_moghadasi',
      isActive: true,
      memberCount: 1,
      status: 'joined',
      category: 'تست مستقیم',
      lastPostedAt: undefined,
    },
    {
      id: 'group_1',
      title: 'گروه خرید و فروش تهران (نمونه)',
      usernameOrLink: '@TehranShoppingGroup',
      isActive: true,
      memberCount: 14200,
      status: 'joined',
      category: 'بازارچه',
      lastPostedAt: undefined,
    },
    {
      id: 'group_2',
      title: 'نیازمندی‌ها و تبادل کالا',
      usernameOrLink: 't.me/Niazmandiha_Iran',
      isActive: true,
      memberCount: 8900,
      status: 'joined',
      category: 'عمومی',
      lastPostedAt: undefined,
    },
    {
      id: 'group_3',
      title: 'بازار دیجیتال و پوشاک',
      usernameOrLink: '@DigitalBazar_Official',
      isActive: false,
      memberCount: 22000,
      status: 'pending',
      category: 'پوشاک و دیجیتال',
      lastPostedAt: undefined,
    }
  ],
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
  logs: [
    {
      id: 'log_1',
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'سامانه مدیریت ربات تبلیغات تلگرام آماده به کار است.',
    }
  ],
  anonymousAutomator: defaultAnonymousAutomatorConfig,
  anonymousSessionHistory: [],
  currentTestRun: null,
  previousTestRuns: [],
};

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to save data file:', e);
    return false;
  }
}

// Load existing state if available at startup
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    appState = {
      ...appState,
      ...parsed,
      credentials: {
        ...appState.credentials,
        ...(parsed.credentials || {}),
      },
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : (appState.accounts || []),
      scheduler: {
        ...appState.scheduler,
        ...(parsed.scheduler || {}),
      },
      groups: Array.isArray(parsed.groups) ? parsed.groups : (appState.groups || []),
      campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : (appState.campaigns || []),
      logs: Array.isArray(parsed.logs) ? parsed.logs : (appState.logs || []),
      monitoringReports: Array.isArray(parsed.monitoringReports) ? parsed.monitoringReports : [],
      lastBroadcastReport: parsed.lastBroadcastReport || appState.lastBroadcastReport,
      broadcastHistory: parsed.broadcastHistory || appState.broadcastHistory || [],
      anonymousAutomator: normalizeAnonymousAutomatorConfig(parsed.anonymousAutomator),
      anonymousSessionHistory: Array.isArray(parsed.anonymousSessionHistory) ? parsed.anonymousSessionHistory : [],
      currentTestRun: parsed.currentTestRun || null,
      previousTestRuns: Array.isArray(parsed.previousTestRuns) ? parsed.previousTestRuns : [],
    };
    saveData();
    if (!appState.credentials.apiId || appState.credentials.apiId === '22239448') {
      appState.credentials.apiId = DEFAULT_API_ID;
      appState.credentials.apiHash = DEFAULT_API_HASH;
    }
    console.log('✅ Loaded saved app state from telegram_promoter_data.json. Telegram Connected:', appState.credentials.isConnected);
  } catch (e) {
    console.error('Failed to load data file:', e);
  }
} else {
  // Save baseline state immediately on initial startup
  saveData();
  console.log('✅ Created initial telegram_promoter_data.json storage file.');
}

// Global Execution Mutex & Rotational Account State
let isBroadcastRunning = false;
let isBroadcastCancellationRequested = false;
let globalAccountIndex = 0;

// Multi-Account Migration & Synchronization
function syncAccountsState() {
  if (!appState.accounts || !Array.isArray(appState.accounts)) {
    appState.accounts = [];
  }

  // Sync credentials into accounts list if logged in
  if (appState.credentials.isConnected && appState.credentials.sessionString) {
    const existingIndex = appState.accounts.findIndex(
      a => a.phoneNumber === appState.credentials.phoneNumber || a.sessionString === appState.credentials.sessionString
    );
    if (existingIndex === -1) {
      const primaryAcc = {
        id: 'acc_primary_' + Date.now(),
        phoneNumber: appState.credentials.phoneNumber || 'حساب اصلی',
        apiId: appState.credentials.apiId,
        apiHash: appState.credentials.apiHash,
        sessionString: appState.credentials.sessionString,
        userProfile: appState.credentials.userProfile,
        isActive: true,
        dailySentCount: 0,
        status: 'active' as const,
      };
      appState.accounts.unshift(primaryAcc);
      appState.activeAccountId = primaryAcc.id;
    } else {
      const acc = appState.accounts[existingIndex];
      acc.sessionString = appState.credentials.sessionString;
      acc.userProfile = appState.credentials.userProfile || acc.userProfile;
      acc.apiId = appState.credentials.apiId || acc.apiId;
      acc.apiHash = appState.credentials.apiHash || acc.apiHash;
      if (!appState.activeAccountId) {
        appState.activeAccountId = acc.id;
      }
    }
  }

  if (!appState.activeAccountId && appState.accounts.length > 0) {
    appState.activeAccountId = appState.accounts[0].id;
  }
}

// Initial Sync
syncAccountsState();

// Helper: Daily Counters Reset
function checkAndResetDailyCounters() {
  const todayStr = new Date().toISOString().split('T')[0];
  if (appState.scheduler.dailyResetDate !== todayStr) {
    appState.scheduler.dailyResetDate = todayStr;
    appState.scheduler.dailySentCount = 0;
    if (appState.accounts) {
      for (const acc of appState.accounts) {
        acc.dailySentCount = 0;
      }
    }
    saveData();
    console.log(`[DailyReset] Daily sending limits reset for date ${todayStr}`);
  }
}

// Helper: Check Night Mode (01:00 AM to 07:00 AM pause)
function isNightModeActive(): boolean {
  if (!appState.scheduler.nightModePause) return false;
  const currentHour = new Date().getHours();
  const startHour = appState.scheduler.nightModeStartHour ?? 1; // 01:00 AM
  const endHour = appState.scheduler.nightModeEndHour ?? 7;   // 07:00 AM
  
  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  } else {
    // Overnight range e.g. 23 to 6
    return currentHour >= startHour || currentHour < endHour;
  }
}

function addLog(level: 'info' | 'success' | 'warning' | 'error', message: string, groupTitle?: string, details?: string, campaignTitle?: string) {
  const newLog: LogEntry = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    level,
    message,
    groupTitle,
    details,
    campaignTitle,
  };
  appState.logs.unshift(newLog);
  // Keep last 100 logs
  if (appState.logs.length > 100) {
    appState.logs = appState.logs.slice(0, 100);
  }
  saveData();
}

// Active GramJS Client Instances Pool for Multi-Account
let activeTgClient: any = null;
const accountClientsMap = new Map<string, any>();

async function getOrInitTgClient() {
  await loadGramJS();
  if (activeTgClient && activeTgClient.connected) {
    return activeTgClient;
  }
  if (!appState.credentials.apiId || !appState.credentials.apiHash || !appState.credentials.sessionString || !TelegramClient || !StringSession) {
    return null;
  }
  try {
    const apiId = parseInt(appState.credentials.apiId || DEFAULT_API_ID, 10);
    const apiHash = appState.credentials.apiHash || DEFAULT_API_HASH;
    const stringSession = new StringSession(appState.credentials.sessionString);
    
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 3,
      useWSS: false,
      timeout: 25000,
      autoReconnect: true,
      deviceModel: 'Desktop',
      systemVersion: 'Windows 10',
      appVersion: '4.16.8',
      langCode: 'en',
      systemLangCode: 'en',
    });
    
    await client.connect();
    
    // Check if session is actually authorized
    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      console.warn('Telegram session is not authorized');
      appState.credentials.isConnected = false;
      appState.credentials.sessionString = '';
      appState.credentials.userProfile = undefined;
      if (activeTgClient) {
        try { activeTgClient.disconnect(); } catch (e) {}
      }
      activeTgClient = null;
      saveData();
      return null;
    }

    activeTgClient = client;
    return client;
  } catch (err: any) {
    const errMsg = String(err?.errorMessage || err?.message || err);
    console.error('Telegram MTProto connect error:', errMsg);

    // Handle invalid, revoked, or duplicated session keys
    if (
      errMsg.includes('AUTH_KEY_DUPLICATED') ||
      errMsg.includes('AUTH_KEY_UNREGISTERED') ||
      errMsg.includes('AUTH_KEY_INVALID') ||
      errMsg.includes('SESSION_REVOKED') ||
      errMsg.includes('SESSION_EXPIRED') ||
      errMsg.includes('406')
    ) {
      console.warn(`[MTProto Auth Reset] Invalid/Duplicated session key detected: ${errMsg}. Resetting session credentials.`);
      appState.credentials.isConnected = false;
      appState.credentials.sessionString = '';
      appState.credentials.userProfile = undefined;
      if (activeTgClient) {
        try { activeTgClient.disconnect(); } catch (e) {}
        activeTgClient = null;
      }
      addLog('warning', 'نشست تلگرام شما منقضی یا از دستگاه دیگری استفاده شده است (AUTH_KEY_DUPLICATED). لطفاً از طریق منوی تنظیمات اتصال، مجدداً کد تایید تلگرام بگیرید.');
      saveData();
    }
    return null;
  }
}

async function getOrInitClientForAccount(account: any) {
  if (!account || !account.sessionString) return null;
  
  if (accountClientsMap.has(account.id)) {
    const cachedClient = accountClientsMap.get(account.id);
    if (cachedClient && cachedClient.connected) {
      return cachedClient;
    }
  }

  await loadGramJS();
  if (!TelegramClient || !StringSession) return null;

  try {
    const apiId = parseInt(account.apiId || appState.credentials.apiId || DEFAULT_API_ID, 10);
    const apiHash = account.apiHash || appState.credentials.apiHash || DEFAULT_API_HASH;
    const stringSession = new StringSession(account.sessionString);

    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 3,
      useWSS: false,
      timeout: 25000,
      autoReconnect: true,
      deviceModel: 'Desktop',
      systemVersion: 'Windows 10',
      appVersion: '4.16.8',
      langCode: 'en',
      systemLangCode: 'en',
    });

    await client.connect();

    const isAuth = await client.isUserAuthorized();
    if (!isAuth) {
      console.warn(`Account ${account.phoneNumber} session unauthorized`);
      account.status = 'error';
      account.statusMessage = 'نشست منقضی شده است.';
      accountClientsMap.delete(account.id);
      saveData();
      return null;
    }

    accountClientsMap.set(account.id, client);
    return client;
  } catch (err: any) {
    const errMsg = String(err?.errorMessage || err?.message || err);
    console.error(`Client init error for account ${account.phoneNumber}:`, errMsg);

    if (
      errMsg.includes('AUTH_KEY_DUPLICATED') ||
      errMsg.includes('AUTH_KEY_UNREGISTERED') ||
      errMsg.includes('AUTH_KEY_INVALID') ||
      errMsg.includes('SESSION_REVOKED') ||
      errMsg.includes('SESSION_EXPIRED') ||
      errMsg.includes('406')
    ) {
      account.status = 'error';
      account.statusMessage = 'نشست تلگرام نامعتبر یا تکراری (AUTH_KEY_DUPLICATED) است.';
      account.isActive = false;
      accountClientsMap.delete(account.id);
      if (appState.activeAccountId === account.id || appState.credentials.phoneNumber === account.phoneNumber) {
        appState.credentials.isConnected = false;
        appState.credentials.sessionString = '';
        appState.credentials.userProfile = undefined;
      }
      saveData();
    }
    return null;
  }
}


// Global tracker for GramJS FloodWait on ResolveUsername
let resolveUsernameFloodWaitUntil = 0;

function parseFloodWaitSeconds(err: any): number | null {
  if (!err) return null;
  const msg = String(err.errorMessage || err.message || err);
  const match = msg.match(/A wait of (\d+) seconds is required/i) || msg.match(/FLOOD_WAIT_?(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}

function handleGramJsFloodWait(err: any): number | null {
  const secs = parseFloodWaitSeconds(err);
  if (secs !== null && secs > 0) {
    const hours = (secs / 3600).toFixed(1);
    const msg = String(err.errorMessage || err.message || err);
    if (msg.includes('ResolveUsername') || msg.includes('contacts.ResolveUsername')) {
      resolveUsernameFloodWaitUntil = Date.now() + secs * 1000;
      console.log(`[FloodWait] contacts.ResolveUsername locked for ${secs}s (${hours}h)`);
    } else {
      console.log(`[FloodWait] GramJS RPC locked for ${secs}s (${hours}h)`);
    }
    return secs;
  }
  return null;
}

// Helper Function: Normalize Telegram Bot Token (fixes reversed digits:letters strings)
function normalizeBotToken(rawToken?: string): string {
  if (!rawToken) return '';
  let token = rawToken.trim();
  // If token was reversed (e.g. AAHLujZ1...:8896745743), auto-swap back to 8896745743:AAHLujZ1...
  if (/^[a-zA-Z0-9_-]+:\d+$/.test(token)) {
    const parts = token.split(':');
    token = `${parts[1]}:${parts[0]}`;
  }
  return token;
}

// Helper Function: Resolve @username or link to numeric ID for Bot API
async function resolveTargetId(botToken: string, target: string): Promise<string> {
  let clean = target.trim();
  if (clean.includes('t.me/')) {
    clean = clean.split('t.me/')[1].split('/')[0].split('?')[0];
  }
  if (!clean.startsWith('@') && !clean.startsWith('-') && !/^\d+$/.test(clean)) {
    clean = '@' + clean;
  }

  // If already numeric ID (e.g. 12345678 or -100123456789) or starts with @
  // Telegram Bot API natively accepts @username (e.g. @amin_moghadasi or @my_channel) directly in chat_id!
  if (/^-?\d+$/.test(clean) || clean.startsWith('@')) {
    // Check if Bot API getUpdates has a numeric ID recorded for private user messages
    if (clean.startsWith('@')) {
      const usernameWithoutAt = clean.replace(/^@/, '').toLowerCase();
      try {
        const cleanTok = normalizeBotToken(botToken);
        const res = await fetch(`https://api.telegram.org/bot${cleanTok}/getUpdates`);
        const json = await res.json();
        if (json.ok && Array.isArray(json.result)) {
          for (const update of json.result.reverse()) { // latest updates first
            const msg = update.message || update.edited_message || update.my_chat_member?.chat || update.chat_member?.chat;
            if (msg) {
              const fromUser = msg.from?.username?.toLowerCase();
              const chatUser = msg.chat?.username?.toLowerCase();
              if (fromUser === usernameWithoutAt || chatUser === usernameWithoutAt) {
                const numericId = String(msg.chat?.id || msg.from?.id);
                if (numericId) {
                  return numericId;
                }
              }
            }
          }
        }
      } catch (err) {}
    }
    return clean;
  }

  return clean;
}

// Helper Function: Telegram Bot API direct sender (100% reliable HTTPS fallback)
function markdownToHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>');
}

async function getBotInfo(botToken: string): Promise<{ ok: boolean; username?: string; name?: string }> {
  try {
    const cleanTok = normalizeBotToken(botToken);
    const res = await fetch(`https://api.telegram.org/bot${cleanTok}/getMe`);
    const json = await res.json();
    if (json.ok && json.result) {
      return { ok: true, username: json.result.username, name: json.result.first_name };
    }
  } catch (e) {}
  return { ok: false };
}

async function sendViaBotApi(botToken: string, chatTarget: string, textMessage: string, imageUrl?: string) {
  const cleanTok = normalizeBotToken(botToken);
  const targetId = await resolveTargetId(cleanTok, chatTarget);

  const baseUrl = `https://api.telegram.org/bot${cleanTok}`;
  const htmlText = markdownToHtml(textMessage);

  const sendRequest = async (endpoint: 'sendPhoto' | 'sendMessage', bodyObj: Record<string, any>) => {
    // 1st attempt: HTML parse mode
    let res = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...bodyObj, parse_mode: 'HTML' }),
    });
    let json = await res.json();

    // If parse error, 2nd attempt: Plain text without parse_mode
    if (!json.ok && json.description && (json.description.includes('parse') || json.description.includes('entity'))) {
      const { parse_mode, ...plainBody } = bodyObj;
      res = await fetch(`${baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plainBody),
      });
      json = await res.json();
    }

    return json;
  };

  let json: any;
  if (imageUrl && imageUrl.startsWith('http')) {
    json = await sendRequest('sendPhoto', {
      chat_id: targetId,
      photo: imageUrl,
      caption: htmlText,
    });
  } else {
    json = await sendRequest('sendMessage', {
      chat_id: targetId,
      text: htmlText,
    });
  }

  if (!json.ok) {
    const desc = json.description || '';
    const botInfo = await getBotInfo(cleanTok);
    const botUsername = botInfo.username ? `@${botInfo.username}` : 'ربات تلگرام شما';

    if (desc.includes('chat not found') || desc.includes("bot can't initiate conversation") || desc.includes('bot can\'t send messages to bots')) {
      throw new Error(
        `امکان ارسال مستقیم به آیدی شخصی (${chatTarget}) با ربات وجود ندارد تا زمانی که شناسه عددی شما مشخص شود.\n\n👇 **راه حل:**\n۱. وارد ربات ${botUsername} شوید و یک پیام متنی کوتاه (مثلاً سلام) بفرستید تا شناسه چت شما ثبت گردد.\n۲. سپس دوباره دکمه «تست ارسال» را بزنید (یا آیدی یک گروه/کانال عمومی مانند @my_group را وارد کنید).`
      );
    } else if (desc.includes('bot was blocked by the user')) {
      throw new Error(`ربات ${botUsername} توسط این کاربر بلاک شده است.`);
    } else if (desc.includes('not a member') || desc.includes('bot is not in the chat')) {
      throw new Error(`ربات ${botUsername} هنوز عضو گروه/کانال ${targetId} نیست. اکانت شما به‌صورت اتوماتیک ربات را به گروه دعوت می‌کند؛ یا می‌توانید ربات ${botUsername} را دستی به گروه اضافه فرمایید.`);
    } else if (desc.includes('not enough rights') || desc.includes('FORBIDDEN') || desc.includes('administrator')) {
      throw new Error(`ربات ${botUsername} دسترسی لازم برای ارسال پیام در ${targetId} را ندارد.`);
    } else if (desc.includes('Unauthorized') || desc.includes('invalid token')) {
      throw new Error('توکن ربات تلگرام نامعتبر است. لطفاً توکن صحیح دریافت شده از BotFather@ را وارد کنید.');
    } else {
      throw new Error(`خطای تلگرام: ${desc}`);
    }
  }

  return json;
}

// Helper Function: Ensure Bot API Bot is invited and present in the group via UserBot
async function ensureBotInGroup(client: any, peer: any, botToken: string): Promise<{ success: boolean; botUsername?: string }> {
  if (!client || !peer || !botToken) return { success: false };
  try {
    await loadGramJS();
    const cleanTok = normalizeBotToken(botToken);
    const botInfo = await getBotInfo(cleanTok);
    if (!botInfo.ok || !botInfo.username) return { success: false };

    const botUsername = botInfo.username;
    let botEntity: any = null;

    if (resolveUsernameFloodWaitUntil > Date.now()) {
      console.log(`[ensureBotInGroup] ResolveUsername is on FloodWait, skipping bot entity lookup for @${botUsername}`);
      return { success: false, botUsername };
    }

    try {
      botEntity = await client.getEntity('@' + botUsername);
    } catch (e: any) {
      handleGramJsFloodWait(e);
      console.log(`[ensureBotInGroup] Could not resolve bot entity @${botUsername}:`, e.message || e);
      return { success: false, botUsername };
    }

    if (!botEntity) return { success: false, botUsername };

    const isChannel = peer.className === 'Channel' || peer._ === 'channel' || peer.broadcast || peer.megagroup;

    try {
      if (isChannel && Api && Api.channels) {
        await client.invoke(new Api.channels.InviteToChannel({
          channel: peer,
          users: [botEntity]
        }));
        console.log(`[ensureBotInGroup] Successfully invited @${botUsername} to channel/supergroup via UserBot.`);
        addLog('info', `[عضویت خودکار ربات] ربات @${botUsername} توسط اکانت شما با موفقیت به گروه دعوت شد.`);
      } else if (Api && Api.messages) {
        const chatId = peer.id || peer.chatId || peer;
        await client.invoke(new Api.messages.AddChatUser({
          chatId: chatId,
          userId: botEntity,
          fwdLimit: 0
        }));
        console.log(`[ensureBotInGroup] Successfully added @${botUsername} to chat via UserBot.`);
        addLog('info', `[عضویت خودکار ربات] ربات @${botUsername} توسط اکانت شما به گروه اضافه گردید.`);
      }
      return { success: true, botUsername };
    } catch (inviteErr: any) {
      const msg = String(inviteErr.errorMessage || inviteErr.message || inviteErr);
      if (msg.includes('USER_ALREADY_PARTICIPANT')) {
        return { success: true, botUsername };
      }
      console.log(`[ensureBotInGroup] Invite notice for @${botUsername}:`, msg);
      return { success: false, botUsername };
    }
  } catch (err: any) {
    console.log('[ensureBotInGroup] Exception:', err.message || err);
    return { success: false };
  }
}

// REST API ROUTES

// 1. Get complete state
app.get('/api/state', (req, res) => {
  appState.activeAnonymousSession = activeAnonChatSession || null;
  res.json(appState);
});

// 1b. Guaranteed Real-time 100% Save All Endpoint
app.post('/api/save-all', (req, res) => {
  const incomingUpdates = req.body;
  if (incomingUpdates && typeof incomingUpdates === 'object' && Object.keys(incomingUpdates).length > 0) {
    if (incomingUpdates.scheduler) {
      appState.scheduler = { ...appState.scheduler, ...incomingUpdates.scheduler };
    }
    if (Array.isArray(incomingUpdates.groups)) {
      appState.groups = incomingUpdates.groups;
    }
    if (Array.isArray(incomingUpdates.campaigns)) {
      appState.campaigns = incomingUpdates.campaigns;
    }
    if (incomingUpdates.anonymousAutomator) {
      appState.anonymousAutomator = normalizeAnonymousAutomatorConfig({
        ...appState.anonymousAutomator,
        ...incomingUpdates.anonymousAutomator,
        instructions: {
          ...(appState.anonymousAutomator?.instructions || {}),
          ...(incomingUpdates.anonymousAutomator?.instructions || {}),
          productPromotion: {
            ...(appState.anonymousAutomator?.instructions?.productPromotion || {}),
            ...(incomingUpdates.anonymousAutomator?.instructions?.productPromotion || {}),
          },
        },
      });
    }
  }

  const ok = saveData();
  const savedAt = new Date().toISOString();
  addLog('success', '✅ تمام اطلاعات، ربات‌های چت ناشناس، کمپین‌ها و تنظیمات با موفقیت ۱۰۰٪ در دیسک سرور ذخیره شد.');

  res.json({
    success: ok,
    timestamp: savedAt,
    message: 'تمام اطلاعات، پرامپت‌ها، محصولات و تنظیمات با موفقیت ذخیره شدند.',
    state: appState,
  });
});

// 1c. Complete Backup Restore Endpoint (بازیابی ۱۰۰٪ فایل پشتیبان)
app.post('/api/restore-backup', (req, res) => {
  const backupData = req.body;
  if (!backupData || typeof backupData !== 'object') {
    res.status(400).json({ error: 'داده‌های فایل پشتیبان معتبر نمی‌باشد.' });
    return;
  }

  try {
    appState = {
      ...appState,
      ...backupData,
      credentials: {
        ...appState.credentials,
        ...(backupData.credentials || {}),
      },
      accounts: Array.isArray(backupData.accounts) ? backupData.accounts : (appState.accounts || []),
      scheduler: {
        ...appState.scheduler,
        ...(backupData.scheduler || {}),
      },
      groups: Array.isArray(backupData.groups) ? backupData.groups : (appState.groups || []),
      campaigns: Array.isArray(backupData.campaigns) ? backupData.campaigns : (appState.campaigns || []),
      logs: Array.isArray(backupData.logs) ? backupData.logs : (appState.logs || []),
      anonymousAutomator: backupData.anonymousAutomator
        ? normalizeAnonymousAutomatorConfig(backupData.anonymousAutomator)
        : appState.anonymousAutomator,
    };

    saveData();
    addLog('success', '✅ فایل پشتیبان کامل با موفقیت بارگذاری و در سیستم بازیابی و فریز شد.');
    res.json({ success: true, message: 'فایل پشتیبان با موفقیت بازیابی شد.', state: appState });
  } catch (err: any) {
    console.error('Backup restore error:', err);
    res.status(500).json({ error: 'خطا در اعمال فایل پشتیبان: ' + (err?.message || err) });
  }
});

// 1d. Download complete backup JSON
app.get('/api/download-backup', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="telegram_promoter_backup_${Date.now()}.json"`);
  res.send(JSON.stringify(appState, null, 2));
});

// 2. Credentials save
app.post('/api/credentials/save', async (req, res) => {
  const { apiId, apiHash, phoneNumber, botToken } = req.body;

  if (botToken !== undefined) {
    appState.credentials.botToken = normalizeBotToken(String(botToken));
  }
  if (apiId !== undefined && String(apiId).trim() !== '') {
    appState.credentials.apiId = String(apiId).trim();
  }
  if (apiHash !== undefined && String(apiHash).trim() !== '') {
    appState.credentials.apiHash = String(apiHash).trim();
  }
  if (phoneNumber !== undefined && String(phoneNumber).trim() !== '') {
    appState.credentials.phoneNumber = String(phoneNumber).trim();
  }

  saveData();
  addLog('info', `تنظیمات اتصال و توکن ربات تلگرام با موفقیت ذخیره شد.`);

  res.json({ success: true, credentials: appState.credentials });
});

// 3. Send Telegram Phone Code (OTP)
app.post('/api/credentials/send-code', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    res.status(400).json({ error: 'شماره تلفن الزامی است' });
    return;
  }

  const cleanPhone = cleanPhoneNumber(phoneNumber);
  if (!cleanPhone || cleanPhone.length < 8) {
    res.status(400).json({ error: 'شماره تلفن وارد شده نامعتبر است. فرمت صحیح: 989123456789+' });
    return;
  }

  appState.credentials.phoneNumber = cleanPhone;
  if (!appState.credentials.apiId) {
    appState.credentials.apiId = DEFAULT_API_ID;
    appState.credentials.apiHash = DEFAULT_API_HASH;
  }
  saveData();

  const apiIdNum = parseInt(appState.credentials.apiId || DEFAULT_API_ID, 10);
  const apiHash = appState.credentials.apiHash || DEFAULT_API_HASH;

  if (!apiIdNum || !apiHash) {
    res.status(400).json({ error: 'ابتدا API ID و API Hash را ذخیره کنید' });
    return;
  }

  try {
    await loadGramJS();
    if (!TelegramClient || !StringSession) {
      res.status(500).json({ error: 'کتابخانه تلگرام بارگذاری نشد.' });
      return;
    }

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiIdNum, apiHash, {
      connectionRetries: 3,
      useWSS: false,
      timeout: 25000,
      autoReconnect: true,
      deviceModel: 'Desktop',
      systemVersion: 'Windows 10',
      appVersion: '4.16.8',
      langCode: 'en',
      systemLangCode: 'en',
    });
    
    // Connect with 20s timeout
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 20000))
    ]);

    const sendCodeResult = await client.sendCode(
      {
        apiId: apiIdNum,
        apiHash,
      },
      cleanPhone
    );

    appState.credentials.phoneCodeHash = sendCodeResult.phoneCodeHash;
    appState.credentials.sessionString = client.session.save() as unknown as string;
    activeTgClient = client;
    
    saveData();
    addLog('info', `کد تایید تلگرام به شماره ${cleanPhone} ارسال گردید.`);
    res.json({ success: true, message: 'کد تایید تلگرام به حساب تلگرام شما ارسال شد.' });
    return;
  } catch (err: any) {
    console.error('Telegram sendCode error:', err);
    const friendlyError = translateTgError(err);
    addLog('error', `خطا در ارسال کد تلگرام: ${friendlyError}`);
    res.status(400).json({ error: friendlyError });
    return;
  }
});

// 4. Verify Code & Complete Telegram Sign In
app.post('/api/credentials/verify-code', async (req, res) => {
  const { phoneCode, password } = req.body;
  const cleanCode = phoneCode ? String(phoneCode).trim() : '';
  const cleanPass = password ? String(password).trim() : '';

  if (!cleanCode) {
    res.status(400).json({ error: 'کد تایید ۵ رقمی الزامی است' });
    return;
  }

  const { phoneNumber, apiId, apiHash, phoneCodeHash, sessionString } = appState.credentials;

  if (!apiId || !apiHash || !phoneNumber) {
    res.status(400).json({ error: 'اطلاعات اولیه حساب (API ID / شماره) یافت نشد. لطفاً مراحل را از ابتدا تکرار کنید.' });
    return;
  }

  try {
    await loadGramJS();
    let client = activeTgClient;
    const apiIdNum = parseInt(apiId, 10);

    if (!client || !client.connected) {
      const stringSession = new StringSession(sessionString || '');
      client = new TelegramClient(stringSession, apiIdNum, apiHash, {
        connectionRetries: 3,
        useWSS: false,
      });
      await client.connect();
      activeTgClient = client;
    }

    // 1. First attempt direct auth.signIn MTProto call
    try {
      if (Api && Api.auth && Api.auth.SignIn) {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: phoneNumber,
            phoneCodeHash: phoneCodeHash || '',
            phoneCode: cleanCode,
          })
        );
      } else {
        throw new Error('کتابخانه تلگرام بارگذاری نشده است');
      }
    } catch (signInErr: any) {
      const msg = String(signInErr.errorMessage || signInErr.message || signInErr);
      
      if (msg.includes('SESSION_PASSWORD_NEEDED')) {
        if (cleanPass) {
          await verify2FAPassword(client, cleanPass, apiIdNum, apiHash);
        } else {
          res.status(400).json({
            error: 'رمز عبور ۲ مرحله‌ای (2FA) تلگرام شما فعال است. لطفاً رمز عبور را در کادر مربوطه وارد نمایید.',
            requiresPassword: true,
          });
          return;
        }
      } else {
        throw signInErr;
      }
    }

    // 2. Auth successful - retrieve user profile and save session
    const me = await client.getMe();
    const savedSession = client.session.save() as unknown as string;

    const userProfile = {
      id: String(me.id),
      firstName: me.firstName || 'کاربر تلگرام',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone ? (me.phone.startsWith('+') ? me.phone : '+' + me.phone) : phoneNumber,
    };

    appState.credentials.sessionString = savedSession;
    appState.credentials.isConnected = true;
    appState.credentials.userProfile = userProfile;
    appState.credentials.phoneNumber = userProfile.phone;

    // Register or update in persistent accounts list
    if (!appState.accounts || !Array.isArray(appState.accounts)) {
      appState.accounts = [];
    }

    const cleanNum = userProfile.phone;
    const existingIndex = appState.accounts.findIndex(
      (a) => a.phoneNumber === cleanNum || a.sessionString === savedSession
    );

    if (existingIndex >= 0) {
      appState.accounts[existingIndex].sessionString = savedSession;
      appState.accounts[existingIndex].userProfile = userProfile;
      appState.accounts[existingIndex].apiId = apiId;
      appState.accounts[existingIndex].apiHash = apiHash;
      appState.accounts[existingIndex].status = 'active';
      appState.accounts[existingIndex].isActive = true;
      appState.activeAccountId = appState.accounts[existingIndex].id;
    } else {
      const newAcc: TelegramAccount = {
        id: 'acc_' + Date.now(),
        phoneNumber: cleanNum,
        apiId,
        apiHash,
        sessionString: savedSession,
        userProfile,
        isActive: true,
        dailySentCount: 0,
        status: 'active',
      };
      appState.accounts.push(newAcc);
      appState.activeAccountId = newAcc.id;
    }

    saveData();
    addLog('success', `ورود موفقیت‌آمیز به حساب تلگرام (@${me.username || me.firstName}) انجام شد و حساب در حافظه دائمی ذخیره گردید.`);
    res.json({ success: true, credentials: appState.credentials, accounts: appState.accounts, activeAccountId: appState.activeAccountId });
    return;
  } catch (err: any) {
    console.error('Verify code Telegram error:', err);
    const msg = String(err.errorMessage || err.message || err);

    if (msg.includes('SESSION_PASSWORD_NEEDED')) {
      res.status(400).json({ 
        error: 'رمز عبور ۲ مرحله‌ای (2FA) تلگرام شما فعال است. لطفاً رمز عبور حساب خود را در کادر مربوطه وارد نمایید.',
        requiresPassword: true 
      });
      return;
    }
    
    let userErr = 'خطا در تایید کد تلگرام: ' + msg;
    if (msg.includes('PHONE_CODE_INVALID')) userErr = 'کد ۵ رقمی وارد شده اشتباه است. لطفاً دقت کنید.';
    if (msg.includes('PHONE_CODE_EXPIRED')) userErr = 'کد تایید منقضی شده است. لطفاً مجدداً کد درخواست کنید.';
    if (msg.includes('PASSWORD_HASH_INVALID')) userErr = 'رمز عبور ۲ مرحله‌ای اشتباه است.';

    res.status(400).json({ error: userErr });
    return;
  }
});

// 5. Logout
app.post('/api/credentials/logout', (req, res) => {
  if (activeTgClient) {
    try {
      activeTgClient.disconnect();
    } catch (e) {}
    activeTgClient = null;
  }
  appState.credentials.isConnected = false;
  appState.credentials.sessionString = '';
  appState.credentials.userProfile = undefined;
  appState.scheduler.isAutoRunActive = false;
  saveData();
  addLog('info', 'حساب تلگرام خروج داده شد. (تنظیمات API ID و API Hash محفوظ باقی ماندند).');
  res.json({ success: true, credentials: appState.credentials });
});

// 6. Add Target Group (Single)
app.post('/api/groups/add', (req, res) => {
  const { title, usernameOrLink, category } = req.body;
  if (!usernameOrLink) {
    res.status(400).json({ error: 'نام کاربری یا لینک گروه الزامی است' });
    return;
  }

  let formatted = String(usernameOrLink).trim();
  if (!formatted.startsWith('@') && !formatted.startsWith('http') && !formatted.startsWith('t.me')) {
    formatted = '@' + formatted;
  }

  const newGroup: TargetGroup = {
    id: 'group_' + Date.now(),
    title: title || formatted,
    usernameOrLink: formatted,
    isActive: true,
    memberCount: Math.floor(Math.random() * 15000) + 1500,
    status: 'joined',
    category: category || 'عمومی',
  };

  appState.groups.push(newGroup);
  saveData();
  addLog('info', `گروه هدف "${newGroup.title}" (${newGroup.usernameOrLink}) به لیست گروه‌ها اضافه شد.`, newGroup.title);
  res.json({ success: true, group: newGroup, groups: appState.groups });
});

// 6b. Add Target Groups in Bulk (دسته جمعی)
app.post('/api/groups/add-bulk', (req, res) => {
  const { bulkText, category } = req.body;
  if (!bulkText || typeof bulkText !== 'string' || !bulkText.trim()) {
    res.status(400).json({ error: 'متن گروه‌ها خالی است.' });
    return;
  }

  // Split tokens by space, comma, newline, semicolon
  const rawTokens = bulkText.split(/[\s,\n\r;]+/);
  const addedGroups: TargetGroup[] = [];
  const now = Date.now();
  const defaultCategory = (category && category.trim()) || 'عمومی';

  for (let i = 0; i < rawTokens.length; i++) {
    let token = rawTokens[i].trim();
    if (!token) continue;

    // Sanitize handle format
    if (!token.startsWith('@') && !token.startsWith('http') && !token.startsWith('t.me')) {
      token = '@' + token;
    }

    // Check if already in appState.groups
    const existsInState = appState.groups.some(g => g.usernameOrLink.toLowerCase() === token.toLowerCase());
    const existsInNewBatch = addedGroups.some(g => g.usernameOrLink.toLowerCase() === token.toLowerCase());

    if (!existsInState && !existsInNewBatch) {
      const newG: TargetGroup = {
        id: `group_${now}_${i}`,
        title: token,
        usernameOrLink: token,
        isActive: true,
        memberCount: Math.floor(Math.random() * 15000) + 1500,
        status: 'joined',
        category: defaultCategory,
      };
      appState.groups.push(newG);
      addedGroups.push(newG);
    }
  }

  if (addedGroups.length > 0) {
    saveData();
    addLog('info', `تعداد ${addedGroups.length} گروه جدید به‌صورت دسته جمعی به لیست گروه‌ها اضافه شد.`);
  }

  res.json({
    success: true,
    addedCount: addedGroups.length,
    groups: appState.groups,
  });
});

// 7. Toggle Group
app.post('/api/groups/toggle', (req, res) => {
  const { id, isActive } = req.body;
  const group = appState.groups.find(g => g.id === id);
  if (group) {
    group.isActive = isActive;
    saveData();
    addLog('info', `وضعیت گروه "${group.title}" به ${isActive ? 'فعال' : 'غیرفعال'} تغییر یافت.`, group.title);
  }
  res.json({ success: true, groups: appState.groups });
});

// 7b. Toggle All Groups (انتخاب همه / لغو انتخاب همه با یک کلیک)
app.post('/api/groups/toggle-all', (req, res) => {
  const { isActive } = req.body;
  const targetState = Boolean(isActive);

  appState.groups.forEach(g => {
    g.isActive = targetState;
  });

  saveData();
  addLog('info', `تمامی گروه‌ها (${appState.groups.length} گروه) به حالت ${targetState ? 'انتخاب شده (فعال)' : 'غیرفعال'} تغییر یافتند.`);

  res.json({ success: true, groups: appState.groups });
});

// 8. Delete Group
app.post('/api/groups/delete', (req, res) => {
  const { id } = req.body;
  const group = appState.groups.find(g => g.id === id);
  appState.groups = appState.groups.filter(g => g.id !== id);
  saveData();
  if (group) {
    addLog('info', `گروه "${group.title}" از لیست حذف گردید.`, group.title);
  }
  res.json({ success: true, groups: appState.groups });
});

// 8b. Delete All Successfully Posted Groups (حذف یک‌کلیکی گروه‌های ارسال شده موفق)
app.post('/api/groups/delete-posted', (req, res) => {
  const postedGroups = appState.groups.filter(g => g.lastPostedAt && (!g.errorMessage || g.errorMessage.trim() === ''));
  const postedCount = postedGroups.length;

  appState.groups = appState.groups.filter(g => !(g.lastPostedAt && (!g.errorMessage || g.errorMessage.trim() === '')));

  saveData();
  addLog('info', `تعداد ${postedCount} گروه با ارسال ۱۰۰٪ موفق و بدون خطا با یک کلیک از لیست گروه‌های هدف پاکسازی شدند.`);

  res.json({
    success: true,
    deletedCount: postedCount,
    groups: appState.groups,
  });
});

// 8c. Delete Bulk Groups by IDs
app.post('/api/groups/delete-bulk', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: 'لیست شناسه گروه‌ها نامعتبر است' });
    return;
  }

  const initialLength = appState.groups.length;
  appState.groups = appState.groups.filter(g => !ids.includes(g.id));
  const deletedCount = initialLength - appState.groups.length;

  saveData();
  addLog('info', `تعداد ${deletedCount} گروه انتخاب‌شده از لیست گروه‌های هدف حذف شدند.`);

  res.json({
    success: true,
    deletedCount,
    groups: appState.groups,
  });
});

// 9. Campaigns (Save, Toggle, Delete)
app.post('/api/campaigns/save', (req, res) => {
  const { id, title, price, description, imageUrl, contactHandle, hashtags, isActive } = req.body;
  if (!title || !description) {
    res.status(400).json({ error: 'عنوان و توضیحات محصول الزامی است' });
    return;
  }

  if (id) {
    const existing = appState.campaigns.find(c => c.id === id);
    if (existing) {
      existing.title = title;
      existing.price = price;
      existing.description = description;
      existing.imageUrl = imageUrl || existing.imageUrl;
      existing.contactHandle = contactHandle;
      existing.hashtags = hashtags || [];
      existing.isActive = isActive !== undefined ? isActive : existing.isActive;
      saveData();
      addLog('info', `کمپین تبلیغاتی "${title}" ویرایش گردید.`, undefined, undefined, title);
      res.json({ success: true, campaign: existing, campaigns: appState.campaigns });
      return;
    }
  }

  const newCampaign: ProductCampaign = {
    id: 'camp_' + Date.now(),
    title,
    price: price || 'توافقی',
    description,
    imageUrl: imageUrl || '',
    contactHandle: contactHandle || '@Admin',
    hashtags: Array.isArray(hashtags) ? hashtags : (hashtags ? hashtags.split(' ') : []),
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  appState.campaigns.push(newCampaign);
  saveData();
  addLog('info', `محصول جدید "${title}" برای انتشار در گروه‌ها ثبت گردید.`, undefined, undefined, title);
  res.json({ success: true, campaign: newCampaign, campaigns: appState.campaigns });
});

app.post('/api/campaigns/toggle', (req, res) => {
  const { id, isActive } = req.body;
  const camp = appState.campaigns.find(c => c.id === id);
  if (camp) {
    camp.isActive = isActive;
    saveData();
    addLog('info', `تبلیغ محصول "${camp.title}" ${isActive ? 'فعال' : 'غیرفعال'} شد.`, undefined, undefined, camp.title);
  }
  res.json({ success: true, campaigns: appState.campaigns });
});

app.post('/api/campaigns/delete', (req, res) => {
  const { id } = req.body;
  const camp = appState.campaigns.find(c => c.id === id);
  appState.campaigns = appState.campaigns.filter(c => c.id !== id);
  saveData();
  if (camp) {
    addLog('info', `محصول "${camp.title}" حذف گردید.`, undefined, undefined, camp.title);
  }
  res.json({ success: true, campaigns: appState.campaigns });
});

// 10. Scheduler config update
app.post('/api/scheduler/update', (req, res) => {
  const {
    intervalMinutes,
    jitterSeconds,
    dailyLimit,
    nightModePause,
    isAutoRunActive,
    onlyPromotionalGroups,
    multiAccountDispatchMode,
    maxConcurrentAccounts,
  } = req.body;
  
  if (intervalMinutes !== undefined) {
    appState.scheduler.intervalMinutes = Math.max(1, parseInt(intervalMinutes, 10) || 5);
  }
  if (jitterSeconds !== undefined) {
    appState.scheduler.jitterSeconds = parseInt(jitterSeconds, 10) || 0;
  }
  if (dailyLimit !== undefined) {
    appState.scheduler.dailyLimit = parseInt(dailyLimit, 10) || 100;
  }
  if (nightModePause !== undefined) {
    appState.scheduler.nightModePause = Boolean(nightModePause);
  }
  if (onlyPromotionalGroups !== undefined) {
    appState.scheduler.onlyPromotionalGroups = Boolean(onlyPromotionalGroups);
  }
  if (multiAccountDispatchMode !== undefined) {
    appState.scheduler.multiAccountDispatchMode = multiAccountDispatchMode === 'sequential_rotation' ? 'sequential_rotation' : 'parallel_multichannel';
  }
  if (maxConcurrentAccounts !== undefined) {
    appState.scheduler.maxConcurrentAccounts = Math.max(1, parseInt(maxConcurrentAccounts, 10) || 4);
  }
  if (isAutoRunActive !== undefined) {
    appState.scheduler.isAutoRunActive = Boolean(isAutoRunActive);
    
    if (appState.scheduler.isAutoRunActive) {
      // Calculate next run time
      const nextDate = new Date();
      nextDate.setMinutes(nextDate.getMinutes() + appState.scheduler.intervalMinutes);
      appState.scheduler.nextRunTime = nextDate.toISOString();
      addLog('success', `ارسال خودکار تبلیغات فعال گردید. بازه زمانی: هر ${appState.scheduler.intervalMinutes} دقیقه.`);
    } else {
      appState.scheduler.nextRunTime = undefined;
      addLog('warning', 'ارسال خودکار تبلیغات متوقف شد.');
    }
  }

  saveData();
  res.json({ success: true, scheduler: appState.scheduler });
});

// Helper Function: Resolve Telegram Group/Channel Peer and Join if needed
async function resolveAndJoinGroup(client: any, rawInput: string) {
  await loadGramJS();
  let cleanInput = String(rawInput).trim();

  // Invite link with + hash or joinchat (e.g., https://t.me/+ABCDEF... or t.me/joinchat/ABCDEF...)
  if (cleanInput.includes('/+') || cleanInput.includes('joinchat/')) {
    let hash = '';
    if (cleanInput.includes('/+')) {
      hash = cleanInput.split('/+')[1].split('/')[0].split('?')[0];
    } else if (cleanInput.includes('joinchat/')) {
      hash = cleanInput.split('joinchat/')[1].split('/')[0].split('?')[0];
    }

    if (hash) {
      try {
        const result = await client.invoke(
          new Api.messages.ImportChatInvite({ hash })
        );
        return result.chats?.[0] || result;
      } catch (err: any) {
        handleGramJsFloodWait(err);
        if (err.errorMessage === 'USER_ALREADY_PARTICIPANT') {
          const checkResult = await client.invoke(
            new Api.messages.CheckChatInvite({ hash })
          );
          if (checkResult.chat) return checkResult.chat;
        }
        throw new Error(`خطای عضویت با لینک دعوت: ${translateTgError(err)}`);
      }
    }
  }

  // Handle t.me/username or https://t.me/username
  if (cleanInput.includes('t.me/')) {
    cleanInput = cleanInput.split('t.me/')[1].split('/')[0].split('?')[0];
  }

  // Remove leading @ if present or ensure valid format
  if (!cleanInput.startsWith('@') && !cleanInput.startsWith('-') && !/^\d+$/.test(cleanInput)) {
    cleanInput = '@' + cleanInput;
  }

  // If numeric ID e.g. -100123456789
  let peerTarget: any = cleanInput;
  if (cleanInput.startsWith('-') || /^\d+$/.test(cleanInput)) {
    peerTarget = parseInt(cleanInput, 10);
  }

  // Check if ResolveUsername is currently flood-waited
  if (typeof peerTarget === 'string' && peerTarget.startsWith('@') && resolveUsernameFloodWaitUntil > Date.now()) {
    const remainingMins = Math.ceil((resolveUsernameFloodWaitUntil - Date.now()) / 60000);
    throw new Error(`حساب شخصی در محدودیّت استعلام آیدی (FloodWait) است (${remainingMins} دقیقه باقی‌مانده). ارسال به صورت مستقیم با ربات انجام می‌شود.`);
  }

  // Get Telegram Entity
  try {
    const entity = await client.getEntity(peerTarget);

    // Auto-join public group/channel if possible (only if entity is a Channel/Group, not a User)
    try {
      const isChannel = entity && (entity.className === 'Channel' || entity._ === 'channel' || entity.broadcast || entity.megagroup);
      if (isChannel && Api && Api.channels) {
        await client.invoke(new Api.channels.JoinChannel({ channel: entity }));
      }
    } catch (err: any) {
      // Ignore if already joined or not a channel
    }

    return entity;
  } catch (err: any) {
    handleGramJsFloodWait(err);
    throw new Error(translateTgError(err));
  }
}

// Helper Function: Process Image URL or Base64 into temporary file for GramJS upload
async function getImageFilePathForTelegram(imageUrl: string): Promise<string | undefined> {
  if (!imageUrl || typeof imageUrl !== 'string') return undefined;

  try {
    // If it's already an existing local file on disk
    if ((imageUrl.startsWith('/') || imageUrl.startsWith('./')) && fs.existsSync(imageUrl)) {
      return imageUrl;
    }

    const ext = imageUrl.includes('image/png') ? '.png' : imageUrl.includes('image/webp') ? '.webp' : '.jpg';
    const tmpPath = path.join('/tmp', `tg_img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}${ext}`);

    if (imageUrl.startsWith('data:image') || imageUrl.includes(';base64,')) {
      const parts = imageUrl.split(',');
      const base64Data = parts[1] || parts[0];
      if (!base64Data) return undefined;
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(tmpPath, buffer);
      return tmpPath;
    }

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(imageUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        fs.writeFileSync(tmpPath, Buffer.from(arrayBuffer));
        return tmpPath;
      }
    }
  } catch (e) {
    console.error('Failed to prepare image file for Telegram upload:', e);
  }

  return undefined;
}

// Helper Function: Check if Telegram send error indicates invalid group or restricted posting permissions
function isGroupInvalidOrRestricted(err: any): boolean {
  if (!err) return false;
  const str = String(err.errorMessage || err.message || err).toLowerCase();

  const invalidKeywords = [
    'username_invalid',
    'username_not_occupied',
    'chat_not_found',
    'no_username',
    'peer_id_invalid',
    'channel_private',
    'invite_hash_expired',
    'invite_hash_invalid',
    'chat_write_forbidden',
    'user_banned_in_channel',
    'chat_restricted',
    'chat_admin_required',
    'msg_id_invalid',
    'user_is_blocked',
    'could not find the input entity',
    'cannot find',
    'نامعتبر',
    'یافت نشد',
    'ارسال پیام ندارد',
    'ممنوع',
    'مسدود',
    'دسترسی ندارد',
    'فقط مدیران',
    'اجازه ارسال',
  ];

  return invalidKeywords.some(kw => str.includes(kw));
}

// Helper Function: Format human-readable Persian Telegram error
function translateTgError(err: any): string {
  if (!err) return 'خطای نامشخص تلگرام';
  const msg = String(err.errorMessage || err.message || err);

  handleGramJsFloodWait(err);

  const secs = parseFloodWaitSeconds(err);
  if (secs !== null && secs > 0) {
    const hours = (secs / 3600).toFixed(1);
    const mins = Math.ceil(secs / 60);
    if (msg.includes('ResolveUsername') || msg.includes('contacts.ResolveUsername')) {
      return `محدودیت استعلام آیدی (Flood Wait). حساب تلگرام شما به مدت ${hours} ساعت (${mins} دقیقه) از استعلام آیدی‌های جدید محدود شده است. ارسال‌ها به طور خودکار با ربات انجام می‌شود.`;
    }
    return `محدودیت ارسال تلگرام (Flood Wait). لطفاً ${hours} ساعت (${mins} دقیقه) صبوری کنید.`;
  }

  if (msg.includes('API_ID_INVALID') || msg.includes('API_ID_PUBLISHED_FLOOD')) {
    return 'شناسه API ID یا کلید API Hash تلگرام نامعتبر یا منقضی است. لطفاً کلیدها را بررسی کنید یا از پیش‌تنظیم استاندارد تلگرام دسکتاپ استفاده فرمایید.';
  }
  if (msg.includes('TIMEOUT') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') || msg.includes('EHOSTUNREACH')) {
    return 'خطای وقفه در ارتباط با سرورهای تلگرام (Timeout). لطفاً ارتباط اینترنت خود را بررسی کرده و چند ثانیه بعد مجدداً تلاش فرمایید.';
  }
  if (msg.includes('PHONE_NUMBER_INVALID')) {
    return 'شماره تلفن وارد شده نامعتبر است. فرمت صحیح با کد کشور: 989123456789+';
  }
  if (msg.includes('PHONE_NUMBER_BANNED')) {
    return 'این شماره تلفن توسط تلگرام مسدود (Ban) شده است و امکان ارسال کد ندارد.';
  }
  if (msg.includes('PHONE_CODE_EXPIRED')) {
    return 'کد تایید ۵ رقمی تلگرام منقضی شده است. لطفاً مجدداً درخواست کد تایید ارسال نمایید.';
  }
  if (msg.includes('PHONE_CODE_INVALID')) {
    return 'کد تایید وارد شده نادرست است. لطفاً کد ۵ رقمی دریافتی از تلگرام را به دقت وارد کنید.';
  }
  if (msg.includes('PASSWORD_HASH_INVALID')) {
    return 'رمز عبور تایید دو مرحله‌ای (2FA) نادرست است.';
  }
  if (msg.includes('SESSION_PASSWORD_NEEDED')) {
    return 'تایید دو مرحله‌ای (2FA) فعال است. لطفاً رمز عبور را وارد نمایید.';
  }
  if (msg.includes('SEND_CODE_UNAVAILABLE')) {
    return 'امکان ارسال کد به این شماره در حال حاضر مقدور نیست. لطفاً دقایقی دیگر تلاش فرمایید.';
  }

  if (
    msg.includes('AUTH_KEY_DUPLICATED') ||
    msg.includes('AUTH_KEY_UNREGISTERED') ||
    msg.includes('AUTH_KEY_INVALID') ||
    msg.includes('SESSION_REVOKED') ||
    msg.includes('SESSION_EXPIRED') ||
    msg.includes('406')
  ) {
    appState.credentials.isConnected = false;
    appState.credentials.sessionString = '';
    appState.credentials.userProfile = undefined;
    if (activeTgClient) {
      try { activeTgClient.disconnect(); } catch (e) {}
      activeTgClient = null;
    }
    saveData();
    return 'نشست تلگرام شما منقضی یا تکراری گردیده است (AUTH_KEY_DUPLICATED). لطفاً از طریق منوی تنظیمات اتصال، مجدداً کد تایید تلگرام بگیرید.';
  }
  if (msg.includes('Not connected')) {
    return 'اتصال به تلگرام برقرار نیست. لطفاً وارد حساب کاربری خود شوید.';
  }
  if (msg.includes('CHAT_WRITE_FORBIDDEN')) return 'ارسال پیام در این گروه قفل است یا فقط برای مدیران مجاز می‌باشد.';
  if (msg.includes('USER_BANNED_IN_CHANNEL')) return 'حساب کاربری شما در این گروه/کانال مسدود شده است.';
  if (msg.includes('SLOWMODE_WAIT')) return `حالت کند (Slowmode) در گروه فعال است. ${msg}`;
  if (msg.includes('USERNAME_INVALID') || msg.includes('USERNAME_NOT_OCCUPIED')) return 'آیدی یا لینک گروه اشتباه یا نامعتبر است.';
  if (msg.includes('INVITE_HASH_EXPIRED')) return 'لینک دعوت گروه منقضی شده است.';
  if (msg.includes('CHANNEL_PRIVATE')) return 'گروه یا کانال خصوصی است و نیاز به لینک دعوت جدید دارد.';
  if (msg.includes('MSG_ID_INVALID')) return 'خطا در ساختار پیام.';

  return msg;
}

// Helper Function: Robust Campaign Message Sender with Slowmode/FloodWait Auto-Retry
async function sendCampaignWithRetry(
  client: any,
  peer: any,
  textMessage: string,
  tempImgPath?: string,
  maxRetries = 3
): Promise<{ success: boolean; sentResult?: any; error?: string }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let sentResult: any = null;
      if (tempImgPath && fs.existsSync(tempImgPath)) {
        sentResult = await client.sendFile(peer, {
          file: tempImgPath,
          caption: textMessage,
          parseMode: 'md',
        });
      } else {
        sentResult = await client.sendMessage(peer, {
          message: textMessage,
          parseMode: 'md',
        });
      }
      return { success: true, sentResult };
    } catch (err: any) {
      const errStr = String(err.errorMessage || err.message || err);
      const secs = parseFloodWaitSeconds(err);

      if (secs && secs > 0 && secs <= 20 && attempt < maxRetries) {
        addLog('info', `[تایمر FloodWait/Slowmode] نیاز به ${secs} ثانیه شکیبایی قبل از تلاش مجدد ارسال...`);
        await new Promise(r => setTimeout(r, (secs + 1) * 1000));
        continue;
      }

      if ((errStr.includes('SLOWMODE_WAIT') || errStr.toLowerCase().includes('slow mode')) && attempt < maxRetries) {
        const slowSecsMatch = errStr.match(/\d+/);
        const slowSecs = slowSecsMatch ? parseInt(slowSecsMatch[0], 10) : 5;
        if (slowSecs <= 30) {
          addLog('info', `[حالت کند گروه] شکیبایی به مدت ${slowSecs} ثانیه برای رفع حالت کند (Slow Mode)...`);
          await new Promise(r => setTimeout(r, (slowSecs + 1) * 1000));
          continue;
        }
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 2500));
        continue;
      }
      return { success: false, error: translateTgError(err) };
    }
  }
  return { success: false, error: 'تلاش‌های متوالی جهت ارسال با شکست مواجه شد.' };
}

// Helper Function: Leave group/channel and delete chat history from Telegram user account
async function leaveGroupAndClearHistory(client: any, peer: any) {
  if (!client || !peer) return;
  await loadGramJS();

  // 1. Leave Channel / Group
  try {
    const isChannel = peer.className === 'Channel' || peer._ === 'channel' || peer.broadcast || peer.megagroup;
    if (isChannel && Api && Api.channels) {
      await client.invoke(new Api.channels.LeaveChannel({ channel: peer }));
    } else if (Api && Api.messages) {
      const chatId = peer.id || peer.chatId || peer;
      await client.invoke(new Api.messages.DeleteChatUser({
        chatId: chatId,
        userId: 'me'
      }));
    }
  } catch (leaveErr: any) {
    console.warn('Leave group warning:', leaveErr.errorMessage || leaveErr.message || leaveErr);
  }

  // 2. Delete / Clear Chat History from Telegram User Account
  try {
    const isChannel = peer.className === 'Channel' || peer._ === 'channel' || peer.broadcast || peer.megagroup;
    if (isChannel && Api && Api.channels) {
      await client.invoke(new Api.channels.DeleteChannelHistory({
        channel: peer,
        maxId: 0,
      }));
    } else if (Api && Api.messages) {
      await client.invoke(new Api.messages.DeleteHistory({
        peer: peer,
        maxId: 0,
        revoke: true,
        justClear: false,
      }));
    }
  } catch (delErr: any) {
    console.warn('Delete chat history warning:', delErr.errorMessage || delErr.message || delErr);
  }

  // 3. Fallback helper
  try {
    if (typeof client.deleteDialog === 'function') {
      await client.deleteDialog(peer, { revoke: true });
    }
  } catch (e) {}
}

// Monitoring State Updater Helper
function updateGroupMonitoringReport(report: Partial<GroupMonitoringReport> & { groupId: string; groupTitle: string }) {
  if (!appState.monitoringReports) appState.monitoringReports = [];
  const nowStr = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const idx = appState.monitoringReports.findIndex(r => r.groupId === report.groupId || r.groupTitle === report.groupTitle);

  const updated: GroupMonitoringReport = {
    id: idx >= 0 ? appState.monitoringReports[idx].id : ('mon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
    groupId: report.groupId,
    groupTitle: report.groupTitle,
    usernameOrLink: report.usernameOrLink || (idx >= 0 ? appState.monitoringReports[idx].usernameOrLink : report.groupTitle),
    lastCheckedAt: nowStr,
    step: report.step || (idx >= 0 ? appState.monitoringReports[idx].step : 'JOINING'),
    botDetected: report.botDetected ?? (idx >= 0 ? appState.monitoringReports[idx].botDetected : false),
    botTypeOrName: report.botTypeOrName || (idx >= 0 ? appState.monitoringReports[idx].botTypeOrName : 'نامشخص'),
    captchaClicked: report.captchaClicked ?? (idx >= 0 ? appState.monitoringReports[idx].captchaClicked : false),
    channelJoined: report.channelJoined ?? (idx >= 0 ? appState.monitoringReports[idx].channelJoined : false),
    contactsInvited: report.contactsInvited ?? (idx >= 0 ? appState.monitoringReports[idx].contactsInvited : 0),
    statusMessage: report.statusMessage || (idx >= 0 ? appState.monitoringReports[idx].statusMessage : 'در حال پردازش...'),
    requiresManualCheck: report.requiresManualCheck ?? (idx >= 0 ? appState.monitoringReports[idx].requiresManualCheck : false),
  };

  if (idx >= 0) {
    appState.monitoringReports[idx] = updated;
  } else {
    appState.monitoringReports.unshift(updated);
  }

  if (appState.monitoringReports.length > 50) {
    appState.monitoringReports = appState.monitoringReports.slice(0, 50);
  }
  saveData();
}

// Telegram Dialogs Group Sync Engine
async function syncTelegramGroups(client: any): Promise<{ addedCount: number; updatedCount: number; totalGroups: number }> {
  if (!client) throw new Error('حساب تلگرام متصل نیست.');
  await loadGramJS();

  let dialogs: any[] = [];
  try {
    if (typeof client.getDialogs === 'function') {
      dialogs = await client.getDialogs({ limit: 300 });
    }
  } catch (e: any) {
    console.error('getDialogs error:', e);
  }

  let addedCount = 0;
  let updatedCount = 0;

  for (const dialog of dialogs) {
    if (!dialog) continue;
    const entity = dialog.entity;
    if (!entity) continue;

    // Filter ONLY for Groups and Supergroups
    // Exclude: Users (private 1-on-1 chats), Bots, Broadcast Channels
    const isChannelBroadcast = (entity.className === 'Channel' || entity._ === 'channel') && !entity.megagroup;
    const isUser = entity.className === 'User' || entity._ === 'user';
    const isGroup = dialog.isGroup || entity.megagroup || entity.className === 'Chat' || entity._ === 'chat';

    if (isUser || isChannelBroadcast || !isGroup) {
      continue; // Skip non-groups
    }

    const title = dialog.title || entity.title || 'گروه بدون نام';
    let usernameOrLink = '';

    if (entity.username) {
      usernameOrLink = '@' + entity.username;
    } else if (entity.id) {
      const idStr = entity.id.toString();
      usernameOrLink = idStr.startsWith('-') ? idStr : (entity.megagroup ? `-100${idStr}` : `-${idStr}`);
    }

    if (!usernameOrLink) continue;

    // Match with existing group in appState.groups
    const existing = appState.groups.find(
      g => g.usernameOrLink.toLowerCase() === usernameOrLink.toLowerCase() ||
           (g.title && g.title.trim().toLowerCase() === title.trim().toLowerCase())
    );

    if (existing) {
      existing.title = title;
      if (entity.participantsCount) existing.memberCount = entity.participantsCount;
      existing.status = 'joined';
      updatedCount++;
    } else {
      const newGroup: TargetGroup = {
        id: 'group_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title: title,
        usernameOrLink: usernameOrLink,
        isActive: true,
        memberCount: entity.participantsCount || undefined,
        status: 'joined',
        category: 'همگام‌سازی تلگرام',
      };
      appState.groups.push(newGroup);
      addedCount++;
    }
  }

  saveData();
  addLog('success', `همگام‌سازی کامل گروه‌ها با حساب تلگرام انجام گردید. (${addedCount} گروه جدید افزوده شد، ${updatedCount} گروه به‌روزرسانی شد).`);
  return { addedCount, updatedCount, totalGroups: appState.groups.length };
}

// Engine: Smart Anti-Bot & Lock Bypass Engine with Live Monitoring
async function handleAntiBotAndGroupVerification(client: any, peer: any, groupTitle: string): Promise<{
  isClear: boolean;
  botDetected: boolean;
  statusMessage: string;
  captchaClicked: boolean;
  channelJoined: boolean;
  contactsInvited: number;
}> {
  if (!client || !peer) {
    return { isClear: false, botDetected: false, statusMessage: 'کلاینت یا گروه نامعتبر است.', captchaClicked: false, channelJoined: false, contactsInvited: 0 };
  }
  await loadGramJS();

  const antiBotConfig = appState.scheduler.antiBot || {
    autoClickCaptcha: true,
    autoForceJoinChannels: true,
    autoInviteContacts: true,
    contactsToInviteCount: 3,
    sendGreetingFirst: true,
    greetingMessage: 'سلام بچه ها',
  };

  const greetingMsg = antiBotConfig.greetingMessage || 'سلام بچه ها';
  const shouldSendGreeting = antiBotConfig.sendGreetingFirst !== false;

  updateGroupMonitoringReport({
    groupId: groupTitle,
    groupTitle: groupTitle,
    step: 'JOINING',
    statusMessage: 'ورود به گروه و آماده‌سازی سیستم آنتی‌بات...',
  });

  try {
    // 0. Step 1: Send initial human test message (e.g. "سلام بچه ها") to trigger guardian bot reaction
    if (shouldSendGreeting) {
      try {
        await client.sendMessage(peer, { message: greetingMsg, parseMode: 'md' });
        addLog('info', `[تست ربات نگهبان] پیام سلام اولیه «${greetingMsg}» به گروه "${groupTitle}" ارسال شد. در حال بررسی واکنش ربات ناظر...`);
        
        updateGroupMonitoringReport({
          groupId: groupTitle,
          groupTitle: groupTitle,
          step: 'GREETING_SENT',
          statusMessage: `پیام سلام اولیه ارسال شد: «${greetingMsg}». در حال پایش واکنش ربات ناظر...`,
        });

        // Wait 2.5 seconds for guardian bot reaction/reply
        await new Promise(res => setTimeout(res, 2500));
      } catch (greetErr: any) {
        console.warn('Initial greeting send warning:', greetErr.message || greetErr);
      }
    }

    // 1. Fetch recent messages in the group (e.g. last 10 messages)
    const messages = await client.getMessages(peer, { limit: 10 });

    let botReactionDetected = false;
    let botName = 'ربات ناظر گروه';
    let requiresManual = false;
    let captchaClicked = false;
    let channelJoined = false;
    let contactsInvitedCount = 0;

    if (messages && messages.length > 0) {
      for (const msg of messages) {
        if (!msg) continue;
        const text = (msg.message || msg.text || '').toLowerCase();

        // Check for bot name or unknown complex prompt
        if (text.includes('rose') || text.includes('رز')) botName = 'ربات MissRose';
        else if (text.includes('shield') || text.includes('شیلد')) botName = 'ربات ShieldBot';
        else if (text.includes('grouphelp') || text.includes('گروه‌بان')) botName = 'ربات GroupHelp';
        else if (text.includes('captcha')) botName = 'ربات CaptchaBot';

        // Complex / Unknown manual review prompt check
        const isComplexPrompt =
          text.includes('کد') ||
          text.includes('ریاضی') ||
          text.includes('عکس کاپچا') ||
          text.includes('رمز ورود') ||
          text.includes('ویس') ||
          text.includes('پیوی') ||
          text.includes('پاسخ دهید');

        if (isComplexPrompt) {
          requiresManual = true;
        }

        // --- Feature A: Auto Click Inline Buttons ("I am not a bot" / "Captcha" / "Verify" / "تایید") ---
        if (antiBotConfig.autoClickCaptcha && msg.replyMarkup) {
          const rows = msg.replyMarkup.rows || [];
          for (let r = 0; r < rows.length; r++) {
            const buttons = rows[r].buttons || [];
            for (let b = 0; b < buttons.length; b++) {
              const btn = buttons[b];
              const btnText = (btn.text || '').toLowerCase();

              // Match verification terms
              const isCaptchaBtn =
                btnText.includes('ربات') ||
                btnText.includes('bot') ||
                btnText.includes('تایید') ||
                btnText.includes('کلیک') ||
                btnText.includes('عضو شدم') ||
                btnText.includes('بررسی') ||
                btnText.includes('verify') ||
                btnText.includes('check') ||
                btnText.includes('ورود') ||
                btnText.includes('پذیرش') ||
                btnText.includes('start') ||
                btnText.includes('ادامه');

              if (isCaptchaBtn) {
                botReactionDetected = true;
                captchaClicked = true;
                try {
                  if (typeof msg.click === 'function') {
                    await msg.click({ i: r, j: b });
                  } else if (btn.data && Api && Api.messages && Api.messages.GetBotCallbackAnswer) {
                    await client.invoke(new Api.messages.GetBotCallbackAnswer({
                      peer: peer,
                      msgId: msg.id,
                      data: btn.data,
                    }));
                  }
                  addLog('info', `[هوش مصنوعی آنتی‌بات] دکمه احراز هویت/کاپچای گروه "${groupTitle}" با عنوان «${btn.text}» خودکار کلیک شد.`);
                  
                  updateGroupMonitoringReport({
                    groupId: groupTitle,
                    groupTitle: groupTitle,
                    step: 'ANTI_BOT_VERIFYING',
                    botDetected: true,
                    botTypeOrName: botName,
                    captchaClicked: true,
                    statusMessage: `دکمه احراز هویت «${btn.text}» خودکار کلیک شد.`,
                  });

                  await new Promise(res => setTimeout(res, 1000));
                } catch (clickErr: any) {
                  console.warn('Click button warning:', clickErr.message || clickErr);
                  requiresManual = true;
                }
              }
            }
          }
        }

        // --- Feature B: Auto Force Join Required Channels ---
        if (antiBotConfig.autoForceJoinChannels) {
          const channelMatches = text.match(/@([a-zA-Z0-9_]{4,32})|t\.me\/([a-zA-Z0-9_]{4,32})/g);
          if (channelMatches && channelMatches.length > 0) {
            for (const rawTarget of channelMatches) {
              let targetClean = rawTarget.replace('t.me/', '').replace('@', '').trim();
              if (!targetClean || targetClean.length < 3) continue;

              botReactionDetected = true;
              channelJoined = true;
              try {
                if (Api && Api.channels) {
                  await client.invoke(new Api.channels.JoinChannel({ channel: targetClean }));
                  addLog('info', `[عضویت اجباری] ربات خودکار در کانال حامی @${targetClean} جهت باز شدن قفل گروه "${groupTitle}" عضو شد.`);
                  
                  updateGroupMonitoringReport({
                    groupId: groupTitle,
                    groupTitle: groupTitle,
                    step: 'ANTI_BOT_VERIFYING',
                    botDetected: true,
                    botTypeOrName: botName,
                    channelJoined: true,
                    statusMessage: `عضویت اجباری در کانال @${targetClean} با موفقیت انجام شد.`,
                  });

                  await new Promise(res => setTimeout(res, 1000));
                }
              } catch (joinChannelErr: any) {
                console.warn('Force join channel warning:', joinChannelErr.message || joinChannelErr);
              }
            }
          }
        }

        // --- Feature C: Auto Invite Random Contacts (Force Add Contacts) ---
        if (antiBotConfig.autoInviteContacts) {
          const needsAddMembers =
            text.includes('اضافه کنید') ||
            text.includes('عضو کنید') ||
            text.includes('اد کنید') ||
            text.includes('ادفرام') ||
            text.includes('افزودن عضو') ||
            text.includes('مخاطب') ||
            text.includes('دعوت');

          if (needsAddMembers) {
            botReactionDetected = true;
            try {
              if (Api && Api.contacts && Api.contacts.GetContacts) {
                const resContacts = await client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
                const users = resContacts.users || [];
                if (users.length > 0) {
                  const limitCount = Math.min(users.length, antiBotConfig.contactsToInviteCount || 3);
                  const shuffled = [...users].sort(() => 0.5 - Math.random()).slice(0, limitCount);
                  contactsInvitedCount = shuffled.length;

                  if (Api.channels && Api.channels.InviteToChannel) {
                    await client.invoke(new Api.channels.InviteToChannel({
                      channel: peer,
                      users: shuffled.map((u: any) => u.id || u),
                    }));
                    addLog('info', `[افزودن مخاطبین] تعداد ${shuffled.length} مخاطب واقعی به صورت هوشمند برای باز کردن قفل گروه "${groupTitle}" اضافه شد.`);
                    
                    updateGroupMonitoringReport({
                      groupId: groupTitle,
                      groupTitle: groupTitle,
                      step: 'ANTI_BOT_VERIFYING',
                      botDetected: true,
                      botTypeOrName: botName,
                      contactsInvited: shuffled.length,
                      statusMessage: `تعداد ${shuffled.length} مخاطب برای رفع قفل دعوت شدند.`,
                    });

                    await new Promise(res => setTimeout(res, 1500));
                  }
                }
              }
            } catch (inviteErr: any) {
              console.warn('Auto invite contacts warning:', inviteErr.message || inviteErr);
            }
          }
        }
      }
    }

    if (requiresManual) {
      updateGroupMonitoringReport({
        groupId: groupTitle,
        groupTitle: groupTitle,
        step: 'MANUAL_REVIEW_NEEDED',
        botDetected: true,
        botTypeOrName: botName,
        requiresManualCheck: true,
        statusMessage: '⚠️ ربات ناظر خاص در گروه شناسایی شد. چالش دستی برطرف شد یا نیاز به بررسی دارد.',
      });
    }

    if (botReactionDetected) {
      addLog('info', `[آنتی‌بات هوشمند] مانع در گروه "${groupTitle}" شناسایی و با موفقیت برطرف شد. ۳ ثانیه مهلت تنفس جهت اعمال دسترسی ارسال در سرور تلگرام...`);
      await new Promise(res => setTimeout(res, 3000));

      updateGroupMonitoringReport({
        groupId: groupTitle,
        groupTitle: groupTitle,
        step: 'RE_TESTING',
        botDetected: true,
        botTypeOrName: botName,
        captchaClicked,
        channelJoined,
        contactsInvited: contactsInvitedCount,
        requiresManualCheck: requiresManual,
        statusMessage: '✅ تمام موانع آنتی‌بات برطرف شد. گروه کاملاً آماده انتشار مستقیم پیام اصلی کمپین است.',
      });

      return {
        isClear: true,
        botDetected: true,
        statusMessage: 'موانع برطرف شد و گروه آماده انتشار کمپین است.',
        captchaClicked,
        channelJoined,
        contactsInvited: contactsInvitedCount,
      };
    }

    // No bot reaction or obstacle detected
    addLog('info', `[تایید ارسال تبلیغ] هیچ محدودیتی از سوی ربات ناظر گروه "${groupTitle}" وجود ندارد. آماده‌سازی انتشار پیام کمپین...`);
    
    updateGroupMonitoringReport({
      groupId: groupTitle,
      groupTitle: groupTitle,
      step: 'RE_TESTING',
      botDetected: false,
      requiresManualCheck: false,
      statusMessage: 'هیچ مانعی وجود ندارد. آماده انتشار پیام اصلی کمپین.',
    });

    return {
      isClear: true,
      botDetected: false,
      statusMessage: 'آماده ارسال پیام اصلی کمپین.',
      captchaClicked: false,
      channelJoined: false,
      contactsInvited: 0,
    };
  } catch (e: any) {
    console.warn('handleAntiBotAndGroupVerification error:', e.message || e);
    updateGroupMonitoringReport({
      groupId: groupTitle,
      groupTitle: groupTitle,
      step: 'FAILED',
      requiresManualCheck: true,
      statusMessage: `خطا در سیستم آنتی‌بات: ${e.message || e}`,
    });
    return {
      isClear: false,
      botDetected: false,
      statusMessage: `خطا: ${e.message || e}`,
      captchaClicked: false,
      channelJoined: false,
      contactsInvited: 0,
    };
  }
}

// Helper Function: Execute Broadcast to Active Groups with Parallel Multi-Account Dispatch & Dynamic Failover
async function executeBroadcast(isManualTrigger = false) {
  if (isBroadcastRunning) {
    addLog('warning', '[پروسه ارسال] یک عملیات ارسال کمپین هم‌اکنون در حال اجرا است. جهت جلوگیری از ارسال تکراری توسط اکانت‌ها، درخواست جدید منتظر ماند.');
    return { success: false, message: 'عملیات ارسال کمپین هم‌اکنون در حال اجرا است.' };
  }

  isBroadcastRunning = true;
  isBroadcastCancellationRequested = false;
  let tempImgPath: string | undefined = undefined;
  let reportSuccessCount = 0;
  let reportFailedCount = 0;
  const broadcastStartTime = Date.now();
  const reportGroupDetails: any[] = [];
  const usedAccountPhones = new Set<string>();

  try {
    // 1. Reset daily counters if a new day has started
    checkAndResetDailyCounters();

    // 2. Check Night Mode (01:00 AM to 07:00 AM pause)
    if (!isManualTrigger && isNightModeActive()) {
      addLog('warning', '[حالت خواب شبانه] ارسال اتوماتیک بین ساعت ۰۱:۰۰ تا ۰۷:۰۰ صبح جهت جلوگیری از ریپورت و جلب توجه متوقف گردید.');
      return { success: false, message: 'حالت خواب شبانه فعال است. ارسال متوقف شد.' };
    }

    // 3. Check Daily Limit
    const currentDailySent = appState.scheduler.dailySentCount || 0;
    const maxDailyLimit = appState.scheduler.dailyLimit || 35;
    if (currentDailySent >= maxDailyLimit) {
      addLog('warning', `[سقف مجاز روزانه] سقف ارسال امروز (${maxDailyLimit} پیام) فراتر رفته است. ارسال تا فردا متوقف شد.`);
      return { success: false, message: `سقف ارسال روزانه (${maxDailyLimit} پیام) تکمیل شده است.` };
    }

    const activeCampaigns = appState.campaigns.filter(c => c.isActive);
    const activeGroups = appState.groups.filter(g => g.isActive);

    if (activeCampaigns.length === 0) {
      addLog('warning', 'هیچ کمپین یا محصول فعالی برای ارسال وجود ندارد.');
      return { success: false, message: 'هیچ محصول فعالی یافت نشد.' };
    }

    if (activeGroups.length === 0) {
      addLog('warning', 'هیچ گروه هدفی فعال نیست. لطفاً حداقل یک گروه فعال انتخاب کنید.');
      return { success: false, message: 'گروه هدفی فعال نیست.' };
    }

    // 4. Apply Promotional Group Filter if enabled
    let targetGroupsToProcess = activeGroups;
    if (appState.scheduler.onlyPromotionalGroups) {
      targetGroupsToProcess = activeGroups.filter(g => {
        const cat = (g.category || '').toLowerCase();
        const title = (g.title || '').toLowerCase();
        const isGeneral = cat.includes('عمومی') || cat.includes('general') || title.includes('چت عمومی');
        return !isGeneral;
      });
      if (targetGroupsToProcess.length < activeGroups.length) {
        addLog('info', `[فیلتر گروه‌ها] تعداد ${activeGroups.length - targetGroupsToProcess.length} گروه عمومی جهت جلوگیری از ریپورت نادیده گرفته شد.`);
      }
      if (targetGroupsToProcess.length === 0) {
        addLog('warning', 'تمام گروه‌های فعال از نوع عمومی تشخیص داده شدند. ارسال انجام نشد.');
        return { success: false, message: 'هیچ گروه تبلیغاتی یا تبادلی یافت نشد.' };
      }
    }

    // Pick primary active campaign
    const campaign = activeCampaigns[0];
    const botToken = appState.credentials.botToken;

    // Prepare image file if present
    if (campaign.imageUrl) {
      tempImgPath = await getImageFilePathForTelegram(campaign.imageUrl);
    }

    // Format text message
    const textMessage = `📌 **${campaign.title}**\n\n💰 **قیمت:** ${campaign.price}\n\n📝 ${campaign.description}\n\n👤 **سفارش و ارتباط:** ${campaign.contactHandle}\n\n${campaign.hashtags.map(h => (h.startsWith('#') ? h : '#' + h)).join(' ')}`;

    // Filter available active accounts
    syncAccountsState();
    const availableAccounts = (appState.accounts || []).filter(
      a => a.isActive && a.status !== 'disabled' && (!a.floodWaitUntil || a.floodWaitUntil < Date.now())
    );

    const dispatchMode = appState.scheduler.multiAccountDispatchMode || 'parallel_multichannel';
    const isParallel = dispatchMode === 'parallel_multichannel' && availableAccounts.length > 1;

    addLog(
      'info',
      `[آغاز فرایند ارسال] تبلیغ "${campaign.title}" به ${targetGroupsToProcess.length} گروه هدف با ${availableAccounts.length} اکانت متصل (حالت: ${isParallel ? 'ارسال همزمان و تقسیم موازی کار' : 'ارسال تک‌کاناله/چرخشی'})...`,
      undefined,
      undefined,
      campaign.title
    );

    // Track per-account statistics
    const accountStatsMap = new Map<string, {
      accountId: string;
      accountPhone: string;
      accountName?: string;
      sentCount: number;
      failedCount: number;
      hitRateLimit?: boolean;
    }>();

    for (const acc of availableAccounts) {
      accountStatsMap.set(acc.id, {
        accountId: acc.id,
        accountPhone: acc.phoneNumber,
        accountName: acc.userProfile?.firstName,
        sentCount: 0,
        failedCount: 0,
        hitRateLimit: false,
      });
    }

    // Central Synchronized Queue for Zero-Collision & Dynamic Redistribution
    const claimedGroupIds = new Set<string>();
    const completedGroupIds = new Set<string>();
    const minGroupIntervalMs = Math.max((appState.scheduler.intervalMinutes || 10) - 1, 5) * 60 * 1000;
    const nowTime = Date.now();

    // Initialize live broadcast worker progress
    const activeWorkersProgress: any[] = availableAccounts.map(a => ({
      accountId: a.id,
      accountPhone: a.phoneNumber,
      accountName: a.userProfile?.firstName,
      status: 'idle',
      sentSuccessCount: 0,
      failedCount: 0,
      lastAction: 'در صف آماده‌سازی...',
    }));

    appState.activeBroadcastProgress = {
      isRunning: true,
      startTime: new Date().toISOString(),
      totalGroups: targetGroupsToProcess.length,
      completedGroups: 0,
      successCount: 0,
      failedCount: 0,
      dispatchMode: isParallel ? 'parallel_multichannel' : 'sequential_rotation',
      workers: activeWorkersProgress,
    };

    function claimNextGroupForWorker(workerAccId: string): TargetGroup | null {
      // 1. Prefer unassigned groups that this account previously joined/posted to
      for (const g of targetGroupsToProcess) {
        if (!claimedGroupIds.has(g.id) && !completedGroupIds.has(g.id)) {
          if (g.lastPostedByAccountId === workerAccId) {
            claimedGroupIds.add(g.id);
            return g;
          }
        }
      }
      // 2. Otherwise claim next unclaimed group in the queue
      for (const g of targetGroupsToProcess) {
        if (!claimedGroupIds.has(g.id) && !completedGroupIds.has(g.id)) {
          claimedGroupIds.add(g.id);
          return g;
        }
      }
      return null;
    }

    function releaseGroupBackToSharedQueue(g: TargetGroup, reason: string) {
      claimedGroupIds.delete(g.id);
      addLog('info', `[تقسیم مجدد کار] گروه "${g.title}" به دلیل (${reason}) به صف عمومی بازگردانده شد تا سایر اکانت‌های فعال آن را ارسال کنند.`);
    }

    function markGroupAsCompleted(g: TargetGroup) {
      completedGroupIds.add(g.id);
      claimedGroupIds.delete(g.id);
      if (appState.activeBroadcastProgress) {
        appState.activeBroadcastProgress.completedGroups = completedGroupIds.size;
      }
    }

    // Worker executor for a specific account
    async function runAccountWorker(account: any, workerIndex: number) {
      const workerProgress = activeWorkersProgress.find(w => w.accountId === account.id) || activeWorkersProgress[workerIndex];
      const accStats = accountStatsMap.get(account.id);

      if (workerProgress) {
        workerProgress.status = 'preparing';
        workerProgress.lastAction = 'در حال اتصال کلاینت تلگرام...';
      }

      let accClient: any = null;
      try {
        accClient = await getOrInitClientForAccount(account);
      } catch (err: any) {
        console.error(`Client init error for account ${account.phoneNumber}:`, err);
        if (workerProgress) {
          workerProgress.status = 'finished';
          workerProgress.lastAction = 'خطا در اتصال به تلگرام';
        }
        return;
      }

      if (!accClient || !accClient.connected) {
        if (workerProgress) {
          workerProgress.status = 'finished';
          workerProgress.lastAction = 'کلاینت تلگرام متصل نشد';
        }
        return;
      }

      usedAccountPhones.add(account.phoneNumber);

      // Continuous queue draining loop for this worker
      while (completedGroupIds.size < targetGroupsToProcess.length) {
        // Immediate user cancellation check
        if (isBroadcastCancellationRequested) {
          if (workerProgress) {
            workerProgress.status = 'finished';
            workerProgress.lastAction = 'عملیات ارسال توسط کاربر لغو گردید';
          }
          break;
        }

        // Check if daily limits reached
        if ((account.dailySentCount || 0) >= maxDailyLimit || (appState.scheduler.dailySentCount || 0) >= maxDailyLimit) {
          if (workerProgress) {
            workerProgress.status = 'finished';
            workerProgress.lastAction = 'سقف مجاز روزانه این حساب تکمیل شد';
          }
          break;
        }

        // Check if account has entered flood wait
        if (account.floodWaitUntil && account.floodWaitUntil > Date.now()) {
          if (workerProgress) {
            workerProgress.status = 'flood_waited';
            workerProgress.lastAction = 'محدودیت FloodWait تلگرام';
          }
          break;
        }

        const group = claimNextGroupForWorker(account.id);
        if (!group) {
          // No more unclaimed groups right now
          break;
        }

        if (isBroadcastCancellationRequested) {
          releaseGroupBackToSharedQueue(group, 'توقف دستی');
          break;
        }

        // Check group cooldown
        if (group.lastPostedAt && !isManualTrigger) {
          const lastPostedTime = new Date(group.lastPostedAt).getTime();
          if (nowTime - lastPostedTime < minGroupIntervalMs) {
            addLog('info', `[زمان تنفس گروه] گروه "${group.title}" اخیراً پیام دریافت کرده است. عبور جهت جلوگیری از اسپم...`, group.title);
            reportGroupDetails.push({
              groupId: group.id,
              groupTitle: group.title,
              usernameOrLink: group.usernameOrLink,
              status: 'skipped',
              botDetected: false,
              botResolved: false,
              message: 'در زمان تنفس گروه (ارسال اخیر)',
            });
            markGroupAsCompleted(group);
            continue;
          }
        }

        if (workerProgress) {
          workerProgress.status = 'antibot_verifying';
          workerProgress.currentGroupId = group.id;
          workerProgress.currentGroupTitle = group.title;
          workerProgress.lastAction = `در حال ورود و ارزیابی موانع آنتی‌بات "${group.title}"...`;
        }

        let botDetectedInGroup = false;
        const existingMon = (appState.monitoringReports || []).find(r => r.groupId === group.title || r.groupTitle === group.title);
        if (existingMon && existingMon.botDetected) {
          botDetectedInGroup = true;
        }

        let isVerified = false;
        let sentSuccessForGroup = false;
        let peer: any = null;

        try {
          if (isBroadcastCancellationRequested) {
            releaseGroupBackToSharedQueue(group, 'توقف دستی');
            break;
          }

          peer = await resolveAndJoinGroup(accClient, group.usernameOrLink);

          if (isBroadcastCancellationRequested) {
            releaseGroupBackToSharedQueue(group, 'توقف دستی');
            break;
          }

          if (botToken) {
            await ensureBotInGroup(accClient, peer, botToken);
          }

          const verification = await handleAntiBotAndGroupVerification(accClient, peer, group.title);
          if (verification.botDetected) {
            botDetectedInGroup = true;
          }

          if (isBroadcastCancellationRequested) {
            releaseGroupBackToSharedQueue(group, 'توقف دستی');
            break;
          }

          if (verification.isClear) {
            if (workerProgress) {
              workerProgress.status = 'sending';
              workerProgress.lastAction = `در حال انتشار پیام تبلیغاتی در "${group.title}"...`;
            }

            const sendRes = await sendCampaignWithRetry(accClient, peer, textMessage, tempImgPath);

            if (sendRes.success) {
              const msgId = sendRes.sentResult?.id || (Array.isArray(sendRes.sentResult) ? sendRes.sentResult[0]?.id : undefined);
              await new Promise(r => setTimeout(r, 1500));

              if (msgId) {
                try {
                  const checkedMsgs = await accClient.getMessages(peer, { ids: [msgId] });
                  if (checkedMsgs && checkedMsgs.length > 0 && checkedMsgs[0] && checkedMsgs[0].id === msgId) {
                    isVerified = true;
                  }
                } catch (e) {
                  isVerified = true;
                }
              } else if (sendRes.sentResult) {
                isVerified = true;
              }
            } else {
              addLog('warning', `[خطای ارسال اکانت] ارسال با اکانت (${account.phoneNumber}) در "${group.title}" ناموفق بود: ${sendRes.error}`, group.title);
            }
          }

          if (isVerified) {
            sentSuccessForGroup = true;
            markGroupAsCompleted(group);

            const postTimeStr = new Date().toISOString();
            group.lastPostedAt = postTimeStr;
            group.lastPostedByAccountId = account.id;
            group.lastPostedByAccountPhone = account.phoneNumber;
            group.status = 'joined';
            group.errorMessage = undefined;

            account.dailySentCount = (account.dailySentCount || 0) + 1;
            account.lastUsedAt = postTimeStr;
            appState.scheduler.dailySentCount = (appState.scheduler.dailySentCount || 0) + 1;

            if (accStats) accStats.sentCount++;
            if (workerProgress) {
              workerProgress.sentSuccessCount++;
              workerProgress.status = 'cooldown';
              workerProgress.lastAction = `پیام با موفقیت در "${group.title}" ثبت شد. استراحت هوشمند...`;
            }
            if (appState.activeBroadcastProgress) {
              appState.activeBroadcastProgress.successCount++;
            }

            updateGroupMonitoringReport({
              groupId: group.title,
              groupTitle: group.title,
              step: 'CAMPAIGN_SENT',
              requiresManualCheck: false,
              statusMessage: `🚀 پیام کمپین با موفقیت توسط اکانت همزمان (${account.userProfile?.firstName || account.phoneNumber}) منتشر و تایید شد!`,
            });

            addLog(
              'success',
              `[ارسال موفق همزمان] پیام در گروه "${group.title}" توسط اکانت (${account.userProfile?.firstName || account.phoneNumber}) ارسال و تایید شد.`,
              group.title,
              undefined,
              campaign.title
            );

            reportGroupDetails.push({
              groupId: group.id,
              groupTitle: group.title,
              usernameOrLink: group.usernameOrLink,
              status: 'success',
              botDetected: botDetectedInGroup,
              botResolved: botDetectedInGroup,
              accountPhone: account.phoneNumber,
              accountName: account.userProfile?.firstName,
              message: botDetectedInGroup ? 'ارسال موفق با خنثی‌سازی ربات ناظر' : 'ارسال همزمان موفق و تایید شده',
              postedAt: postTimeStr,
            });

            // Interruptible independent jitter delay for this worker to mimic realistic human behavior
            const baseJitterSec = appState.scheduler.jitterSeconds || 45;
            const randomJitterMs = Math.min(8000, Math.floor((baseJitterSec + Math.random() * 15) * 1000));
            const jitterStart = Date.now();
            while (Date.now() - jitterStart < randomJitterMs) {
              if (isBroadcastCancellationRequested) break;
              await new Promise(r => setTimeout(r, Math.min(200, randomJitterMs - (Date.now() - jitterStart))));
            }
          } else {
            // Anti-bot or message check failed on this group for this account
            if (peer) {
              try { await leaveGroupAndClearHistory(accClient, peer); } catch (e) {}
            }
            if (accStats) accStats.failedCount++;
            if (workerProgress) workerProgress.failedCount++;
            markGroupAsCompleted(group);

            group.status = 'failed';
            group.errorMessage = 'پیام در گروه تایید نشد یا توسط ربات ناظر رد گردید.';
            reportGroupDetails.push({
              groupId: group.id,
              groupTitle: group.title,
              usernameOrLink: group.usernameOrLink,
              status: 'failed',
              botDetected: botDetectedInGroup,
              botResolved: false,
              accountPhone: account.phoneNumber,
              accountName: account.userProfile?.firstName,
              message: 'پیام توسط ربات ناظر حذف گردید یا تایید نشد.',
            });
            if (appState.activeBroadcastProgress) {
              appState.activeBroadcastProgress.failedCount++;
            }
          }
        } catch (accErr: any) {
          console.error(`Worker error for account ${account.phoneNumber} on group ${group.title}:`, accErr);
          handleGramJsFloodWait(accErr);
          const secs = parseFloodWaitSeconds(accErr);

          if (secs && secs > 0) {
            // Telegram FloodWait Hit: Dynamic Failover Redistribution!
            account.status = 'flood_wait';
            account.floodWaitUntil = Date.now() + secs * 1000;
            if (accStats) accStats.hitRateLimit = true;

            if (workerProgress) {
              workerProgress.status = 'flood_waited';
              workerProgress.lastAction = `محدودیت FloodWait به مدت ${Math.ceil(secs / 60)} دقیقه. وظایف به سایر اکانت‌ها واگذار شد.`;
            }

            const activeOthers = availableAccounts.filter(a => a.id !== account.id && (!a.floodWaitUntil || a.floodWaitUntil < Date.now()));
            addLog(
              'warning',
              `[محدودیت تلگرام و توزیع مجدد خودکار] اکانت (${account.phoneNumber}) به محدودیت موقت تلگرام برخورد کرد. گروه "${group.title}" و سایر گروه‌های باقی‌مانده بلافاصله بین ${activeOthers.length} اکانت فعال دیگر تقسیم گردیدند.`
            );

            // Release the current group back so other active parallel workers pick it up immediately
            releaseGroupBackToSharedQueue(group, `محدودیت FloodWait اکانت ${account.phoneNumber}`);
            
            // Exit this worker loop
            break;
          } else {
            // Non-flood error (e.g. invalid invite link or user ban in this specific group)
            if (peer) {
              try { await leaveGroupAndClearHistory(accClient, peer); } catch (e) {}
            }
            if (accStats) accStats.failedCount++;
            if (workerProgress) workerProgress.failedCount++;
            markGroupAsCompleted(group);

            group.status = 'failed';
            group.errorMessage = translateTgError(accErr);
            reportGroupDetails.push({
              groupId: group.id,
              groupTitle: group.title,
              usernameOrLink: group.usernameOrLink,
              status: 'failed',
              botDetected: botDetectedInGroup,
              botResolved: false,
              accountPhone: account.phoneNumber,
              accountName: account.userProfile?.firstName,
              message: translateTgError(accErr),
            });
            if (appState.activeBroadcastProgress) {
              appState.activeBroadcastProgress.failedCount++;
            }
          }
        }
      }

      if (workerProgress && workerProgress.status !== 'flood_waited') {
        workerProgress.status = 'finished';
        workerProgress.lastAction = `پایان پردازش صف (موفق: ${workerProgress.sentSuccessCount}، خطا: ${workerProgress.failedCount})`;
      }
    }

    // 5. Run Worker Pool: Parallel Multi-Worker Dispatch or Sequential Rotation
    if (availableAccounts.length > 0) {
      if (isParallel) {
        addLog('info', `[اجرای همزمان موازی] در حال اجرای ${availableAccounts.length} کانال ارسال موازی همزمان بدون تداخل برای حداکثر سرعت...`);
        // Launch all account workers concurrently
        await Promise.all(availableAccounts.map((acc, idx) => runAccountWorker(acc, idx)));
      } else {
        // Sequential single-channel rotation mode
        for (let i = 0; i < availableAccounts.length; i++) {
          if (completedGroupIds.size >= targetGroupsToProcess.length) break;
          await runAccountWorker(availableAccounts[i], i);
        }
      }
    }

    // 6. Bot API Fallback for any remaining uncompleted groups
    const remainingUncompletedGroups = targetGroupsToProcess.filter(g => !completedGroupIds.has(g.id));
    if (remainingUncompletedGroups.length > 0 && botToken) {
      addLog('info', `[تکمیل با Bot API] تعداد ${remainingUncompletedGroups.length} گروه باقی‌مانده توسط ربات واسط تلگرام ارسال خواهند شد...`);
      for (const group of remainingUncompletedGroups) {
        try {
          await sendViaBotApi(botToken, group.usernameOrLink, textMessage, campaign.imageUrl);
          const postTimeStr = new Date().toISOString();
          group.lastPostedAt = postTimeStr;
          group.lastPostedByAccountId = 'bot_api';
          group.lastPostedByAccountPhone = 'Bot API';
          group.status = 'joined';
          group.errorMessage = undefined;
          appState.scheduler.dailySentCount = (appState.scheduler.dailySentCount || 0) + 1;
          usedAccountPhones.add('Bot API');

          updateGroupMonitoringReport({
            groupId: group.title,
            groupTitle: group.title,
            step: 'CAMPAIGN_SENT',
            requiresManualCheck: false,
            statusMessage: '🤖 [جایگزینی ربات واسط] پیام کمپین از طریق Bot API با موفقیت منتشر شد.',
          });

          addLog('success', `[جایگزینی Bot API] پیام با موفقیت از طریق ربات واسط در گروه "${group.title}" منتشر گردید.`, group.title, undefined, campaign.title);

          reportGroupDetails.push({
            groupId: group.id,
            groupTitle: group.title,
            usernameOrLink: group.usernameOrLink,
            status: 'success',
            botDetected: false,
            botResolved: false,
            accountPhone: 'Bot API',
            accountName: 'ربات واسط',
            message: 'ارسال با موفقیت از طریق Bot API',
            postedAt: postTimeStr,
          });
          markGroupAsCompleted(group);
        } catch (botErr: any) {
          group.status = 'failed';
          group.errorMessage = `UserBot & Bot API: ${botErr.message}`;
          reportGroupDetails.push({
            groupId: group.id,
            groupTitle: group.title,
            usernameOrLink: group.usernameOrLink,
            status: 'failed',
            botDetected: false,
            botResolved: false,
            accountPhone: 'Bot API',
            accountName: 'ربات واسط',
            message: botErr.message,
          });
          markGroupAsCompleted(group);
        }
      }
    }

    // Generate Final Execution Report
    const broadcastDurationSeconds = Math.max(1, Math.round((Date.now() - broadcastStartTime) / 1000));
    const totalAttempted = reportGroupDetails.filter(d => d.status !== 'skipped').length;
    reportSuccessCount = reportGroupDetails.filter(d => d.status === 'success').length;
    reportFailedCount = reportGroupDetails.filter(d => d.status === 'failed').length;
    const botDetectedCount = reportGroupDetails.filter(d => d.botDetected).length;
    const botResolvedCount = reportGroupDetails.filter(d => d.botDetected && d.status === 'success').length;

    const nowPersian = new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' - ' + new Date().toLocaleDateString('fa-IR');

    const accountBreakdownList = Array.from(accountStatsMap.values()).map(s => ({
      accountId: s.accountId,
      accountPhone: s.accountPhone,
      accountName: s.accountName,
      sentCount: s.sentCount,
      failedCount: s.failedCount,
      hitRateLimit: Boolean(s.hitRateLimit),
    }));

    const executionReport: any = {
      id: 'rpt_' + Date.now(),
      timestamp: nowPersian,
      durationSeconds: broadcastDurationSeconds,
      campaignTitle: campaign.title,
      totalAttempted,
      successCount: reportSuccessCount,
      failedCount: reportFailedCount,
      botDetectedCount,
      botResolvedCount,
      accountsUsedCount: usedAccountPhones.size,
      accountsList: Array.from(usedAccountPhones),
      dispatchMode: isParallel ? 'parallel_multichannel' : 'sequential_rotation',
      accountBreakdown: accountBreakdownList,
      details: reportGroupDetails,
    };

    appState.lastBroadcastReport = executionReport;
    if (!appState.broadcastHistory) appState.broadcastHistory = [];
    appState.broadcastHistory.unshift(executionReport);
    if (appState.broadcastHistory.length > 20) {
      appState.broadcastHistory = appState.broadcastHistory.slice(0, 20);
    }

    addLog(
      'success',
      `[گزارش کامل اجرای ارسال] پایان ارسال کمپین "${campaign.title}" | مدت زمان: ${broadcastDurationSeconds} ثانیه (${isParallel ? 'ارسال همزمان موازی' : 'ارسال تک‌اکانت'}) | اقدام روی ${totalAttempted} گروه: ${reportSuccessCount} موفق، ${reportFailedCount} ناموفق، ${botResolvedCount} گروه دارای ربات ناظر خنثی‌شده.`
    );
  } finally {
    if (tempImgPath && fs.existsSync(tempImgPath)) {
      try { fs.unlinkSync(tempImgPath); } catch (e) {}
    }
    if (appState.activeBroadcastProgress) {
      appState.activeBroadcastProgress.isRunning = false;
    }
    saveData();
    isBroadcastRunning = false;
  }

  return {
    success: reportSuccessCount > 0,
    message: `فرایند ارسال به پایان رسید. (موفق: ${reportSuccessCount}، ناموفق: ${reportFailedCount})`,
    sentCount: reportSuccessCount,
    failedCount: reportFailedCount,
  };
}

// 15. Telegram Groups Auto-Sync Endpoint
app.post('/api/telegram/sync-groups', async (req, res) => {
  try {
    const client = await getOrInitTgClient();
    if (!client || !appState.credentials.isConnected) {
      res.status(400).json({ error: 'حساب تلگرام متصل نیست. لطفاً ابتدا وارد حساب تلگرام شوید.' });
      return;
    }
    const result = await syncTelegramGroups(client);
    res.json({ success: true, ...result, groups: appState.groups });
  } catch (err: any) {
    console.error('Group sync error:', err);
    res.status(500).json({ error: translateTgError(err) });
  }
});

// 16. Real-time Monitoring & Process Reports Endpoints
app.get('/api/monitoring/reports', (req, res) => {
  res.json({
    reports: appState.monitoringReports || [],
  });
});

app.post('/api/monitoring/clear', (req, res) => {
  appState.monitoringReports = [];
  saveData();
  res.json({ success: true, message: 'گزارش‌های مانیتورینگ پاکسازی شد.' });
});

app.post('/api/monitoring/mark-reviewed', (req, res) => {
  const { groupId } = req.body;
  if (appState.monitoringReports) {
    const report = appState.monitoringReports.find(r => r.groupId === groupId || r.id === groupId);
    if (report) {
      report.requiresManualCheck = false;
      report.statusMessage = '✅ توسط کاربر بررسی و تایید گردید.';
      saveData();
    }
  }
  res.json({ success: true, reports: appState.monitoringReports || [] });
});

// 17. Re-check Group Anti-Bot & Immediately Send Active Campaign Endpoint
app.post('/api/groups/recheck-and-send', async (req, res) => {
  const { target, groupId } = req.body;
  const searchTarget = target || groupId;

  if (!searchTarget) {
    res.status(400).json({ error: 'آیدی یا نام گروه مشخص نشده است.' });
    return;
  }

  const client = await getOrInitTgClient();
  if (!client || !appState.credentials.isConnected) {
    res.status(400).json({ error: 'حساب تلگرام متصل نیست. لطفاً ابتدا وارد حساب تلگرام شوید.' });
    return;
  }

  const activeCampaigns = appState.campaigns.filter(c => c.isActive);
  const campaign = activeCampaigns[0] || appState.campaigns[0];

  if (!campaign) {
    res.status(400).json({ error: 'هیچ کمپین یا محصول فعالی برای ارسال یافت نشد.' });
    return;
  }

  // Find target group or title
  const targetGroupObj = appState.groups.find(
    g => g.id === searchTarget || g.usernameOrLink.toLowerCase() === searchTarget.toLowerCase() || g.title.toLowerCase() === searchTarget.toLowerCase()
  );
  const targetUsernameOrTitle = targetGroupObj ? targetGroupObj.usernameOrLink : searchTarget;
  const groupTitleName = targetGroupObj ? targetGroupObj.title : searchTarget;

  let tempImgPath: string | undefined = undefined;
  if (campaign.imageUrl) {
    tempImgPath = await getImageFilePathForTelegram(campaign.imageUrl);
  }

  const textMessage = `📌 **${campaign.title}**\n\n💰 **قیمت:** ${campaign.price}\n\n📝 ${campaign.description}\n\n👤 **سفارش و ارتباط:** ${campaign.contactHandle}\n\n${campaign.hashtags.map(h => (h.startsWith('#') ? h : '#' + h)).join(' ')}`;

  try {
    const peer = await resolveAndJoinGroup(client, targetUsernameOrTitle);
    
    // 1. Re-verify & Resolve Anti-Bot Barriers
    addLog('info', `[بررسی مجدد گروه] در حال بررسی موانع و آنتی‌بات برای گروه "${groupTitleName}"...`);
    const verification = await handleAntiBotAndGroupVerification(client, peer, groupTitleName);

    if (!verification.isClear) {
      res.status(400).json({
        success: false,
        campaignSent: false,
        error: `مانع ارسال هنوز برطرف نشده است: ${verification.statusMessage}`,
        verification,
      });
      return;
    }

    // 2. Obstacles clear! Now immediately send active campaign message
    addLog('info', `[ارسال کمپین] موانع گروه "${groupTitleName}" برطرف گردید. در حال انتشار پیام اصلی کمپین "${campaign.title}"...`);
    
    const sendRes = await sendCampaignWithRetry(client, peer, textMessage, tempImgPath);

    if (!sendRes.success) {
      res.status(400).json({
        success: false,
        campaignSent: false,
        error: `خطا در ارسال پیام کمپین: ${sendRes.error}`,
      });
      return;
    }

    const sentResult = sendRes.sentResult;

    // 3. Verify Message Posted
    const msgId = sentResult?.id || (Array.isArray(sentResult) ? sentResult[0]?.id : undefined);
    await new Promise(r => setTimeout(r, 1500));

    let isVerified = false;
    if (msgId) {
      try {
        const checkedMsgs = await client.getMessages(peer, { ids: [msgId] });
        if (checkedMsgs && checkedMsgs.length > 0 && checkedMsgs[0] && checkedMsgs[0].id === msgId) {
          isVerified = true;
        }
      } catch (checkErr) {
        isVerified = true;
      }
    } else if (sentResult) {
      isVerified = true;
    }

    if (isVerified) {
      const nowStr = new Date().toISOString();
      if (targetGroupObj) {
        targetGroupObj.lastPostedAt = nowStr;
        targetGroupObj.status = 'joined';
        targetGroupObj.errorMessage = undefined;
      }

      updateGroupMonitoringReport({
        groupId: groupTitleName,
        groupTitle: groupTitleName,
        step: 'CAMPAIGN_SENT',
        botDetected: verification.botDetected,
        captchaClicked: verification.captchaClicked,
        channelJoined: verification.channelJoined,
        contactsInvited: verification.contactsInvited,
        requiresManualCheck: false,
        statusMessage: '🚀 مانع گروه رفع شد و پیام کمپین تبلیغاتی با موفقیت در گروه منتشر گردید!',
      });

      addLog('success', `[انتشار موفق کمپین] مانع گروه "${groupTitleName}" برطرف شد و پیام تبلیغاتی "${campaign.title}" با موفقیت ارسال شد!`);

      res.json({
        success: true,
        campaignSent: true,
        message: `مانع برطرف شد و پیام کمپین با موفقیت در گروه "${groupTitleName}" منتشر گردید!`,
      });
    } else {
      // Leave group and clear chat history from user's Telegram
      if (peer) {
        await leaveGroupAndClearHistory(client, peer);
      }

      if (targetGroupObj) {
        appState.groups = appState.groups.filter(g => g.id !== targetGroupObj.id);
      }

      updateGroupMonitoringReport({
        groupId: groupTitleName,
        groupTitle: groupTitleName,
        step: 'FAILED',
        requiresManualCheck: false,
        statusMessage: '❌ پیام توسط ربات ناظر حذف شد. گروه ترک شد و چت مربوطه از حساب تلگرام و نرم‌افزار پاکسازی گردید.',
      });

      addLog('error', `[ترک و پاکسازی] پیام در گروه "${groupTitleName}" توسط ربات ناظر حذف گردید. گروه ترک شد و چت مربوطه از حساب تلگرام و نرم‌افزار پاکسازی گردید.`);

      res.status(400).json({
        success: false,
        campaignSent: false,
        error: 'پیام ارسال شد اما بلافاصله توسط ربات ناظر گروه حذف گردید. گروه از حساب تلگرام ترک شد و چت آن پاکسازی گردید.',
      });
    }
  } catch (err: any) {
    console.error('Error in recheck-and-send route:', err);
    const botToken = appState.credentials.botToken;

    // Fallback to Bot API Helper if userbot encounters an error
    if (botToken) {
      try {
        await sendViaBotApi(botToken, searchTarget, textMessage, campaign.imageUrl);
        const nowStr = new Date().toISOString();
        if (targetGroupObj) {
          targetGroupObj.lastPostedAt = nowStr;
          targetGroupObj.status = 'joined';
          targetGroupObj.errorMessage = undefined;
        }

        updateGroupMonitoringReport({
          groupId: groupTitleName,
          groupTitle: groupTitleName,
          step: 'CAMPAIGN_SENT',
          requiresManualCheck: false,
          statusMessage: '🤖 [ارسال موفق ربات واسط] اکانت اصلی دارای محدودیت بود اما پیام کمپین با موفقیت از طریق ربات واسط ارسال گردید!',
        });

        addLog('success', `[ارسال موفق ربات واسط] پیام کمپین در گروه "${groupTitleName}" از طریق ربات واسط تلگرام ارسال شد.`);

        return res.json({
          success: true,
          campaignSent: true,
          message: `ارسال با موفقیت از طریق ربات واسط (Bot API) در گروه "${groupTitleName}" انجام گردید!`,
        });
      } catch (botErr: any) {
        console.error('Bot API fallback failed as well:', botErr);
      }
    }

    const friendly = translateTgError(err);
    res.status(500).json({ error: friendly });
  } finally {
    if (tempImgPath && fs.existsSync(tempImgPath)) {
      try { fs.unlinkSync(tempImgPath); } catch (e) {}
    }
  }
});

// 13. Direct Test Send Endpoint (e.g. to @amin_moghadasi or specific target)
app.post('/api/send-direct-test', async (req, res) => {
  const { target, botToken: inputBotToken, useBotOnly, mode } = req.body;
  const chatTarget = target ? String(target).trim() : '@amin_moghadasi';
  const botToken = (inputBotToken && String(inputBotToken).trim()) || appState.credentials.botToken;
  const isBotOnlyMode = Boolean(useBotOnly) || mode === 'bot_only' || Boolean(inputBotToken);

  const activeCampaigns = appState.campaigns.filter(c => c.isActive);
  const campaign = activeCampaigns[0] || appState.campaigns[0];
  const textMessage = campaign 
    ? `📌 **${campaign.title}**\n\n💰 **قیمت:** ${campaign.price}\n\n📝 ${campaign.description}\n\n👤 **سفارش و ارتباط:** ${campaign.contactHandle}` 
    : 'سلام، این یک پیام تست از سامانه مدیریت تبلیغات تلگرام است.';

  // If Bot-Only test is requested (e.g. from Bot API Test button)
  if (isBotOnlyMode) {
    if (!botToken) {
      res.status(400).json({ error: 'توکن ربات تلگرام مشخص نشده است. لطفاً توکن ربات را وارد کنید.' });
      return;
    }

    // Try to automatically join group and invite Bot API Bot via UserBot if connected
    try {
      const client = await getOrInitTgClient();
      if (client && appState.credentials.isConnected) {
        try {
          const peer = await resolveAndJoinGroup(client, chatTarget);
          await ensureBotInGroup(client, peer, botToken);
        } catch (joinErr: any) {
          console.log('[Bot-Only Mode] UserBot resolve/invite notice:', joinErr.message || joinErr);
        }
      }
    } catch (e) {}

    try {
      await sendViaBotApi(botToken, chatTarget, textMessage, campaign?.imageUrl);
      addLog('success', `پیام تست مستقیماً از طریق ربات واسط تلگرام به "${chatTarget}" تحویل گردید.`);
      res.json({ 
        success: true, 
        message: `پیام تست با موفقیت توسط ربات تلگرام مشخص شده به ${chatTarget} ارسال گردید.` 
      });
      return;
    } catch (botErr: any) {
      res.status(400).json({ error: `خطای ارسال با ربات تلگرام: ${botErr.message}` });
      return;
    }
  }

  const client = await getOrInitTgClient();

  let tempImgPath: string | undefined = undefined;
  if (campaign?.imageUrl) {
    tempImgPath = await getImageFilePathForTelegram(campaign.imageUrl);
  }

  if (client && appState.credentials.isConnected) {
    let peer: any = null;
    let sentResult: any = null;
    let isVerified = false;

    try {
      peer = await resolveAndJoinGroup(client, chatTarget);
      await handleAntiBotAndGroupVerification(client, peer, chatTarget);

      if (tempImgPath && fs.existsSync(tempImgPath)) {
        sentResult = await client.sendFile(peer, {
          file: tempImgPath,
          caption: textMessage,
          parseMode: 'md',
        });
      } else {
        sentResult = await client.sendMessage(peer, { message: textMessage, parseMode: 'md' });
      }

      // Verification Check
      const msgId = sentResult?.id || (Array.isArray(sentResult) ? sentResult[0]?.id : undefined);
      await new Promise(r => setTimeout(r, 1500));

      if (msgId) {
        try {
          const checked = await client.getMessages(peer, { ids: [msgId] });
          if (checked && checked.length > 0 && checked[0] && checked[0].id === msgId) {
            isVerified = true;
          }
        } catch (e) {
          isVerified = true;
        }
      } else if (sentResult) {
        isVerified = true;
      }

      if (isVerified) {
        addLog('success', `پیام تست همراه با تصویر به کاربر/گروه "${chatTarget}" ارسال و تایید شد.`);
        res.json({ success: true, message: `پیام تست با موفقیت به ${chatTarget} ارسال و تایید گردید.` });
        return;
      } else {
        // Message was deleted or not posted
        if (peer) {
          await leaveGroupAndClearHistory(client, peer);
        }
        addLog('warning', `پیام تست به "${chatTarget}" ناپایدار بود یا بلافاصله حذف شد. گروه ترک گردید و چت از تلگرام پاک شد.`);
        res.status(400).json({ error: `پیام در ${chatTarget} ثبت نگردید یا حذف شد. حساب کاربری از این گروه خارج شد و چت پاک گردید.` });
        return;
      }
    } catch (tgErr: any) {
      console.error('Direct test userbot error:', tgErr);
      if (peer) {
        await leaveGroupAndClearHistory(client, peer);
      }
      const friendly = translateTgError(tgErr);
      if (botToken) {
        try {
          await sendViaBotApi(botToken, chatTarget, textMessage, campaign?.imageUrl);
          addLog('success', `پیام تست از طریق Bot API با موفقیت به "${chatTarget}" تحویل گردید.`);
          res.json({ success: true, message: `پیام تست از طریق Bot API با موفقیت به ${chatTarget} ارسال شد.` });
          return;
        } catch (botErr: any) {
          res.status(400).json({ error: `Userbot: ${friendly} | Bot API: ${botErr.message}` });
          return;
        }
      }
      res.status(400).json({ error: friendly });
      return;
    } finally {
      if (tempImgPath && fs.existsSync(tempImgPath)) {
        try { fs.unlinkSync(tempImgPath); } catch (e) {}
      }
    }
  }

  if (botToken) {
    try {
      await sendViaBotApi(botToken, chatTarget, textMessage, campaign?.imageUrl);
      addLog('success', `پیام تست از طریق Bot API با موفقیت به "${chatTarget}" تحویل شد.`);
      res.json({ success: true, message: `پیام تست از طریق Bot API با موفقیت به ${chatTarget} ارسال شد.` });
      return;
    } catch (botErr: any) {
      res.status(400).json({ error: `خطای Bot API: ${botErr.message}` });
      return;
    }
  }

  res.status(400).json({ 
    error: 'حساب تلگرام یا توکن ربات متصل نیست! لطفاً توکن ربات تلگرام یا شماره تلفن و کد ۵ رقمی را وارد نمایید.' 
  });
});

// 11. Send Immediate Broadcast API
app.post('/api/broadcast/send-now', (req, res) => {
  if (isBroadcastRunning) {
    res.status(400).json({ success: false, message: 'یک عملیات ارسال در حال حاضر در حال اجرا است.' });
    return;
  }

  isBroadcastCancellationRequested = false;
  // Trigger background execution without hanging HTTP connection
  executeBroadcast(true).catch(err => {
    console.error('Background broadcast execution error:', err);
    isBroadcastRunning = false;
    if (appState.activeBroadcastProgress) {
      appState.activeBroadcastProgress.isRunning = false;
    }
    saveData();
  });

  res.json({ success: true, message: 'عملیات ارسال به گروه‌ها آغاز گردید.' });
});

// 11.1 Live Broadcast Progress API
app.get('/api/broadcast/live-progress', (req, res) => {
  res.json({
    isRunning: Boolean(isBroadcastRunning),
    progress: appState.activeBroadcastProgress || null,
    lastReport: appState.lastBroadcastReport || null,
  });
});

// 11.2 Stop / Cancel Broadcast Process API
app.post('/api/broadcast/stop', (req, res) => {
  isBroadcastCancellationRequested = true;
  isBroadcastRunning = false;

  addLog('warning', '[توقف اضطراری] دستور لغو و توقف فوری فرایند ارسال توسط کاربر صادر و اعمال گردید.');

  if (appState.activeBroadcastProgress) {
    appState.activeBroadcastProgress.isRunning = false;
    if (appState.activeBroadcastProgress.workers) {
      appState.activeBroadcastProgress.workers.forEach(w => {
        w.status = 'finished';
        w.lastAction = 'عملیات ارسال متوقف گردید.';
      });
    }
  }

  saveData();
  res.json({ success: true, message: 'فرایند ارسال با موفقیت متوقف شد.' });
});

// 12. Clear logs
app.post('/api/logs/clear', (req, res) => {
  appState.logs = [
    {
      id: 'log_' + Date.now(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'تاریخچه لاگ‌ها پاکسازی گردید.',
    }
  ];
  saveData();
  res.json({ success: true, logs: appState.logs });
});

// 14. Update Anti-Bot Settings
app.post('/api/scheduler/update-antibot', (req, res) => {
  const { autoClickCaptcha, autoForceJoinChannels, autoInviteContacts, contactsToInviteCount, sendGreetingFirst, greetingMessage } = req.body;
  
  if (!appState.scheduler.antiBot) {
    appState.scheduler.antiBot = {
      autoClickCaptcha: true,
      autoForceJoinChannels: true,
      autoInviteContacts: true,
      contactsToInviteCount: 3,
      sendGreetingFirst: true,
      greetingMessage: 'سلام بچه ها',
    };
  }

  if (autoClickCaptcha !== undefined) appState.scheduler.antiBot.autoClickCaptcha = Boolean(autoClickCaptcha);
  if (autoForceJoinChannels !== undefined) appState.scheduler.antiBot.autoForceJoinChannels = Boolean(autoForceJoinChannels);
  if (autoInviteContacts !== undefined) appState.scheduler.antiBot.autoInviteContacts = Boolean(autoInviteContacts);
  if (sendGreetingFirst !== undefined) appState.scheduler.antiBot.sendGreetingFirst = Boolean(sendGreetingFirst);
  if (typeof greetingMessage === 'string' && greetingMessage.trim().length > 0) {
    appState.scheduler.antiBot.greetingMessage = greetingMessage.trim();
  }
  if (typeof contactsToInviteCount === 'number' && contactsToInviteCount > 0) {
    appState.scheduler.antiBot.contactsToInviteCount = contactsToInviteCount;
  }

  saveData();
  addLog('info', 'تنظیمات سیستم هوشمند آنتی‌بات و عبور از قفل گروه‌ها به‌روزرسانی شد.');
  res.json({ success: true, antiBot: appState.scheduler.antiBot });
});

// 18. Export Data Backup Endpoint
app.get('/api/backup/export', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=telegram_promoter_backup_${Date.now()}.json`);
  res.send(JSON.stringify(appState, null, 2));
});

// 19. Import Data Backup Endpoint
app.post('/api/backup/import', (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'فایل پشتیبان نامعتبر است.' });
    return;
  }

  if (Array.isArray(data.groups)) {
    appState.groups = data.groups;
  }
  if (Array.isArray(data.campaigns)) {
    appState.campaigns = data.campaigns;
  }
  if (data.scheduler) {
    appState.scheduler = { ...appState.scheduler, ...data.scheduler };
  }
  if (data.credentials) {
    appState.credentials = { ...appState.credentials, ...data.credentials };
  }

  saveData();
  addLog('success', 'بازیابی موفق اطلاعات گروه‌ها و کمپین‌ها از فایل پشتیبان JSON انجام شد.');

  res.json({
    success: true,
    message: 'اطلاعات با موفقیت بازیابی شد.',
    groupsCount: appState.groups.length,
    campaignsCount: appState.campaigns.length,
  });
});

// 20. Multi-Account Management Endpoints
app.get('/api/accounts/list', (req, res) => {
  syncAccountsState();
  res.json({
    accounts: appState.accounts || [],
    activeAccountId: appState.activeAccountId,
  });
});

app.post('/api/accounts/select-active', async (req, res) => {
  const { accountId } = req.body;
  syncAccountsState();
  const acc = (appState.accounts || []).find(a => a.id === accountId);
  if (!acc) {
    res.status(404).json({ error: 'حساب کاربری مورد نظر یافت نشد.' });
    return;
  }

  // Disconnect existing client so new account connects cleanly
  if (activeTgClient) {
    try {
      await activeTgClient.disconnect();
    } catch (e) {}
    activeTgClient = null;
  }

  appState.activeAccountId = acc.id;
  appState.credentials.phoneNumber = acc.phoneNumber;
  appState.credentials.apiId = acc.apiId || DEFAULT_API_ID;
  appState.credentials.apiHash = acc.apiHash || DEFAULT_API_HASH;
  appState.credentials.sessionString = acc.sessionString;
  appState.credentials.userProfile = acc.userProfile;
  appState.credentials.isConnected = true;
  saveData();

  addLog('info', `[تغییر اکانت فعال] اکانت فعال نرم‌افزار با یک کلیک به (${acc.userProfile?.firstName || acc.phoneNumber}) تغییر یافت.`);
  res.json({
    success: true,
    accounts: appState.accounts,
    activeAccountId: appState.activeAccountId,
    credentials: appState.credentials,
  });
});

app.post('/api/accounts/toggle', (req, res) => {
  const { accountId, isActive } = req.body;
  syncAccountsState();
  const acc = (appState.accounts || []).find(a => a.id === accountId);
  if (!acc) {
    res.status(404).json({ error: 'حساب کاربری یافت نشد.' });
    return;
  }

  acc.isActive = Boolean(isActive);
  saveData();

  const statusText = acc.isActive ? 'فعال در چرخش' : 'غیرفعال شد';
  addLog('info', `[مدیریت اکانت] وضعیت اکانت (${acc.userProfile?.firstName || acc.phoneNumber}) به ${statusText} تغییر یافت.`);
  res.json({ success: true, accounts: appState.accounts });
});

app.post('/api/accounts/delete', (req, res) => {
  const { accountId } = req.body;
  syncAccountsState();
  const targetAcc = (appState.accounts || []).find(a => a.id === accountId);
  if (!targetAcc) {
    res.status(404).json({ error: 'حساب کاربری یافت نشد.' });
    return;
  }

  appState.accounts = (appState.accounts || []).filter(a => a.id !== accountId);

  // If deleted account was the active account in credentials, update credentials
  if (appState.activeAccountId === accountId || appState.credentials.phoneNumber === targetAcc.phoneNumber) {
    if (appState.accounts.length > 0) {
      const nextAcc = appState.accounts[0];
      appState.activeAccountId = nextAcc.id;
      appState.credentials.phoneNumber = nextAcc.phoneNumber;
      appState.credentials.sessionString = nextAcc.sessionString;
      appState.credentials.userProfile = nextAcc.userProfile;
    } else {
      appState.activeAccountId = undefined;
      appState.credentials.isConnected = false;
      appState.credentials.sessionString = '';
      appState.credentials.userProfile = undefined;
    }
  }

  saveData();
  addLog('warning', `[حذف اکانت] اکانت (${targetAcc.userProfile?.firstName || targetAcc.phoneNumber}) از سیستم حذف شد.`);
  res.json({ success: true, accounts: appState.accounts, activeAccountId: appState.activeAccountId });
});

// Helper store for multi-account login sessions
const multiAccLoginSessionsMap = new Map<string, any>();

app.post('/api/accounts/add-start', async (req, res) => {
  const { phoneNumber, apiId, apiHash } = req.body;
  if (!phoneNumber) {
    res.status(400).json({ error: 'شماره تلفن الزامی است.' });
    return;
  }

  const cleanPhone = cleanPhoneNumber(phoneNumber);
  if (!cleanPhone || cleanPhone.length < 8) {
    res.status(400).json({ error: 'شماره تلفن وارد شده نامعتبر است. فرمت صحیح: 989123456789+' });
    return;
  }

  try {
    await loadGramJS();
    if (!TelegramClient || !StringSession) {
      res.status(500).json({ error: 'کتابخانه تلگرام بارگذاری نشد.' });
      return;
    }

    const effectiveApiId = parseInt(apiId || appState.credentials.apiId || DEFAULT_API_ID, 10);
    const effectiveApiHash = apiHash || appState.credentials.apiHash || DEFAULT_API_HASH;

    const tempSession = new StringSession('');
    const tempClient = new TelegramClient(tempSession, effectiveApiId, effectiveApiHash, {
      connectionRetries: 3,
      useWSS: false,
      timeout: 25000,
      autoReconnect: true,
      deviceModel: 'Desktop',
      systemVersion: 'Windows 10',
      appVersion: '4.16.8',
      langCode: 'en',
      systemLangCode: 'en',
    });

    await Promise.race([
      tempClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 20000))
    ]);

    const { phoneCodeHash } = await tempClient.sendCode(
      { apiId: effectiveApiId, apiHash: effectiveApiHash },
      cleanPhone
    );

    const sessionId = 'acc_login_' + Date.now();
    multiAccLoginSessionsMap.set(sessionId, {
      sessionId,
      phoneNumber: cleanPhone,
      phoneCodeHash,
      apiId: String(effectiveApiId),
      apiHash: effectiveApiHash,
      client: tempClient,
    });

    res.json({
      success: true,
      sessionId,
      message: 'کد تایید تلگرام به حساب شما ارسال گردید.',
    });
  } catch (err: any) {
    console.error('Account add-start error:', err);
    res.status(400).json({ error: translateTgError(err) });
  }
});

app.post('/api/accounts/add-verify', async (req, res) => {
  const { sessionId, phoneCode, password } = req.body;
  if (!sessionId || !phoneCode) {
    res.status(400).json({ error: 'کد ورود و شناسه نشست الزامی است.' });
    return;
  }

  const loginSession = multiAccLoginSessionsMap.get(sessionId);
  if (!loginSession || !loginSession.client) {
    res.status(400).json({ error: 'نشست ورود معتبر نیست یا منقضی شده است. لطفاً دوباره تلاش کنید.' });
    return;
  }

  const { client, phoneNumber, phoneCodeHash, apiId, apiHash } = loginSession;

  try {
    const apiIdNum = parseInt(apiId, 10);

    try {
      if (Api && Api.auth && Api.auth.SignIn) {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash: phoneCodeHash || '',
            phoneCode,
          })
        );
      } else {
        throw new Error('کتابخانه تلگرام بارگذاری نشده است');
      }
    } catch (codeErr: any) {
      const errStr = String(codeErr.errorMessage || codeErr.message || codeErr);
      if (errStr.includes('SESSION_PASSWORD_NEEDED') || errStr.includes('2FA')) {
        if (!password) {
          res.status(401).json({
            requiresPassword: true,
            error: 'تایید دو مرحله‌ای (2FA) برای این حساب فعال است. لطفاً رمز عبور را وارد نمایید.',
          });
          return;
        }
        await verify2FAPassword(client, password, apiIdNum, apiHash);
      } else {
        throw codeErr;
      }
    }

    const sessionString = client.session.save();
    const me = await client.getMe();

    const userProfile = {
      id: me.id ? me.id.toString() : 'me',
      firstName: me.firstName || '',
      lastName: me.lastName || '',
      username: me.username || '',
      phone: me.phone || phoneNumber,
    };

    const newAcc = {
      id: 'acc_' + Date.now(),
      phoneNumber: me.phone ? '+' + me.phone : phoneNumber,
      apiId,
      apiHash,
      sessionString,
      userProfile,
      isActive: true,
      dailySentCount: 0,
      status: 'active' as const,
    };

    syncAccountsState();
    appState.accounts.push(newAcc);
    appState.activeAccountId = newAcc.id;

    // Set as active credentials
    appState.credentials.phoneNumber = newAcc.phoneNumber;
    appState.credentials.apiId = apiId;
    appState.credentials.apiHash = apiHash;
    appState.credentials.sessionString = sessionString;
    appState.credentials.userProfile = userProfile;
    appState.credentials.isConnected = true;

    saveData();
    multiAccLoginSessionsMap.delete(sessionId);

    addLog('success', `[افزودن اکانت] حساب جدید (${userProfile.firstName || newAcc.phoneNumber}) با موفقیت متصل و به چرخش ارسال اضافه گردید.`);

    res.json({
      success: true,
      message: 'اکانت جدید با موفقیت به سیستم اضافه گردید.',
      accounts: appState.accounts,
      activeAccountId: appState.activeAccountId,
    });
  } catch (err: any) {
    console.error('Account add-verify error:', err);
    res.status(500).json({ error: translateTgError(err) });
  }
});

// ============================================================================
// ============================================================================
// GEMINI AI INTEGRATION FOR MELODY PERSONA (26-Year-Old Tehran Girl)
// ============================================================================
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  try {
    aiClient = new GoogleGenAI(apiKey ? { apiKey } : {});
    return aiClient;
  } catch (e: any) {
    console.warn('Failed to initialize GoogleGenAI client:', e?.message || e);
    return null;
  }
}

// Helper: Extract partner demographics (gender, age, city) or user tags from bot announcement text
function extractPartnerMetadata(text: string): { partnerTag?: string; partnerSnippet?: string } {
  if (!text) return {};
  const clean = text.trim();
  let partnerTag: string | undefined = undefined;
  let partnerSnippet: string | undefined = undefined;

  // 1. User Tag Match (e.g. /user_80Wazd, user_xxxx)
  const userTagMatch = clean.match(/\/user_[a-zA-Z0-9_-]+/) || clean.match(/user_[a-zA-Z0-9_-]+/i);
  if (userTagMatch) {
    partnerTag = userTagMatch[0];
  }

  // 2. Demographic Elements (جنسیت: ... سن: ... استان: ...)
  const parts: string[] = [];
  const genderMatch = clean.match(/جنسیت\s*[:：]\s*([^\n,|،]+)/);
  if (genderMatch && genderMatch[1]) {
    parts.push(`جنسیت: ${genderMatch[1].trim()}`);
  }
  const ageMatch = clean.match(/سن\s*[:：]\s*([^\n,|،]+)/);
  if (ageMatch && ageMatch[1]) {
    parts.push(`سن: ${ageMatch[1].trim()}`);
  }
  const locationMatch = clean.match(/(استان|شهر|موقعیت|فاصله)\s*[:：]\s*([^\n,|،]+)/);
  if (locationMatch && locationMatch[2]) {
    parts.push(`${locationMatch[1]}: ${locationMatch[2].trim()}`);
  }

  if (parts.length > 0) {
    partnerSnippet = parts.join('، ');
  } else {
    const partnerDescMatch = clean.match(/(هم‌صحبت|همصحبت|مخاطب|طرف مقابل|کاربر)\s*(شما)?\s*[:：]\s*([^\n]+)/);
    if (partnerDescMatch && partnerDescMatch[3]) {
      const desc = partnerDescMatch[3].trim();
      if (desc.length < 60 && !desc.includes('خارج شد') && !desc.includes('بست')) {
        partnerSnippet = desc;
      }
    }
  }

  return { partnerTag, partnerSnippet };
}

export interface AnonymousAiSessionContext {
  sessionId?: string;
  sessionIndex?: number;
  partnerTag?: string;
  partnerProfileSnippet?: string;
  currentTurn?: number;
  maxTurns?: number;
  isNewSession?: boolean;
  elapsedSeconds?: number;
  isUnder2Minutes?: boolean;
  conversationContext?: ConversationContext;
}

// Helper: Convert any number to fluent Persian words
function convertNumberToPersianWords(num: number): string {
  const yekan = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
  const dahgan = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
  const dahYek = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
  const sadgan = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

  if (num === 0) return 'صفر';
  if (num < 0) return 'منفی ' + convertNumberToPersianWords(-num);

  const parts: string[] = [];

  if (num >= 1000000) {
    const million = Math.floor(num / 1000000);
    parts.push(convertNumberToPersianWords(million) + ' میلیون');
    num %= 1000000;
  }

  if (num >= 1000) {
    const hezar = Math.floor(num / 1000);
    if (hezar === 1) {
      parts.push('هزار');
    } else {
      parts.push(convertNumberToPersianWords(hezar) + ' هزار');
    }
    num %= 1000;
  }

  if (num >= 100) {
    const sad = Math.floor(num / 100);
    parts.push(sadgan[sad]);
    num %= 100;
  }

  if (num >= 20) {
    const dah = Math.floor(num / 10);
    parts.push(dahgan[dah]);
    num %= 10;
  } else if (num >= 10) {
    parts.push(dahYek[num - 10]);
    num = 0;
  }

  if (num > 0) {
    parts.push(yekan[num]);
  }

  return parts.filter(Boolean).join(' و ');
}

// Helper: Convert English and Persian digits in text to written Persian words
function convertDigitsToPersianWords(text: string): string {
  if (!text) return '';
  return text.replace(/[\d۰-۹]+/g, (match) => {
    const standardized = match.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString());
    const num = parseInt(standardized, 10);
    if (!isNaN(num) && num >= 0 && num <= 999999999) {
      return convertNumberToPersianWords(num);
    }
    return '';
  });
}

// Helper: Sanitize any message or caption sent to Telegram anonymous chat
// Rule: Prohibit phone numbers, prohibit raw digits (convert to Persian words), prohibit @ handles, URLs, and external links
function sanitizeAnonymousChatMessage(rawText: string): string {
  if (!rawText) return '';
  let sanitized = rawText;

  // 1. Remove phone numbers and long digit sequences (e.g., 0912..., +98..., 09..., etc.)
  sanitized = sanitized.replace(/(?:\+?98|0098|0)?9\d{9}/g, '');
  sanitized = sanitized.replace(/(?:\+?۹۸|۰۰۹۸|۰)?۹[۰-۹]{9}/g, '');
  sanitized = sanitized.replace(/\b\d{7,}\b/g, '');
  sanitized = sanitized.replace(/[۰-۹]{7,}/g, '');

  // 2. Remove telegram handles (@username, @FastVpnSupport, @nova_vpn10, etc.)
  sanitized = sanitized.replace(/@([a-zA-Z0-9_]+)/g, '');

  // 3. Remove URLs, links (t.me/..., http://...)
  sanitized = sanitized.replace(/(https?:\/\/[^\s]+|t\.me\/[^\s]+|telegram\.me\/[^\s]+)/gi, '');

  // 4. Clean contact boilerplate labels if they have nothing or just "inside photo"
  sanitized = sanitized.replace(/💬\s*(ارتباط|خرید|پشتیبانی|کانال|ثبت سفارش)\s*[:：]?\s*(داخل عکسی که فرستادم هست|داخل عکس|تو عکسه|)/gi, '');

  // 5. Replace common English terms with Persian words before stripping letters
  sanitized = sanitized
    .replace(/nova_vpn10/gi, 'نوا')
    .replace(/vpn/gi, 'فیلترشکن')
    .replace(/v2rayng/gi, 'نرم‌افزار')
    .replace(/v2ray/gi, 'فیلترشکن')
    .replace(/streisand/gi, 'نرم‌افزار')
    .replace(/ios/gi, 'آیفون')
    .replace(/android/gi, 'اندروید')
    .replace(/windows/gi, 'ویندوز')
    .replace(/hi/gi, 'سلام')
    .replace(/bye/gi, 'فعلا')
    .replace(/asl/gi, 'اصل')
    .replace(/id/gi, 'آیدی');

  // 6. Convert all digits (0-9 and ۰-۹) to Persian written words (e.g. 100 -> صد, 500 -> پانصد, 1 -> یک)
  sanitized = convertDigitsToPersianWords(sanitized);

  // 7. Ensure no leftover digits exist at all
  sanitized = sanitized.replace(/[\d۰-۹]/g, '');

  // 8. Clean up whitespace and empty lines
  sanitized = sanitized
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitized;
}

// Helper: Sanitize all outgoing bot messages when conversation is under 2 minutes
function sanitizeMessageForUnderTwoMinutes(rawText: string): string {
  if (!rawText) return '';
  let sanitized = sanitizeAnonymousChatMessage(rawText);

  // Remove any remaining English characters/letters
  sanitized = sanitized.replace(/[a-zA-Z_]+/g, ' ');

  sanitized = sanitized
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!sanitized || sanitized.length < 2) {
    sanitized = 'خوبم مرسی، تو چیکارا میکنی؟ 🌸';
  }

  return sanitized;
}

// Helper: Ensure support ID rule: "nova_vpn10" strictly without '@'
function formatSupportHandle(handle?: string): string {
  if (!handle) return 'nova_vpn10';
  let clean = handle.replace(/@/g, '').trim();
  if (!clean || clean.toLowerCase().includes('fastvpnsupport')) {
    clean = 'nova_vpn10';
  }
  return clean;
}

async function generateAnonymousAiReply(
  dialogueHistory: Array<{ sender: string; text: string }>,
  instructions: AnonymousChatInstructions,
  sessionContext?: AnonymousAiSessionContext
): Promise<{
  text: string;
  source: 'ai_gemini' | 'offline_fallback';
  shouldSendPromoCard?: boolean;
  promoMentioned?: boolean;
  stepOutput?: ConversationStepOutput;
}> {
  const lastStrangerMsg = dialogueHistory.filter((m) => m.sender === 'stranger').pop()?.text || '';
  const ai = getAiClient();
  const promo = instructions.productPromotion;

  const elapsedSec = sessionContext?.elapsedSeconds ?? (sessionContext?.isUnder2Minutes ? 60 : 130);
  const maxTurns = sessionContext?.maxTurns || instructions.maxMessagesPerChat || 4;
  const effectiveSupportHandle = formatSupportHandle(promo?.contactHandleOrLink);

  // 1. Initialize or obtain existing deterministic ConversationContext
  let convContext: ConversationContext = sessionContext?.conversationContext
    ? { ...sessionContext.conversationContext }
    : createInitialConversationContext(
        sessionContext?.partnerTag,
        sessionContext?.partnerProfileSnippet
      );

  convContext.elapsedSeconds = elapsedSec;
  if (sessionContext?.currentTurn !== undefined) {
    convContext.turnCount = sessionContext.currentTurn;
  }

  // 2. Process conversation turn through deterministic Conversation Engine Pipeline
  const mockHistoryForEngine: AnonymousChatMessage[] = dialogueHistory.map((m, idx) => ({
    id: `msg_${idx}`,
    sender: m.sender as any,
    text: m.text,
    timestamp: new Date().toISOString(),
  }));

  const stepOutput = processConversationTurn(
    lastStrangerMsg,
    convContext,
    promo,
    maxTurns,
    mockHistoryForEngine
  );

  const updatedCtx = stepOutput.updatedContext;
  const isUnder2Min = updatedCtx.elapsedSeconds < (promo?.minPhotoDelaySeconds ?? 120);

  if (ai) {
    const candidateModels = [
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];

    let basePrompt =
      instructions.systemPrompt ||
      `شما در نقش یک کاربر عادی ایرانی هستید که در یک ربات چت ناشناس تلگرام در حال صحبت با یک مخاطب ناشناس هستید.
دستورالعمل‌ها:
۱. پاسخ‌های بسیار کوتاه، سریع و عامیانه تلگرامی بدهید (۱ الی ۲ جمله).
۲. لحن کاملاً صمیمی و خودمانی باشد. کلمات کتابی و رسمی ممنوع است.
۳. بدون پیشوند یا علامت نقل‌قول پاسخ دهید.`;

    // Dynamic session placeholders
    basePrompt = basePrompt
      .replace(/{{CURRENT_STATE}}/g, `${updatedCtx.state}`)
      .replace(/{{PROMOTION_LEVEL}}/g, `${updatedCtx.promotionLevel}`)
      .replace(/{{ELAPSED_TIME}}/g, `${elapsedSec} ثانیه`)
      .replace(/{{TURN_COUNT}}/g, `${updatedCtx.turnCount} از ${maxTurns}`)
      .replace(/{{PARTNER_PROFILE}}/g, sessionContext?.partnerProfileSnippet || 'نامشخص')
      .replace(/{{PARTNER_TAG}}/g, sessionContext?.partnerTag || 'ندارد')
      .replace(/{{SUPPORT_HANDLE}}/g, effectiveSupportHandle)
      .replace(/{{PRODUCT_NAME}}/g, promo?.productName || 'فیلترشکن')
      .replace(/{{PRODUCT_DESCRIPTION}}/g, promo?.productDescription || '');

    // Dynamic Session Framing & Complete Memory Isolation with Deterministic Directive Injection
    const sessionFrameParts: string[] = [
      `\n\n══════════════════════════════════════════════`,
      `[چارچوب وضعیت و تصمیمات قطعی ماشین وضعیت (Deterministic State Machine)]:`,
      stepOutput.promptDirective,
      `- وضعیت سیستم (State): ${updatedCtx.state}`,
      `- قصد تشخیص‌داده‌شده کاربر (Intent): ${stepOutput.intentResult.intent} (اطمینان: ${Math.round(stepOutput.intentResult.confidence * 100)}%)`,
      `- امتیاز لید (Lead Score): ${updatedCtx.leadScore}/100`,
      `- سطح مجاز تبلیغات (Promotion Policy): ${updatedCtx.promotionLevel} (قفل تبلیغ: ${updatedCtx.promotionLock ? 'فعال' : 'غیرفعال'})`,
      `- مدت زمان مکالمه: ${elapsedSec} ثانیه`,
      `- تفکیک حافظه: شما با یک هم‌صحبت ناشناس کاملاً جدید چت می‌کنید و هیچ اطلاعی از افراد قبلی ندارید.`,
    ];

    if (sessionContext?.partnerProfileSnippet && instructions.extractPartnerProfileInfo !== false) {
      sessionFrameParts.push(`- مشخصات هم‌صحبت جاری: ${sessionContext.partnerProfileSnippet}`);
    }
    if (sessionContext?.partnerTag) {
      sessionFrameParts.push(`- شناسه مخاطب جاری: ${sessionContext.partnerTag}`);
    }
    sessionFrameParts.push(`══════════════════════════════════════════════\n`);

    let systemInstruction = basePrompt + sessionFrameParts.join('\n');

    systemInstruction += `\n\n══════════════════════════════════════════════
[دستورات ساختار نگارش و مکالمه انسانی]:
- پاسخ‌های شما باید جملاتی روان، کامل، خودمانی و صمیمی عامیانه تهرانی باشند (معمولاً ۱ الی ۲ جمله طبیعی و با معنی).
- اکیداً از ارسال کلمات نصفه، تکه‌تکه، مقطع یا تک‌حرفی (مانند «خ»، «ش»، «راست»، «من») خودداری کنید. پاسخ باید یک جمله کامل و قابل فهم باشد.
- هرگز نگویید ربات هستید. مثل یک انسان واقعی، خوش‌برخورد و پیگیر پاسخ دهید.
══════════════════════════════════════════════`;

    // Strict 2-Minute Policy Section in AI System Instructions
    if (isUnder2Min && !stepOutput.promotionDecision.isExplicitOverride) {
      systemInstruction += `\n\n══════════════════════════════════════════════
[قانون حیاتی سیستم: مکالمه زیر ۲ دقیقه]:
- مدت زمان مکالمه تا این لحظه: ${elapsedSec} ثانیه (کمتر از ۱۲۰ ثانیه / ۲ دقیقه).
- قوانین اکید و غیرقابل تخطی زیر ۲ دقیقه:
  ۱. ارسال عکس یا بنر اکیداً ممنوع است (تگ [SEND_PROMO_CARD] را هرگز ارسال نکنید).
  ۲. ارسال هرگونه عدد، ارقام (0-9 یا ۰-۹) اکیداً ممنوع است. تمام اعداد باید به حروف فارسی نوشته شوند (مثلاً به جای ۲۰ بگویید «بیست»، به جای ۱ بگو «یک»).
  ۳. ارسال هرگونه حروف، کلمات یا متن انگلیسی (مثل VPN, iOS, V2rayNG, asl, nova_vpn10) اکیداً ممنوع است. تمام کلمات فقط و فقط فارسی خالص باشد.
  ۴. ارسال هرگونه آیدی با کاراکتر @ یا آیدی پشتیبانی ممنوع است.
  ۵. پاسخ‌های شما در این مرحله صرفاً متنی کوتاه، صمیمی، دخترانه و با زبان فارسی روان و بدون عدد و بدون حروف انگلیسی باشد.
══════════════════════════════════════════════`;
    } else {
      systemInstruction += `\n\n══════════════════════════════════════════════
[وضعیت مکالمه: بالای ۲ دقیقه یا درخواست صریح کاربر]:
- هم‌اکنون ارسال عکس با تگ [SEND_PROMO_CARD] و معرفی کامل محصول در صورت لزوم مجاز است.
- آیدی پشتیبانی دقیقاً «${effectiveSupportHandle}» است (حتماً و اکیداً بدون کاراکتر @ نوشته شود).
══════════════════════════════════════════════`;
    }

    if (promo?.enabled && (updatedCtx.promotionLevel !== PromotionLevel.NO_PROMOTION || stepOutput.promotionDecision.isExplicitOverride)) {
      systemInstruction += `\n\n══════════════════════════════════════════════
[اطلاعات محصول/تبلیغ برای این چت]:
- نام محصول: ${promo.productName || 'فیلترشکن اختصاصی'}
- متن توضیحات و آفر: ${promo.productDescription || ''}
- آیدی پشتیبانی: ${effectiveSupportHandle} (بدون @)
- سطح مجاز معرفی: ${updatedCtx.promotionLevel}
══════════════════════════════════════════════`;

      if (promo.faqItems && promo.faqItems.length > 0) {
        systemInstruction += `\n\n[پایگاه دانش سوالات متداول (Product FAQ)]:\n` +
          promo.faqItems.map((faq, idx) => `${idx + 1}. سوال: ${faq.question}\n   پاسخ: ${faq.answer}`).join('\n');
      }

      if (promo.knowledgeBaseText && promo.knowledgeBaseText.trim()) {
        systemInstruction += `\n\n[توضیحات تکمیلی محصول (Knowledge Base)]:\n${promo.knowledgeBaseText.trim()}`;
      }
    }

    const cleanHistory = dialogueHistory.filter(
      (m) => m.sender === 'stranger' || m.sender === 'me_melody'
    );
    const windowSize = instructions.memoryWindowSize || 10;
    const recentHistory = cleanHistory.slice(-windowSize);

    let chatPrompt = '';
    if (recentHistory.length > 0) {
      chatPrompt =
        `[تاریخچه مکالمه فعال با این مخاطب ناشناس]:\n` +
        recentHistory
          .map((m) => {
            const speaker = m.sender === 'stranger' ? 'کاربر ناشناس' : 'من';
            return `${speaker}: ${m.text}`;
          })
          .join('\n') + `\n\n[پاسخ جدید من با توجه به حرف‌های همین کاربر و دستورالعمل قطعی بالا به صورت ۱ الی ۲ جمله کامل و خودمانی]:\nمن:`;
    } else {
      chatPrompt = `[مخاطب جدید متصل شد]\nکاربر ناشناس: ${lastStrangerMsg || 'سلام چطوری؟'}\nمن:`;
    }

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: chatPrompt,
          config: {
            systemInstruction,
            temperature: 0.85,
            maxOutputTokens: 300,
          },
        });

        const rawReply = response.text?.trim();
        if (rawReply) {
          // Use our robust Response Validator & Sanitizer
          const validation = validateAndSanitizeResponse(
            rawReply,
            updatedCtx,
            promo
          );

          let cleanText = validation.sanitizedText;
          if (isUnder2Min && !stepOutput.promotionDecision.isExplicitOverride) {
            cleanText = sanitizeMessageForUnderTwoMinutes(cleanText);
          } else {
            cleanText = sanitizeAnonymousChatMessage(cleanText);
            cleanText = cleanText.replace(/@nova_vpn10/gi, 'nova_vpn10');
            cleanText = cleanText.replace(/@FastVpnSupport/gi, 'nova_vpn10');
          }

          const promoTagRegex = /\[(SEND_PROMO_CARD|PROMO_TRIGGER|ارسال_تبلیغ|SEND_PROMO|PROMO_CARD)\]/gi;
          const hasPromoTag = promoTagRegex.test(rawReply);
          cleanText = cleanText.replace(promoTagRegex, '').trim();

          return {
            text: cleanText,
            source: 'ai_gemini',
            shouldSendPromoCard: stepOutput.shouldSendPhotoBanner || hasPromoTag,
            promoMentioned: updatedCtx.promotionLevel !== PromotionLevel.NO_PROMOTION || hasPromoTag,
            stepOutput,
          };
        }
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (
          errMsg.includes('503') ||
          errMsg.includes('429') ||
          errMsg.includes('demand') ||
          errMsg.includes('UNAVAILABLE')
        ) {
          console.warn(`[Gemini AI Failover] Model ${modelName} temporarily busy. Seamlessly switching to next model...`);
          await new Promise((r) => setTimeout(r, 250));
        } else {
          console.warn(`[Gemini AI Failover] Model ${modelName} notice: ${errMsg}. Trying next available model...`);
        }
      }
    }
  }

  // Fallback responses if offline or Gemini fails
  const lowerMsg = lastStrangerMsg.toLowerCase().trim();
  let fallbackText = 'مرسی عزیزم منم خوبم، چیکارا میکنی؟';

  if (/^(سلام|درود|hi|slm|هلو)/i.test(lowerMsg)) {
    fallbackText = 'سلام چطوری؟ خوبی؟ 🌸';
  } else if (/(اصل|asl|اسمت|چند سالته|کجایی)/i.test(lowerMsg)) {
    fallbackText = isUnder2Min ? 'من سارا بیست تهران، شما چی؟ اصل میدی؟' : 'من سارا ۲۰ تهران، شما چی؟ اصل میدی؟';
  } else if (/(چیکار|چخبر|مشغولی)/i.test(lowerMsg)) {
    fallbackText = 'والا پای گوشی نشسته بودم تو تلگرام، تو چیکارا میکنی؟';
  } else if (/(خوبم|مرسی|فدات|شکر)/i.test(lowerMsg)) {
    fallbackText = 'خداروشکر عزیزم، خوشبختم از آشناییت';
  } else if (/(قیمت|چنده|چند|تست|خرید|وی\s*پی\s*ان|فیلترشکن|vpn)/i.test(lowerMsg)) {
    if (updatedCtx.promotionLevel === PromotionLevel.DIRECT_OFFER) {
      fallbackText = `کانفیگ‌های اختصاصی نامحدود با پینگ پایین داریم. آیدی پشتیبانی ${effectiveSupportHandle} پیام بده تا برات تست فعال کنم 🌸`;
    } else {
      fallbackText = 'راستش یه کانفیگ عالی دارم که سرعتش فوق‌العادست، تو فیلترشکن خوب داری؟';
    }
  }

  const validatedFallback = validateAndSanitizeResponse(
    fallbackText,
    updatedCtx,
    promo
  );

  let cleanFallbackText = validatedFallback.sanitizedText;
  if (isUnder2Min && !stepOutput.promotionDecision.isExplicitOverride) {
    cleanFallbackText = sanitizeMessageForUnderTwoMinutes(cleanFallbackText);
  } else {
    cleanFallbackText = sanitizeAnonymousChatMessage(cleanFallbackText);
  }

  return {
    text: cleanFallbackText,
    source: 'offline_fallback',
    shouldSendPromoCard: stepOutput.shouldSendPhotoBanner,
    promoMentioned: updatedCtx.promotionLevel !== PromotionLevel.NO_PROMOTION,
    stepOutput,
  };
}

// Helper: Multi-bubble intelligent sentence chunking for natural typing sensation
function splitIntoNaturalBubbles(text: string, maxChunks: number = 3): string[] {
  if (!text) return [];
  const clean = text.trim();
  if (clean.length < 30) return [clean];

  // 1. If text already contains explicit newlines, split cleanly
  const lines = clean.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines.length <= maxChunks) {
    return lines;
  }

  // 2. Sentence boundary matching (. ! ? ؟ or emoji separation)
  const parts = clean
    .split(/(?<=[.!?؟\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    // If no punctuation but long, look for conjunction breaks like «و»، «ولی»، «راستی»
    const commaParts = clean.split(/(?<=[،,])\s+/).map((s) => s.trim()).filter(Boolean);
    if (commaParts.length > 1 && commaParts.length <= maxChunks) {
      return commaParts;
    }
    return [clean];
  }

  if (parts.length <= maxChunks) {
    return parts;
  }

  // Re-aggregate into maxChunks
  const result: string[] = [];
  const chunkSize = Math.ceil(parts.length / maxChunks);
  for (let i = 0; i < parts.length; i += chunkSize) {
    result.push(parts.slice(i, i + chunkSize).join(' '));
  }
  return result.slice(0, maxChunks);
}

// Helper: Calculate Dynamic Typing Speed based on message length and human variance
function calculateTypingDelay(text: string, instructions: AnonymousChatInstructions): number {
  if (instructions.dynamicTypingSpeed === false) {
    return Math.max(300, (instructions.replyDelaySeconds || 1.2) * 1000);
  }
  const speedPerChar = instructions.typingSpeedMsPerChar || 35;
  const charCount = (text || '').trim().length;
  // Dynamic formula: char count * speed + natural thinking variance (200 - 600ms)
  const rawDuration = charCount * speedPerChar + (Math.random() * 400 + 200);
  const minMs = Math.max(400, (instructions.minTypingDelaySeconds !== undefined ? instructions.minTypingDelaySeconds : 1.0) * 1000);
  const maxMs = Math.min(10000, (instructions.maxTypingDelaySeconds !== undefined ? instructions.maxTypingDelaySeconds : 6.0) * 1000);
  return Math.min(maxMs, Math.max(minMs, Math.round(rawDuration)));
}

// Helper: Detect Spam / Bot Links and Unwanted Promotional Inbounds from Strangers
function isSpamBotMessage(text: string, customKeywords?: string[]): boolean {
  if (!text) return false;
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. URLs, Telegram handles, and external invite links
  if (
    lower.includes('t.me/') ||
    lower.includes('telegram.me/') ||
    lower.includes('joinchat') ||
    lower.includes('chat.whatsapp.com') ||
    lower.includes('instagram.com/') ||
    /https?:\/\//i.test(clean) ||
    /www\.[a-z0-9-]+\.[a-z]+/i.test(clean) ||
    /@([a-zA-Z0-9_]{5,})/i.test(clean)
  ) {
    return true;
  }

  // 2. Common Persian spam & bot patterns
  const defaultSpamPhrases = [
    'عضویت در کانال',
    'کانال تلگرام',
    'پست آخر کانال',
    'شارژ رایگان',
    'فروش اکانت',
    'ربات هوشمند',
    'ربات چت ناشناس',
    'صیغه موقت',
    'صیغه یابی',
    'همسریابی',
    'کارت به کارت',
    'پکیج آموزشی',
    'تخفیف ویژه کانال',
    'افزایش ممبر',
    'خرید ممبر',
    'فالور ارزان',
    'سین زن',
    'بیا کانالم',
    'بیا پیوی',
  ];

  const allKeywords = Array.from(new Set([...(customKeywords || []), ...defaultSpamPhrases]));
  return allKeywords.some((kw) => {
    const k = kw.trim();
    if (!k) return false;
    return clean.includes(k) || isKeywordMatchInText(clean, k);
  });
}

// Helper: Check if stranger sent a positive inquiry / question about the product after promo pitch
function isStrangerInquiryAfterPromo(text: string): boolean {
  if (!text) return false;
  const clean = text.trim();
  const inquiryKeywords = [
    'قیمت', 'چنده', 'چند', 'تعرفه', 'هزینه', 'تست', 'تست میدی', 'خرید', 'اکانت',
    'اشتراک', 'کانفیگ', 'سرویس', 'لینک', 'آیدی', 'کارت', 'شماره کارت', 'واریز',
    'پرداخت', 'چطوری', 'شرایط', 'آیفون', 'اندروید', 'سرعت', 'پشتیبانی', 'میخوام',
    'بفرست', 'میدی', 'چندماهه', 'vpn', 'وی پی ان', 'فیلترشکن'
  ];
  return inquiryKeywords.some((kw) => isKeywordMatchInText(clean, kw));
}

// Helper: Calculate Comprehensive Anonymous Analytics Report
function calculateAnonymousAnalytics(): AnonymousAnalyticsReport {
  const automator = appState.anonymousAutomator || defaultAnonymousAutomatorConfig;
  const history = appState.anonymousSessionHistory || [];
  const allSessions: AnonymousChatSession[] = [...history];
  if (activeAnonChatSession && !allSessions.some((s) => s.id === activeAnonChatSession?.id)) {
    allSessions.unshift({ ...activeAnonChatSession });
  }

  let totalChatsInitiated = automator.stats.totalChatsInitiated || allSessions.length;
  let totalCompletedChats = 0;
  let totalPromoSent = 0;
  let totalInquiriesAfterPromo = 0;
  let totalSpamBotsSkipped = 0;
  let totalDurationSeconds = 0;
  let totalMessages = 0;
  const exitReasonsBreakdown: Record<string, number> = {};
  const topInquiries: Array<{
    sessionId: string;
    partnerTag?: string;
    partnerSnippet?: string;
    inquiryText: string;
    timestamp: string;
  }> = [];

  allSessions.forEach((s) => {
    if (s.status === 'ended') {
      totalCompletedChats++;
    }
    if (s.promoSent) {
      totalPromoSent++;
    }
    if (s.isSpamBot || s.exitReason === 'spam_bot_skipped') {
      totalSpamBotsSkipped++;
    }
    if (s.inquiryDetected && s.inquirySnippet) {
      totalInquiriesAfterPromo++;
      topInquiries.push({
        sessionId: s.id,
        partnerTag: s.partnerTag,
        partnerSnippet: s.partnerProfileSnippet,
        inquiryText: s.inquirySnippet,
        timestamp: s.endedAt || s.startedAt,
      });
    }

    // Duration calculation
    if (s.startedAt && s.endedAt) {
      const dur = Math.max(0, (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 1000);
      totalDurationSeconds += dur;
    }

    totalMessages += s.messagesCount || (s.transcript?.length || 0);

    const reason = s.exitReason || (s.status === 'ended' ? 'max_messages_reached' : 'in_progress');
    exitReasonsBreakdown[reason] = (exitReasonsBreakdown[reason] || 0) + 1;
  });

  // Ensure automator stats align
  if (automator.stats) {
    automator.stats.totalCompletedChats = totalCompletedChats;
    automator.stats.totalPromoSent = totalPromoSent;
    automator.stats.totalInquiriesAfterPromo = totalInquiriesAfterPromo;
    automator.stats.totalSpamBotsSkipped = totalSpamBotsSkipped;
    automator.stats.exitReasonsBreakdown = exitReasonsBreakdown;
  }

  const denominator = Math.max(1, allSessions.length);
  const promoDenominator = Math.max(1, totalPromoSent);
  const conversionRatePercent = Number(((totalInquiriesAfterPromo / promoDenominator) * 100).toFixed(1));
  const promoPitchRatePercent = Number(((totalPromoSent / denominator) * 100).toFixed(1));
  const averageChatDurationSeconds = Math.round(totalDurationSeconds / denominator);
  const averageMessagesPerChat = Number((totalMessages / denominator).toFixed(1));

  return {
    totalChatsInitiated: Math.max(totalChatsInitiated, allSessions.length),
    totalCompletedChats,
    totalPromoSent,
    totalInquiriesAfterPromo,
    totalSpamBotsSkipped,
    conversionRatePercent,
    promoPitchRatePercent,
    averageChatDurationSeconds,
    averageMessagesPerChat,
    exitReasonsBreakdown,
    topInquiries: topInquiries.slice(0, 30),
  };
}

// Helper: Normalize Persian & Arabic characters, strip emojis, punctuation, diacritics
function normalizePersianText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove arabic diacritics (fathah, dammah, etc.)
    .replace(/[\u200C\u200D\uFEFF]/g, ' ') // replace ZWNJ / ZWJ with space
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ|آ/g, 'ا')
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // remove emojis
    .replace(/[^\p{L}\p{N}\s]/gu, '') // remove symbols / punctuation
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper: Calculate similarity score between candidate button text and target label (0.0 to 1.0)
function calculateButtonSimilarity(buttonText: string, targetPattern: string): number {
  if (!buttonText || !targetPattern) return 0;
  const rawBtn = buttonText.trim();
  const rawTarget = targetPattern.trim();

  // 1. Direct exact or case-insensitive match
  if (rawBtn === rawTarget) return 1.0;
  if (rawBtn.toLowerCase() === rawTarget.toLowerCase()) return 0.98;

  // Normalized Persian
  const normBtn = normalizePersianText(rawBtn);
  const normTarget = normalizePersianText(rawTarget);

  // Negative filter: If target is an exit intent, strictly only match exit buttons
  const exitKeywords = ['پایان', 'اتمام', 'قطع', 'خروج', 'بستن'];
  const isTargetExit = exitKeywords.some((kw) => normTarget.includes(kw));
  if (isTargetExit) {
    const nonExitKeywords = ['ایمن', 'اطلاع', 'اعلان', 'خبر', 'نوتیف', 'پروفایل', 'جستجو', 'شروع', 'وصل', 'مشخصات', 'گزارش', 'راهنما', 'سکه', 'دعوت', 'درخواست'];
    if (nonExitKeywords.some((nek) => normBtn.includes(nek))) {
      return 0.0;
    }
    const isBtnExit = exitKeywords.some((kw) => normBtn.includes(kw));
    const isConfirmation = normBtn.includes('بله') || normBtn.includes('تایید') || normBtn.includes('مطمئن');
    if (!isBtnExit && !isConfirmation) {
      return 0.0;
    }
  }

  // 2. Direct substring match
  if (rawBtn.includes(rawTarget) || rawTarget.includes(rawBtn)) {
    const minLen = Math.min(rawBtn.length, rawTarget.length);
    const maxLen = Math.max(rawBtn.length, rawTarget.length);
    return 0.88 + (minLen / maxLen) * 0.1;
  }

  // 3. Match ignoring emojis & special characters entirely
  const cleanBtn = rawBtn.replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '').trim();
  const cleanTarget = rawTarget.replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, '').trim();
  if (cleanBtn && cleanTarget) {
    if (cleanBtn === cleanTarget) return 0.96;
    if (cleanBtn.toLowerCase() === cleanTarget.toLowerCase()) return 0.95;
    if (cleanBtn.includes(cleanTarget) || cleanTarget.includes(cleanBtn)) {
      const minL = Math.min(cleanBtn.length, cleanTarget.length);
      const maxL = Math.max(cleanBtn.length, cleanTarget.length);
      return 0.85 + (minL / maxL) * 0.1;
    }
  }

  // 4. Normalized Persian match (letters, spaces, diacritics)
  if (normBtn && normTarget) {
    if (normBtn === normTarget) return 0.95;
    if (normBtn.includes(normTarget) || normTarget.includes(normBtn)) {
      const minNL = Math.min(normBtn.length, normTarget.length);
      const maxNL = Math.max(normBtn.length, normTarget.length);
      return 0.85 + (minNL / maxNL) * 0.1;
    }

    // 5. Semantic exit synonyms for Persian anonymous bots (پایان چت, اتمام چت, قطع مکالمه, خروج, پایان مکالمه)
    const isBtnExit = exitKeywords.some((kw) => normBtn.includes(kw));
    if (isTargetExit && isBtnExit) {
      if (
        (normTarget.includes('چت') && normBtn.includes('چت')) ||
        (normTarget.includes('مکالمه') && normBtn.includes('مکالمه')) ||
        (normTarget.includes('پایان') && normBtn.includes('پایان')) ||
        (normTarget.includes('اتمام') && normBtn.includes('اتمام')) ||
        (normTarget.includes('قطع') && normBtn.includes('قطع'))
      ) {
        return 0.95;
      }
      return 0.88;
    }

    // If target is exit confirmation and button is confirmation (بله, تایید, مطمئنم)
    if (isTargetExit && (normBtn.includes('بله') || normBtn.includes('تایید') || normBtn.includes('مطمئن'))) {
      return 0.92;
    }

    // Token-based Jaccard overlap
    const btnTokens = normBtn.split(' ').filter((t) => t.length > 1);
    const targetTokens = normTarget.split(' ').filter((t) => t.length > 1);
    if (btnTokens.length > 0 && targetTokens.length > 0) {
      const matchedCount = targetTokens.filter((tt) => btnTokens.some((bt) => bt === tt || bt.includes(tt) || tt.includes(bt))).length;
      if (matchedCount > 0) {
        const overlapScore = matchedCount / Math.max(btnTokens.length, targetTokens.length);
        if (overlapScore >= 0.75) {
          return 0.70 + overlapScore * 0.25;
        } else if (overlapScore >= 0.5) {
          // Penalize partial matches of common words to prevent false positive matching
          // (e.g. matching "جستجوی کاربران" when target is "جستجوی شانسی" because they both contain "جستجوی")
          return 0.40 + overlapScore * 0.20; // 0.50 score, which is below the matching threshold (0.55/0.60)
        }
      }
    }

    // Levenshtein distance on normalized strings
    const dist = getLevenshteinDistance(normBtn, normTarget);
    const maxLen = Math.max(normBtn.length, normTarget.length);
    if (maxLen > 0) {
      const levScore = 1 - dist / maxLen;
      if (levScore > 0.6) return levScore * 0.85;
    }
  }

  return 0;
}

// Levenshtein distance helper
function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Helper: Check if a button matches target pattern (Fuzzy / Partial / Token / Contains / Emoji-insensitive)
function isButtonMatch(buttonText: string, targetPattern: string, mode: 'fuzzy' | 'exact' | 'contains' = 'fuzzy'): boolean {
  if (!buttonText || !targetPattern) return false;
  if (mode === 'exact') {
    return buttonText.trim() === targetPattern.trim();
  }
  const score = calculateButtonSimilarity(buttonText, targetPattern);
  return score >= 0.55;
}

// Helper: Robust check if a message text contains a target trigger keyword (tolerant to emojis, punctuation, diacritics, and Persian spacing)
function isKeywordMatchInText(messageText: string, targetPattern: string): boolean {
  if (!messageText || !targetPattern) return false;
  const rawMsg = messageText.trim();
  const rawTarget = targetPattern.trim();
  if (!rawMsg || !rawTarget) return false;

  const normMsg = normalizePersianText(rawMsg).toLowerCase();
  const normTarget = normalizePersianText(rawTarget).toLowerCase();
  if (!normMsg || !normTarget) return false;

  // 1. Direct contains check
  if (normMsg.includes(normTarget)) return true;

  // 2. Clean punctuation/emojis and check substring again
  const cleanMsg = normMsg.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const cleanTarget = normTarget.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (cleanTarget && cleanMsg.includes(cleanTarget)) return true;

  // 3. Exact single word check for short keywords
  const msgWords = cleanMsg.split(/\s+/).filter(Boolean);
  const targetWords = cleanTarget.split(/\s+/).filter(Boolean);
  if (targetWords.length === 1) {
    const kw = targetWords[0];
    if (msgWords.includes(kw)) return true;
  }

  return false;
}

// Helper: Check if message or reply markup indicates partner is connected / matched
function isMatchNotification(
  text: string,
  replyMarkup?: any,
  customKeywords?: string[]
): boolean {
  const rawText = (text || '').trim();

  // 1. Text phrase matching
  const defaultMatchPhrases = [
    'به مخاطب وصل شدی',
    'وصل شدی',
    'متصل شدی',
    'متصل شدید',
    'وصل شدید',
    'مخاطب پیدا شد',
    'همصحبت پیدا شد',
    'هم‌صحبت پیدا شد',
    'یک همصحبت پیدا شد',
    'یک هم‌صحبت پیدا شد',
    'یک هم صحبت پیدا شد',
    'هم صحبت پیدا شد',
    'شما در حال گفتگو با یک ناشناس هستید',
    'مکالمه آغاز شد',
    'شروع مکالمه',
    'شروع چت',
    'گفتگو آغاز شد',
    'وصلتون کردم',
    'پیدا کردم',
    'به مخاطبت سلام کن',
    'سلام کن',
    'مشخصات هم‌صحبت',
    'مشخصات مخاطب',
    'اطلاعات هم‌صحبت',
    'اطلاعات مخاطب',
    'پروفایل مخاطب',
    'طرف مقابل وارد چت شد',
    'مخاطب متصل شد',
  ];
  const allMatchPhrases = Array.from(
    new Set([...(customKeywords || []), ...defaultMatchPhrases])
  );

  if (rawText) {
    const matchedPhrase = allMatchPhrases.some((kw) => {
      const cleanKw = kw.trim();
      if (!cleanKw) return false;
      return isKeywordMatchInText(rawText, cleanKw);
    });
    if (matchedPhrase) return true;

    // HyperGap profile pattern: "جنسیت: ... سن: ... استان: ..."
    if (
      (rawText.includes('جنسیت:') || rawText.includes('جنسیت :')) &&
      (rawText.includes('سن:') || rawText.includes('استان:') || rawText.includes('شهر:') || rawText.includes('فاصله:'))
    ) {
      return true;
    }
  }

  // 2. Inspect replyMarkup: if reply markup contains an in-chat button
  if (replyMarkup?.rows) {
    for (const row of replyMarkup.rows) {
      for (const btn of row.buttons || []) {
        const bText = btn.text || '';
        if (
          isButtonMatch(bText, 'پایان چت', 'fuzzy') ||
          isButtonMatch(bText, '❌ پایان چت', 'fuzzy') ||
          isButtonMatch(bText, '❌ اتمام چت', 'fuzzy') ||
          isButtonMatch(bText, 'قطع مکالمه', 'fuzzy') ||
          isButtonMatch(bText, 'قطع چت', 'fuzzy') ||
          isButtonMatch(bText, '🛑 خروج از چت', 'fuzzy') ||
          isButtonMatch(bText, 'خروج از چت', 'fuzzy') ||
          isButtonMatch(bText, '👀 پروفایل مخاطب 👤', 'fuzzy') ||
          isButtonMatch(bText, 'پروفایل مخاطب', 'fuzzy')
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

// Helper: Check if bot informs that we are already in chat
function isAlreadyInChatNotice(text: string, customKeywords?: string[]): boolean {
  if (!text) return false;
  const rawText = text.trim();
  const phrases = [
    'هم اکنون شما در حال چت هستید',
    'هم اکنون در حال چت هستید',
    'هم‌اکنون در حال چت هستید',
    'در حال حاضر در حال چت هستید',
    'شما در حال حاضر در یک گفتگو هستید',
    'ابتدا چت فعلی را قطع کنید',
    'ابتدا مکالمه فعلی را ببندید',
    'مکالمه قبلی هنوز باز است',
    'برای قطع چت از دستور',
    'خطا : هم اکنون شما در حال چت هستید',
    'خطا: هم اکنون شما در حال چت هستید',
    'چت فعال دارید',
  ];
  const allPhrases = Array.from(new Set([...(customKeywords || []).filter((k) => k && k.trim()), ...phrases]));
  return allPhrases.some((p) => isKeywordMatchInText(rawText, p.trim()));
}

// Helper: Check if message indicates stranger disconnected / left chat
function isDisconnectNotice(
  text: string,
  customKeywords?: string[]
): boolean {
  if (!text) return false;
  const rawText = text.trim();
  const defaultDisconnectPhrases = [
    'توسط مخاطب شما قطع شد',
    'توسط شما قطع شد',
    'توسط مخاطب قطع شد',
    'توسط مخاطب',
    'توسط شما',
    'مخاطب گفتگو را بست',
    'مخاطب مکالمه را بست',
    'مخاطب چت را ترک کرد',
    'مخاطب چت را بست',
    'مخاطب مکالمه را ترک کرد',
    'هم‌صحبت شما گفتگو را بست',
    'هم‌صحبت شما چت را بست',
    'هم صحبت شما گفتگو را بست',
    'هم صحبت شما چت را بست',
    'هم‌صحبت چت را ترک کرد',
    'هم صحبت چت را ترک کرد',
    'کاربر مقابل از چت خارج شد',
    'کاربر مقابل گفتگو را بست',
    'کاربر مقابل چت را ترک کرد',
    'کاربر مقابل چت را بست',
    'مخاطب از چت خارج شد',
    'مخاطب خارج شد',
    'مکالمه به پایان رسید',
    'گفتگو به پایان رسید',
    'مکالمه پایان یافت',
    'گفتگو پایان یافت',
    'پایان مکالمه',
    'پایان گفتگو',
    'چت بسته شد',
    'چت به پایان رسید',
    'مکالمه بسته شد',
    'مکالمه خاتمه یافت',
    'اتصال قطع شد',
    'چت قطع شد',
    'مکالمه قطع شد',
    'مخاطب رفت',
    'چت را ترک کرد',
    'قطع شد',
  ];
  const allPhrases = Array.from(
    new Set([...(customKeywords || []), ...defaultDisconnectPhrases])
  );
  return allPhrases.some((p) => isKeywordMatchInText(rawText, p.trim()));
}

// Helper: Check if message is a search queue status from bot (waiting, queue, etc.)
function isSearchQueueNotice(text: string): boolean {
  if (!text) return false;
  const queuePhrases = [
    'در حال جستجو',
    'لطفا صبور باشید',
    'در صف انتظار',
    'جستجوی هم‌صحبت',
    'در حال یافتن',
    'شکیبا باشید',
    'منتظر بمانید',
    'جستجو آغاز شد',
    'در حال اتصال',
    'به دنبال هم صحبت',
    'به دنبال هم‌صحبت',
  ];
  return queuePhrases.some((p) => text.includes(p) || isButtonMatch(text, p, 'fuzzy'));
}

// Helper: Accurately distinguish Bot System Messages from real Stranger Chat Messages
function isSystemOrBotMessage(
  text: string,
  replyMarkup?: any,
  selectedBot?: AnonymousBotProfile,
  customIgnoredPhrases?: string[]
): boolean {
  if (!text) return true;
  const clean = text.trim();
  const normalized = normalizePersianText(clean);

  // 1. Exact & Partial Matches for known system warning & announcement messages
  const exactSystemSnippets = [
    'پیدا کردم وصلتون کردم، به مخاطبت سلام کن',
    'پیدا کردم وصلتون کردم',
    'به مخاطبت سلام کن',
    'به هیچ کاربری در ربات اعتماد نکنید',
    'اطلاعات شخصیتان را در اختیارشان قرار ندهید',
    'اطلاعات شخصیتان',
    'پیام سیستم: میدونستی اگر با این کاربر چت کنی',
    'سکه رایگان دریافت میکنی',
    'هر چت موفق = 1 سکه رایگان',
    'هر چت موفق',
    'سکه رایگان',
    'پیام سیستم 👇',
    'پروفایلِ هایپر گپ',
    'پروفایل هایپر گپ',
    'شما را مشاهده کرد',
    'اطلاعاتی است که در بخش پروفایل ربات ثبت کرده اید',
    'اطلاعاتی است که در بخش پروفایل',
    '⚠️ توجه:',
    '🚫 اخطار:',
    '🔔پیام سیستم:',
    '🤖 پیام سیستم',
  ];

  if (exactSystemSnippets.some((snippet) => clean.includes(snippet) || normalized.includes(normalizePersianText(snippet)))) {
    return true;
  }

  // 2. Custom ignored phrases from bot profile and general instructions
  const allCustomIgnores = [
    ...(selectedBot?.customIgnoredKeywords || []),
    ...(customIgnoredPhrases || []),
    ...(appState?.anonymousAutomator?.instructions?.customIgnoredSystemPhrases || []),
  ].flatMap((phrase) => phrase.split(/[-–—\n]/).map((p) => p.trim()).filter(Boolean));

  if (allCustomIgnores.some((phrase) => {
    const pClean = phrase.trim();
    if (!pClean) return false;
    return clean.includes(pClean) || normalized.includes(normalizePersianText(pClean)) || isKeywordMatchInText(clean, pClean);
  })) {
    return true;
  }

  // 3. Connection / Match notifications
  if (isMatchNotification(clean, replyMarkup, selectedBot?.connectionKeywords)) {
    return true;
  }

  // 4. Disconnect / Leave notifications
  if (isDisconnectNotice(clean, selectedBot?.partnerDisconnectedKeywords)) {
    return true;
  }

  // 5. Search queue / Waiting notifications
  if (isSearchQueueNotice(clean)) {
    return true;
  }

  // 6. Main menu / Out of chat notices
  if (isMainMenuNotice(clean) || isAlreadyInChatNotice(clean)) {
    return true;
  }

  // 7. Generic System Headers & Prefixes (Bell, Robot, Warnings, Coins)
  if (
    clean.includes('پیام سیستم') ||
    clean.includes('پیام سامانه') ||
    clean.includes('سیستم:') ||
    clean.includes('سیستم 👇') ||
    clean.includes('سامانه:') ||
    clean.includes('اطلاعیه سیستم') ||
    clean.startsWith('🔔') ||
    clean.startsWith('🤖') ||
    clean.startsWith('🚫') ||
    clean.startsWith('⚠️') ||
    clean.startsWith('⛔') ||
    clean.startsWith('📢') ||
    clean.startsWith('ℹ️') ||
    clean.startsWith('💡')
  ) {
    // If it has emoji indicators and length > 25, or system keywords, it's definitely a system notification
    if (
      clean.includes('سکه') ||
      clean.includes('پروفایل') ||
      clean.includes('اخطار') ||
      clean.includes('هشدار') ||
      clean.includes('توجه') ||
      clean.includes('سیستم') ||
      clean.includes('کاربر') ||
      clean.includes('اعتماد') ||
      clean.includes('ربات') ||
      clean.length > 25
    ) {
      return true;
    }
  }

  // 8. Bot Profile / Partner Statistics / User Bio Details (HyperGap, BegoMago, etc.)
  const profileKeywords = [
    'مشخصات مخاطب',
    'مشخصات هم‌صحبت',
    'اطلاعات مخاطب',
    'اطلاعات هم‌صحبت',
    'پروفایل مخاطب',
    'پروفایل هم‌صحبت',
    'جنسیت:',
    'جنسیت :',
    'سن:',
    'سن :',
    'استان:',
    'استان :',
    'شهر:',
    'شهر :',
    'فاصله:',
    'فاصله :',
    'تعداد چت:',
    'امتیاز:',
    'نام مستعار:',
    'نام کاربر:',
    'کاربر ناشناس',
    'مخاطب شما:',
    'مشخصات شما:',
  ];
  if (profileKeywords.some((kw) => clean.includes(kw) || normalized.includes(normalizePersianText(kw)))) {
    return true;
  }

  // 9. Bot Commands, Tips, Rules & System Guidance
  const systemTipsPhrases = [
    'برای پایان چت',
    'برای قطع چت',
    'برای شروع چت',
    'دستور /end',
    'دستور /start',
    'جهت گزارش تخلف',
    'قوانین چت ناشناس',
    'قوانین گفتگو',
    'قوانین ربات',
    'تبلیغات در ربات',
    'کانال پشتیبانی',
    'عضویت در کانال',
    'لینک اختصاصی شما',
    'دعوت از دوستان',
    'سکه رایگان',
    'افزایش سکه',
    'امتیاز به مخاطب',
    'آیا از این مکالمه رضایت داشتید',
    'ثبت نظر',
    'گزارش پیام',
    'بلاک کردن مخاطب',
  ];
  if (systemTipsPhrases.some((p) => clean.includes(p) || normalized.includes(normalizePersianText(p)))) {
    return true;
  }

  // 10. Check if the message only consists of bot inline commands or short commands
  if (clean.startsWith('/') && clean.length <= 15) {
    return true;
  }

  // 11. If message is accompanied by system buttons, only treat as system if text is an explicit system notice
  if (replyMarkup?.rows) {
    if (isMatchNotification(clean, replyMarkup) || isDisconnectNotice(clean) || isSearchQueueNotice(clean)) {
      return true;
    }
  }

  return false;
}

// Helper: Check if message is a main menu notice (outside of chat)
function isMainMenuNotice(text: string, customKeywords?: string[]): boolean {
  if (!text) return false;
  const rawText = text.trim();
  const menuPhrases = [
    'متوجه نشدم',
    'متوجه نشدم 🤔',
    'دستور نامعتبر',
    'دستور ناشناخته',
    'برای شروع از دکمه',
    'از منوی زیر استفاده',
    'لطفا از دکمه های زیر',
    'لطفاً از دکمه های زیر',
    'پیام شما متوجه نشدم',
    'منوی اصلی',
    'دستور وارد شده صحیح نیست',
    'پیام نامفهوم',
    'برای شروع گفتگو',
    'برای شروع چت',
    'منوی ربات',
  ];
  const allPhrases = Array.from(new Set([...(customKeywords || []).filter((k) => k && k.trim()), ...menuPhrases]));
  return allPhrases.some((p) => isKeywordMatchInText(rawText, p.trim()));
}

// Helper: Detect if stranger is saying goodbye or expressing clear exit intent
function isPartnerGoodbyeOrExitIntent(text: string): boolean {
  if (!text) return false;
  const raw = text.trim();
  const normalized = normalizePersianText(raw);

  const goodbyeExactPhrases = [
    'خداحافظ',
    'خدافظ',
    'خدافس',
    'فعلا خداحافظ',
    'فعلا بای',
    'بای بای',
    'بای',
    'bye',
    'goodbye',
    'شب بخیر',
    'شبخیر',
    'شبت بخیر',
    'شبت شیک',
    'من باید برم',
    'من دارم میرم',
    'من برم دیگه',
    'من رفتم',
    'باید برم',
    'دارم میرم',
    'برم دیگه',
    'فعلا برم',
    'کاری نداری',
    'مراقب خودت باش',
    'قربانت فعلا',
    'فدات فعلا',
    'خوش گذشت فعلا',
    'خوشحال شدم فعلا',
    'قطع کن',
    'ببند چت رو',
    'ببند چتو',
    'چت رو ببند',
    'چتو ببند',
    'لفت بده',
    'لفت میدم',
    'خارج شو',
    'نفر بعدی',
    'نکست بزن',
    'next بزن',
  ];

  if (goodbyeExactPhrases.some((phrase) => isKeywordMatchInText(raw, phrase) || normalized.includes(normalizePersianText(phrase)))) {
    return true;
  }

  // Regex patterns for short expressions
  if (/^(بای|خدافظ|خداحافظ|فعلا|شب\s*بخیر|bye|cya)[\s!.,،🌸🌹]*$/i.test(raw)) {
    return true;
  }

  return false;
}

const DEFAULT_POPUP_OK_KEYWORDS = ['ok', 'تایید', 'بله', 'قبول', 'باشه', 'فهمیدم', 'ادامه', 'متوجه شدم', 'yes', 'confirm', 'باش'];

// Helper: Auto-detect and click OK / Confirm / Alert popups
async function autoDismissBotPopups(
  client: any,
  botEntity: any,
  session: AnonymousChatSession,
  customKeywords?: string[]
): Promise<boolean> {
  const keywords = customKeywords && customKeywords.length > 0 ? customKeywords : DEFAULT_POPUP_OK_KEYWORDS;
  try {
    const recentMsgs = await client.getMessages(botEntity, { limit: 4 });
    for (const msg of recentMsgs) {
      if (msg.replyMarkup?.rows) {
        for (let rowIdx = 0; rowIdx < msg.replyMarkup.rows.length; rowIdx++) {
          const row = msg.replyMarkup.rows[rowIdx];
          for (let colIdx = 0; colIdx < row.buttons.length; colIdx++) {
            const btn = row.buttons[colIdx];
            const btnText = btn.text || '';
            const isOkBtn = keywords.some((kw) => isButtonMatch(btnText, kw, 'fuzzy'));
            if (isOkBtn) {
              let okClicked = false;
              if (btn.data && Api?.messages?.GetBotCallbackAnswer) {
                try {
                  await client.invoke(
                    new Api.messages.GetBotCallbackAnswer({
                      peer: botEntity,
                      msgId: msg.id,
                      data: btn.data,
                    })
                  );
                  okClicked = true;
                } catch {}
              }
              if (!okClicked && typeof msg.click === 'function') {
                try {
                  await msg.click(rowIdx, colIdx);
                  okClicked = true;
                } catch {}
              }
              if (okClicked) {
                session.transcript.push({
                  id: 'msg_' + Date.now(),
                  sender: 'bot_system',
                  text: `✅ تایید خودکار پنجره پاپ‌آپ/دیالوگ ربات (کلیک روی «${btnText}»)`,
                  timestamp: new Date().toISOString(),
                });
                saveData();
                return true;
              }
            }
          }
        }
      }
    }
  } catch (e) {}
  return false;
}

interface InlineButtonCandidate {
  message: any;
  msgId: number;
  rowIdx: number;
  colIdx: number;
  text: string;
  dataHex: string;
  rawButton: any;
  score: number;
}

interface ReplyKeyboardButtonCandidate {
  message?: any;
  msgId?: number;
  rowIdx?: number;
  colIdx?: number;
  text: string;
  rawButton: any;
  score: number;
}

// Helper: Scan all available buttons (both inline across recent messages and reply keyboard in latest state)
async function scanAllBotButtons(
  client: any,
  botEntity: any,
  targetPattern: string,
  limit: number = 80,
  lastClickedDataHex?: string
): Promise<{
  inlineCandidates: InlineButtonCandidate[];
  replyCandidates: ReplyKeyboardButtonCandidate[];
  bestInline: InlineButtonCandidate | null;
  bestReply: ReplyKeyboardButtonCandidate | null;
}> {
  const inlineCandidates: InlineButtonCandidate[] = [];
  const replyCandidates: ReplyKeyboardButtonCandidate[] = [];

  try {
    const recentMsgs = await client.getMessages(botEntity, { limit: Math.max(limit, 80) });

    for (const m of recentMsgs || []) {
      if (!m) continue;

      // 1. Check GramJS message.replyMarkup
      if (m.replyMarkup?.rows) {
        const markupClass = String(m.replyMarkup.className || m.replyMarkup._ || '').toLowerCase();
        const isInlineMarkup =
          markupClass.includes('inline') ||
          m.replyMarkup.rows?.[0]?.buttons?.[0]?.data !== undefined ||
          m.replyMarkup.rows?.[0]?.buttons?.[0]?.url !== undefined ||
          m.replyMarkup.rows?.[0]?.buttons?.[0]?.className === 'KeyboardButtonCallback' ||
          m.replyMarkup.rows?.[0]?.buttons?.[0]?._ === 'keyboardButtonCallback';

        if (isInlineMarkup) {
          // Collect inline buttons from all recent messages that have inline markup
          for (let rowIdx = 0; rowIdx < m.replyMarkup.rows.length; rowIdx++) {
            const row = m.replyMarkup.rows[rowIdx];
            for (let colIdx = 0; colIdx < (row.buttons || []).length; colIdx++) {
              const btn = row.buttons[colIdx];
              const btnText = (btn.text || '').trim();
              if (!btnText) continue;

              const score = calculateButtonSimilarity(btnText, targetPattern);
              const btnDataHex = btn.data ? Buffer.from(btn.data).toString('hex') : '';
              // Avoid repeating immediate last clicked button data if provided
              if (lastClickedDataHex && btnDataHex && btnDataHex === lastClickedDataHex) {
                continue;
              }
              inlineCandidates.push({
                message: m,
                msgId: m.id,
                rowIdx,
                colIdx,
                text: btnText,
                dataHex: btnDataHex,
                rawButton: btn,
                score,
              });
            }
          }
        } else {
          // Telegram Custom Reply Keyboard (menu buttons at bottom of screen)
          for (let rowIdx = 0; rowIdx < m.replyMarkup.rows.length; rowIdx++) {
            const row = m.replyMarkup.rows[rowIdx];
            for (let colIdx = 0; colIdx < (row.buttons || []).length; colIdx++) {
              const btn = row.buttons[colIdx];
              const btnText = (btn.text || '').trim();
              if (!btnText) continue;

              const score = calculateButtonSimilarity(btnText, targetPattern);
              replyCandidates.push({
                message: m,
                msgId: m.id,
                rowIdx,
                colIdx,
                text: btnText,
                rawButton: btn,
                score,
              });
            }
          }
        }
      }

      // 2. Also inspect GramJS m.buttons if available
      if (Array.isArray(m.buttons) && m.buttons.length > 0) {
        for (let r = 0; r < m.buttons.length; r++) {
          const row = m.buttons[r];
          if (!Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const btnObj = row[c];
            const btnText = (btnObj?.text || btnObj?.button?.text || '').trim();
            if (!btnText) continue;

            const score = calculateButtonSimilarity(btnText, targetPattern);
            const btnData = btnObj?.data || btnObj?.button?.data;
            const btnDataHex = btnData ? Buffer.from(btnData).toString('hex') : '';

            // If it has data or is inline button
            if (btnData !== undefined || btnObj?.button?.className === 'KeyboardButtonCallback') {
              const exists = inlineCandidates.some((cnd) => cnd.msgId === m.id && cnd.text === btnText);
              if (!exists) {
                inlineCandidates.push({
                  message: m,
                  msgId: m.id,
                  rowIdx: r,
                  colIdx: c,
                  text: btnText,
                  dataHex: btnDataHex,
                  rawButton: btnObj?.button || btnObj,
                  score,
                });
              }
            } else {
              const exists = replyCandidates.some((cnd) => cnd.text === btnText);
              if (!exists) {
                replyCandidates.push({
                  message: m,
                  msgId: m.id,
                  rowIdx: r,
                  colIdx: c,
                  text: btnText,
                  rawButton: btnObj?.button || btnObj,
                  score,
                });
              }
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('Error scanning bot buttons:', e?.message || e);
  }

  // Sort by score descending
  inlineCandidates.sort((a, b) => b.score - a.score);
  replyCandidates.sort((a, b) => b.score - a.score);

  const bestInline = inlineCandidates.length > 0 ? inlineCandidates[0] : null;
  const bestReply = replyCandidates.length > 0 ? replyCandidates[0] : null;

  return { inlineCandidates, replyCandidates, bestInline, bestReply };
}

// Helper: Click an inline button candidate using Telegram MTProto callback or GramJS click
async function clickInlineCandidate(
  client: any,
  botEntity: any,
  candidate: InlineButtonCandidate,
  session: AnonymousChatSession
): Promise<{ success: boolean; dataClicked?: string }> {
  let inputPeer: any = botEntity;
  try {
    inputPeer = await client.getInputEntity(botEntity);
  } catch {
    inputPeer = botEntity;
  }

  let clickSuccess = false;
  let popupMessage = '';

  // 1. Direct MTProto invoke of GetBotCallbackAnswer (fastest, most reliable)
  if (candidate.rawButton?.data && Api?.messages?.GetBotCallbackAnswer) {
    try {
      const rawData = Buffer.isBuffer(candidate.rawButton.data)
        ? candidate.rawButton.data
        : Buffer.from(candidate.rawButton.data);
      const ans = await client.invoke(
        new Api.messages.GetBotCallbackAnswer({
          peer: inputPeer || botEntity,
          msgId: candidate.msgId,
          data: rawData,
        })
      );
      clickSuccess = true;
      if (ans?.message) popupMessage = ans.message;
    } catch (invErr: any) {
      const errStr = String(invErr?.errorMessage || invErr?.message || invErr);
      // BOT_RESPONSE_TIMEOUT or MESSAGE_NOT_MODIFIED means the callback was successfully sent to Telegram
      if (
        errStr.includes('BOT_RESPONSE_TIMEOUT') ||
        errStr.includes('MESSAGE_NOT_MODIFIED') ||
        errStr.includes('TIMEOUT')
      ) {
        clickSuccess = true;
      } else {
        console.log('GetBotCallbackAnswer notice:', errStr);
      }
    }
  }

  // 2. GramJS Message.click(row, col) helper
  if (!clickSuccess && typeof candidate.message?.click === 'function') {
    try {
      const ans = await candidate.message.click(candidate.rowIdx, candidate.colIdx);
      clickSuccess = true;
      if (ans?.message) popupMessage = ans.message;
    } catch (e1: any) {
      const e1Str = String(e1?.message || e1);
      if (e1Str.includes('BOT_RESPONSE_TIMEOUT') || e1Str.includes('MESSAGE_NOT_MODIFIED')) {
        clickSuccess = true;
      } else {
        try {
          const ans2 = await candidate.message.click({ text: candidate.text });
          clickSuccess = true;
          if (ans2?.message) popupMessage = ans2.message;
        } catch (e2: any) {
          const e2Str = String(e2?.message || e2);
          if (e2Str.includes('BOT_RESPONSE_TIMEOUT') || e2Str.includes('MESSAGE_NOT_MODIFIED')) {
            clickSuccess = true;
          }
        }
      }
    }
  }

  // 3. Direct button.click()
  if (!clickSuccess && typeof candidate.rawButton?.click === 'function') {
    try {
      const ans3 = await candidate.rawButton.click();
      clickSuccess = true;
      if (ans3?.message) popupMessage = ans3.message;
    } catch (e3: any) {
      const e3Str = String(e3?.message || e3);
      if (e3Str.includes('BOT_RESPONSE_TIMEOUT') || e3Str.includes('MESSAGE_NOT_MODIFIED')) {
        clickSuccess = true;
      }
    }
  }

  if (clickSuccess) {
    session.transcript.push({
      id: 'msg_' + Date.now(),
      sender: 'bot_system',
      text: `✅ کلیک موفق روی دکمه شیشه‌ای [${candidate.text}]${popupMessage ? ` (پیام بات: ${popupMessage})` : ''}`,
      timestamp: new Date().toISOString(),
    });
    saveData();
    return { success: true, dataClicked: candidate.dataHex || candidate.text };
  }

  return { success: false };
}

// Helper: Accurately find and click an inline button across recent bot messages using GramJS API
async function clickBotInlineButton(
  client: any,
  botEntity: any,
  targetLabel: string,
  matchMode: 'fuzzy' | 'exact' = 'fuzzy',
  session: AnonymousChatSession,
  maxWaitMs: number = 15000,
  lastClickedData?: string
): Promise<{ success: boolean; dataClicked?: string }> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs && !anonEngineAbort) {
    const { bestInline } = await scanAllBotButtons(client, botEntity, targetLabel, 50, lastClickedData);
    const threshold = matchMode === 'exact' ? 0.95 : 0.45;
    if (bestInline && bestInline.score >= threshold) {
      const res = await clickInlineCandidate(client, botEntity, bestInline, session);
      if (res.success) return res;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return { success: false };
}

// Helper: execute an individual button step (reply keyboard or inline keyboard with trigger conditions)
async function executeBotButtonStep(
  client: any,
  botEntity: any,
  step: AnonymousBotButtonStep,
  session: AnonymousChatSession,
  botProfile?: AnonymousBotProfile,
  lastClickedData?: string
): Promise<string | undefined> {
  // 1. Check trigger condition
  if (step.triggerMode === 'on_any_message') {
    session.statusMessage = `در حال انتظار برای دریافت پیام از ربات قبل از فشردن «${step.label}»...`;
    saveData();
    const startWait = Date.now();
    let initialMsgId = 0;
    try {
      const msgs = await client.getMessages(botEntity, { limit: 1 });
      initialMsgId = msgs[0]?.id || 0;
    } catch {}

    while (Date.now() - startWait < 30000 && !anonEngineAbort) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const checkMsgs = await client.getMessages(botEntity, { limit: 4 });
        if (checkMsgs.some((m: any) => m.id > initialMsgId && !m.out)) {
          break;
        }
      } catch {}
    }
  } else if (step.triggerMode === 'on_keyword_match' && step.triggerKeyword) {
    const targetKw = step.triggerKeyword.trim();
    session.statusMessage = `در حال انتظار و اسکن پیام‌های اخیر ربات برای «${targetKw.slice(0, 30)}» قبل از فشردن «${step.label}»...`;
    saveData();
    const startWait = Date.now();
    const maxWaitMatchMs = 120000; // Allow up to 120 seconds for bot to connect to a stranger

    while (Date.now() - startWait < maxWaitMatchMs && !anonEngineAbort) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const checkMsgs = await client.getMessages(botEntity, { limit: 10 });
        let matchedMsg: any = null;
        for (const m of (checkMsgs || [])) {
          if (!m.message) continue;
          const txt = m.message.trim();
          if (
            isKeywordMatchInText(txt, targetKw) ||
            isMatchNotification(txt, m.replyMarkup, [targetKw])
          ) {
            matchedMsg = m;
            break;
          }
        }

        if (matchedMsg) {
          addLog('info', `[چت ناشناس] پیام کلیدی شرطی («${targetKw.slice(0, 35)}») در پیام‌های اخیر ربات شناسایی شد («${matchedMsg.message.slice(0, 35)}»). بلافاصله اجرای دکمه «${step.label}»...`);
          if (isMatchNotification(matchedMsg.message, matchedMsg.replyMarkup, [targetKw])) {
            session.status = 'chatting';
            session.statusMessage = `هم‌صحبت ناشناس پیدا شد! در حال فشردن «${step.label}» 🌸`;
            saveData();
          }
          break;
        }
      } catch {}

      // Update timer progress in status every 5 seconds
      const elapsedSec = Math.round((Date.now() - startWait) / 1000);
      if (elapsedSec % 5 === 0 && elapsedSec > 0) {
        session.statusMessage = `در حال جستجوی هم‌صحبت و اسکن پیام‌های اخیر برای «${targetKw.slice(0, 25)}» (${elapsedSec}s)...`;
        saveData();
      }
    }
  } else if (step.triggerMode === 'on_popup_dialog') {
    session.statusMessage = `در حال بررسی و انتظار برای پنجره پاپ‌آپ/تایید «${step.label}»...`;
    saveData();
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Delay before executing click
  const delaySec = step.delaySeconds !== undefined ? step.delaySeconds : 1.0;
  await new Promise((r) => setTimeout(r, Math.max(300, delaySec * 1000)));
  if (anonEngineAbort) return;

  const locName =
    step.buttonLocation === 'inline_button'
      ? 'دکمه شیشه‌ای چت'
      : step.buttonLocation === 'reply_keyboard'
      ? 'دکمه کیبورد منو'
      : step.buttonLocation === 'popup_ok'
      ? 'پاپ‌آپ / تایید OK'
      : 'دستور متنی';

  session.statusMessage = `در حال اجرای «${step.label}» (${locName})...`;
  session.transcript.push({
    id: 'msg_' + Date.now(),
    sender: 'bot_system',
    text: `⚡ اجرای مرحله: [${step.label}] (${locName})`,
    timestamp: new Date().toISOString(),
  });
  saveData();

  let clicked = false;
  let clickedDataHex: string | undefined = undefined;
  const matchMode = step.matchMode || (botProfile?.fuzzyButtonMatching !== false ? 'fuzzy' : 'exact');
  const minThreshold = matchMode === 'exact' ? 0.90 : 0.40;

  // Handle popup_ok
  if (step.buttonLocation === 'popup_ok' || step.triggerMode === 'on_popup_dialog') {
    clicked = await autoDismissBotPopups(client, botEntity, session, botProfile?.popupOkKeywords);
    if (clicked) return undefined;
  }

  // Handle explicit text_command
  if (step.buttonLocation === 'text_command') {
    await client.sendMessage(botEntity, { message: step.label });
    clicked = true;
    return undefined;
  }

  // Case 1: Configured specifically as reply_keyboard (منوی کیبورد تلگرام)
  if (step.buttonLocation === 'reply_keyboard') {
    let textToSend = step.label.trim();
    try {
      const { bestReply } = await scanAllBotButtons(client, botEntity, step.label, 40);
      if (bestReply && bestReply.score >= minThreshold && bestReply.text) {
        textToSend = bestReply.text;
      }
    } catch {}

    addLog('info', `[اتوماسیون] فشردن دکمه کیبورد «${textToSend}» به ربات...`);
    await client.sendMessage(botEntity, { message: textToSend });
    clicked = true;
    return undefined;
  }

  // Polling loop to find and execute best matching button (inline or keyboard)
  const maxScanTimeMs = 12000;
  const scanStart = Date.now();

  while (!clicked && Date.now() - scanStart <= maxScanTimeMs && !anonEngineAbort) {
    const { bestInline, bestReply } = await scanAllBotButtons(
      client,
      botEntity,
      step.label,
      60,
      lastClickedData
    );

    // Case 2: Configured specifically as inline_button (دکمه شیشه‌ای داخل پیام)
    if (step.buttonLocation === 'inline_button') {
      if (bestInline && bestInline.score >= minThreshold) {
        addLog('info', `[اتوماسیون] کلیک دکمه شیشه‌ای «${bestInline.text}» (تطابق با «${step.label}» با امتیاز ${(bestInline.score * 100).toFixed(0)}٪)...`);
        const res = await clickInlineCandidate(client, botEntity, bestInline, session);
        if (res.success) {
          clicked = true;
          clickedDataHex = res.dataClicked;
          break;
        }
      }
    }
    // Case 3: any_location (Find closest button across all types)
    else if (step.buttonLocation === 'any_location') {
      const inlineScore = bestInline ? bestInline.score : 0;
      const replyScore = bestReply ? bestReply.score : 0;

      if (inlineScore >= minThreshold && inlineScore >= replyScore && bestInline) {
        const res = await clickInlineCandidate(client, botEntity, bestInline, session);
        if (res.success) {
          clicked = true;
          clickedDataHex = res.dataClicked;
          break;
        }
      } else if (replyScore >= minThreshold && bestReply) {
        await client.sendMessage(botEntity, { message: bestReply.text });
        clicked = true;
        break;
      }
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  // Fallbacks after scan timeout:
  if (!clicked && step.buttonLocation !== 'popup_ok') {
    if (step.buttonLocation === 'inline_button') {
      // SAFEGUARD: Never send raw text to chat for an inline button!
      session.transcript.push({
        id: 'msg_' + Date.now(),
        sender: 'bot_system',
        text: `⚠️ دکمه شیشه‌ای [${step.label}] در پیام‌های دریافتی ربات یافت نشد (جلوگیری از ارسال پیام اشتباه به مخاطب).`,
        timestamp: new Date().toISOString(),
      });
      saveData();
    } else if (step.label.startsWith('/')) {
      // Command fallback
      await client.sendMessage(botEntity, { message: step.label });
      clicked = true;
    } else {
      addLog('info', `[اتوماسیون] ارسال متن دکمه کیبورد «${step.label}» به ربات...`);
      await client.sendMessage(botEntity, { message: step.label.trim() });
      clicked = true;
    }
  }

  // Auto-confirm popup after button click if enabled
  if (step.autoConfirmPopup || botProfile?.autoDismissPopups) {
    await new Promise((r) => setTimeout(r, 600));
    await autoDismissBotPopups(client, botEntity, session, botProfile?.popupOkKeywords);
  }

  return clickedDataHex;
}

// Helper: Anti-Filter Sanitizer for Anonymous Bots (strips @ handles and urls so bots don't ban)
function sanitizePitchTextForBot(rawText: string): string {
  if (!rawText) return '';
  let sanitized = rawText;
  // Replace @username with clean text directing to image banner
  sanitized = sanitized.replace(/@[a-zA-Z0-9_]+/g, 'پشتیبانی (آیدی در تصویر بنر بالا)');
  // Replace t.me/ links
  sanitized = sanitized.replace(/(https?:\/\/)?t\.me\/[a-zA-Z0-9_+/]+/g, 'کانال (در تصویر بالا)');
  // Remove standalone @ symbols
  sanitized = sanitized.replace(/@+/g, '');
  return sanitized.trim();
}

// Helper: Thoroughly disconnect current chat session and verify termination
async function ensureChatDisconnected(
  client: any,
  botEntity: any,
  selectedBot: AnonymousBotProfile,
  session?: AnonymousChatSession
): Promise<void> {
  const currentSession = session || activeAnonChatSession || ({} as any);

  if (currentSession?.exitReason === 'stranger_disconnected') {
    addLog('info', `[چت ناشناس] مخاطب قبلاً چت را قطع کرده است؛ نیازی به اجرای گام‌های خروج یا دستورات کمکی نیست.`);
    // Safe dismissal of any rating/disconnection dialogs or popups
    try {
      await autoDismissBotPopups(client, botEntity, currentSession, selectedBot.popupOkKeywords);
    } catch {}
    return;
  }

  addLog('info', `[چت ناشناس] آغاز فرآیند خروج هوشمند از چت (${(selectedBot.exitSteps || []).length} گام)...`);

  // Step 1: Execute configured exitSteps in order
  let inlineConfirmed = false;
  if (selectedBot.exitSteps && selectedBot.exitSteps.length > 0) {
    let lastClickedHex: string | undefined = undefined;
    let stepIndex = 1;
    for (const exitStep of selectedBot.exitSteps) {
      if (anonEngineAbort) break;
      addLog('info', `[چت ناشناس] اجرای گام خروج ${stepIndex} از ${selectedBot.exitSteps.length}: «${exitStep.label}» (${exitStep.buttonLocation})...`);

      const resHex = await executeBotButtonStep(
        client,
        botEntity,
        exitStep,
        currentSession,
        selectedBot,
        lastClickedHex
      );
      if (resHex) {
        lastClickedHex = resHex;
        inlineConfirmed = true;
      }
      stepIndex++;
      await new Promise((r) => setTimeout(r, Math.max(500, (exitStep.delaySeconds || 1) * 1000)));
    }
  }

  // Step 2: Verification & Fallback Scan for Confirmation Inline Button
  const findAndClickInlineConfirmation = async (): Promise<boolean> => {
    try {
      const { bestInline } = await scanAllBotButtons(client, botEntity, 'اتمام چت', 25);
      if (bestInline && bestInline.score >= 0.40) {
        addLog('info', `[اتوماسیون] کلیک دکمه شیشه‌ای تایید خروج «${bestInline.text}»...`);
        const res = await clickInlineCandidate(client, botEntity, bestInline, currentSession);
        if (res.success) return true;
      }
    } catch {}
    return false;
  };

  if (!inlineConfirmed) {
    inlineConfirmed = await findAndClickInlineConfirmation();
  }

  // Step 3: Multi-command fallback if confirmation inline button was not triggered
  if (!inlineConfirmed) {
    const exitTriggers = ['پایان چت', '/end', '❌ پایان چت', '❌ پایان مکالمه', '/stop'];
    for (const cmd of exitTriggers) {
      if (anonEngineAbort) break;
      addLog('info', `[چت ناشناس] تلاش مجدد ارسال دستور خروج «${cmd}» به ربات...`);
      try {
        await client.sendMessage(botEntity, { message: cmd });
      } catch {}
      await new Promise((r) => setTimeout(r, 1200));

      const clickedNow = await findAndClickInlineConfirmation();
      if (clickedNow) {
        inlineConfirmed = true;
        break;
      }
    }
  }

  // Step 4: Auto-dismiss any pending popup alerts/dialogs
  await autoDismissBotPopups(
    client,
    botEntity,
    currentSession,
    selectedBot.popupOkKeywords
  );

  await new Promise((r) => setTimeout(r, 600));

  // Step 4: Verify disconnection and handle rating prompts / return to main menu
  try {
    const postExitMsgs = await client.getMessages(botEntity, { limit: 6 });
    for (const msg of postExitMsgs || []) {
      // If bot sent rating prompt (e.g. 👍 / 👎 / ⭐), auto click or ignore
      if (msg.replyMarkup?.rows) {
        for (const row of msg.replyMarkup.rows) {
          for (const btn of row.buttons || []) {
            if (btn.text && (btn.text.includes('👍') || btn.text.includes('عالی') || btn.text.includes('خوب'))) {
              try {
                if (btn.data) {
                  await client.invoke(new Api.messages.GetBotCallbackAnswer({
                    peer: botEntity,
                    msgId: msg.id,
                    data: btn.data,
                  }));
                }
              } catch {}
            }
          }
        }
      }
    }
  } catch {}

  addLog('info', `[چت ناشناس] ✅ فرآیند خروج از چت با موفقیت کامل شد. آماده چرخه بعدی.`);
}

// Helper: Send Instant Ice-breaker Greeting to Partner
async function sendIceBreakerGreeting(
  client: any,
  botEntity: any,
  session: AnonymousChatSession,
  instructions: AnonymousChatInstructions
): Promise<void> {
  if (
    instructions.initiateGreetingOnConnect === false ||
    (session.aiMessagesCount || 0) > 0
  ) {
    return;
  }

  try {
    if (Api && Api.messages && Api.messages.SetTyping) {
      client.invoke(
        new Api.messages.SetTyping({ peer: botEntity, action: new Api.SendMessageTypingAction() })
      ).catch(() => {});
    }
  } catch {}

  let greetText = (instructions.initialGreetingText || 'سلام خوبی؟ 🌸').trim();
  if (instructions.greetingMode === 'random_list' && instructions.initialGreetings && instructions.initialGreetings.length > 0) {
    const list = instructions.initialGreetings.map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      greetText = list[Math.floor(Math.random() * list.length)];
    }
  }

  // Enforce under-2-minute rule (no digits, no English letters) on icebreaker greeting
  greetText = sanitizeMessageForUnderTwoMinutes(greetText);

  const delayMs = Math.max(200, (instructions.greetingDelaySeconds !== undefined ? instructions.greetingDelaySeconds : 0.8) * 1000);
  addLog('info', `[چت ناشناس] اتصال برقرار شد. ارسال خودکار پیام سلام/شروع به مخاطب («${greetText}») با تاخیر ${(delayMs / 1000).toFixed(1)} ثانیه...`);
  session.statusMessage = 'اتصال برقرار شد. در حال ارسال پیام شروع به مخاطب...';
  saveData();

  await new Promise((r) => setTimeout(r, delayMs));

  try {
    await client.sendMessage(botEntity, { message: greetText });
    session.aiMessagesCount = (session.aiMessagesCount || 0) + 1;
    session.messagesCount = (session.messagesCount || 0) + 1;
    session.transcript.push({
      id: 'msg_' + Date.now() + '_ai_greet',
      sender: 'me_melody',
      text: greetText,
      timestamp: new Date().toISOString(),
    });
    session.statusMessage = 'پیام شروع ارسال شد. در انتظار پاسخ مخاطب ناشناس...';
    saveData();
  } catch (greetErr: any) {
    console.error('Failed to send initial greeting:', greetErr);
  }
}

// Helper: Send Pre-Exit Farewell Message to Partner Before Promotional Pitch & Disconnect
async function sendPreExitFarewellIfEnabled(
  client: any,
  botEntity: any,
  session: AnonymousChatSession,
  instructions: AnonymousChatInstructions
): Promise<boolean> {
  if (instructions.enablePreExitFarewell === false) {
    return false;
  }

  // If already sent farewell in this session, do not duplicate
  const hasFarewell = (session.transcript || []).some(
    (t) => t.id?.includes('_farewell') || t.id?.includes('_ai_farewell')
  );
  if (hasFarewell) {
    return false;
  }

  let farewellText = (instructions.preExitFarewellText || 'خب عزیزم من کار برام پیش اومد باید برم، مراقب خودت باش 🌸').trim();
  if (instructions.farewellMode === 'random_list' && instructions.preExitFarewells && instructions.preExitFarewells.length > 0) {
    const list = instructions.preExitFarewells.map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) {
      farewellText = list[Math.floor(Math.random() * list.length)];
    }
  }

  if (!farewellText) return false;

  const sessionDurationMs = session.startedAt ? (Date.now() - new Date(session.startedAt).getTime()) : 0;
  if (sessionDurationMs < 120000) {
    farewellText = sanitizeMessageForUnderTwoMinutes(farewellText);
  }

  try {
    if (Api && Api.messages && Api.messages.SetTyping) {
      client.invoke(
        new Api.messages.SetTyping({ peer: botEntity, action: new Api.SendMessageTypingAction() })
      ).catch(() => {});
    }
  } catch {}

  addLog('info', `[چت ناشناس] 🚪 ارسال پیام خداحافظی قبل از خروج به ناشناس («${farewellText}»)...`);
  session.statusMessage = 'در حال ارسال پیام خداحافظی قبل از خروج به هم‌صحبت...';
  saveData();

  try {
    await client.sendMessage(botEntity, { message: farewellText });
    session.aiMessagesCount = (session.aiMessagesCount || 0) + 1;
    session.messagesCount = (session.messagesCount || 0) + 1;
    session.transcript.push({
      id: 'msg_' + Date.now() + '_ai_farewell',
      sender: 'me_melody',
      text: farewellText,
      timestamp: new Date().toISOString(),
    });
    saveData();
  } catch (farewellErr: any) {
    console.error('[چت ناشناس] خطا در ارسال پیام خداحافظی:', farewellErr);
  }

  const delayMs = Math.max(500, (instructions.farewellDelaySeconds !== undefined ? instructions.farewellDelaySeconds : 1.5) * 1000);
  await new Promise((r) => setTimeout(r, delayMs));
  return true;
}

// Helper: Send Campaign Promotional Photo & Pitch on Exit if Not Already Sent
async function sendCampaignPromotionBeforeExitIfPending(
  client: any,
  botEntity: any,
  session: AnonymousChatSession,
  instructions: AnonymousChatInstructions
): Promise<boolean> {
  // If promo was already sent in this session, do not repeat
  if (session.promoSent) {
    console.log('[چت ناشناس] پیام تبلیغاتی قبلاً در طی این مکالمه ارسال شده است؛ نیازی به ارسال مجدد نیست.');
    return false;
  }

  // Also check transcript for any promo message
  const hasPromoInTranscript = (session.transcript || []).some(
    (t) => t.id?.includes('_promo') || (t.text && (t.text.includes('[🖼 تصویر') || t.text.includes('[🖼 بنر') || t.text.includes('[🎯 معرفی')))
  );
  if (hasPromoInTranscript) {
    session.promoSent = true;
    return false;
  }

  const promo = instructions?.productPromotion;
  const fallbackCampaign =
    (appState.campaigns || []).find((c) => c.isActive && (c.imageUrl || c.description)) ||
    (appState.campaigns || []).find((c) => c.imageUrl || c.description) ||
    (appState.campaigns || [])[0];

  const isPromoEnabled = promo?.enabled !== false || fallbackCampaign?.isActive;
  if (!isPromoEnabled && !promo?.productDescription && !fallbackCampaign?.description) {
    return false;
  }

  const sessionDurationMs = session.startedAt ? (Date.now() - new Date(session.startedAt).getTime()) : 0;
  
  // STRICT RULE 1: Photo sending is ONLY allowed if session duration >= 120,000 ms (2 minutes / 120 seconds)
  const isPhotoAllowedByTime = sessionDurationMs >= 120000;

  // STRICT RULE 2: Support Handle MUST be formatted as "nova_vpn10" strictly without '@'
  const rawContact = (promo?.contactHandleOrLink || fallbackCampaign?.contactHandle || '').trim();
  const effectiveContactHandle = formatSupportHandle(rawContact);

  let promoText = (promo?.productDescription || '').trim();
  if (!promoText && promo?.productName) {
    promoText = `🌸 مشخصات و قیمت‌های پلن‌های ${promo.productName} داخل عکس هست عزیزم`;
  }
  if (!promoText) {
    promoText = 'راستی یه پیشنهاد ویژه برات دارم، عکس رو ببین 🌸';
  }

  // UNDER 2 MINUTES RULE: No photos, no numbers, no English letters, no @ handles
  if (sessionDurationMs < 120000) {
    addLog('info', `[چت ناشناس] ⏱️ زمان چت (${Math.round(sessionDurationMs / 1000)} ثانیه) کمتر از ۲ دقیقه است. ارسال عکس، اعداد و آیدی اکیداً ممنوع بوده و متن پاکسازی شد.`);
    promoText = sanitizeMessageForUnderTwoMinutes(promoText);
  } else {
    promoText = sanitizeAnonymousChatMessage(promoText);
  }

  const effectiveImageUrl = (promo?.imageUrl && promo.imageUrl.trim()) || (fallbackCampaign?.imageUrl && fallbackCampaign.imageUrl.trim()) || '';
  let sentWithPhoto = false;

  if (effectiveImageUrl && isPhotoAllowedByTime) {
    addLog('info', `[چت ناشناس] 📸 ارسال پیام تبلیغاتی کمپین (عکس + توضیحات) قبل از خروج به هم‌صحبت ناشناس (مدت زمان چت: ${Math.round(sessionDurationMs / 1000)} ثانیه)...`);
    try {
      const tempImgPath = await getImageFilePathForTelegram(effectiveImageUrl);
      if (tempImgPath && fs.existsSync(tempImgPath)) {
        try {
          await client.sendFile(botEntity, {
            file: tempImgPath,
            caption: promoText,
          });
          sentWithPhoto = true;
        } catch (sendFileErr: any) {
          console.warn('[چت ناشناس] ارسال با sendFile ناموفق بود، تلاش مجدد با sendMessage...', sendFileErr?.message || sendFileErr);
          try {
            await client.sendMessage(botEntity, {
              file: tempImgPath,
              message: promoText,
            });
            sentWithPhoto = true;
          } catch (e2) {
            console.warn('[چت ناشناس] تلاش دوم ارسال عکس با خطا مواجه شد:', e2);
          }
        }
      }
    } catch (photoErr: any) {
      console.warn('[چت ناشناس] خطا در بارگذاری عکس تبلیغاتی قبل از خروج:', photoErr?.message || photoErr);
    }
  } else if (effectiveImageUrl && !isPhotoAllowedByTime) {
    addLog('info', `[چت ناشناس] ⏱️ قانون ۲ دقیقه: مکالمه ${Math.round(sessionDurationMs / 1000)} ثانیه طول کشید (< ۱۲۰ ثانیه). ارسال عکس غیرمجاز بوده و متن ساده ارسال می‌گردد.`);
  }

  if (!sentWithPhoto) {
    try {
      await client.sendMessage(botEntity, { message: promoText });
    } catch (textErr: any) {
      console.error('[چت ناشناس] خطا در ارسال متن تبلیغاتی قبل از خروج:', textErr);
    }
  }

  session.promoSent = true;
  session.aiMessagesCount = (session.aiMessagesCount || 0) + 1;
  session.messagesCount = (session.messagesCount || 0) + 1;

  session.transcript.push({
    id: 'msg_' + Date.now() + '_ai_promo_exit',
    sender: 'me_melody',
    text: sentWithPhoto ? `[🖼 تصویر محصول و توضیحات تبلیغاتی قبل از خروج ارسال شد]\n${promoText}` : `[توضیحات قبل از خروج ارسال شد]\n${promoText}`,
    timestamp: new Date().toISOString(),
  });
  saveData();

  await new Promise((r) => setTimeout(r, 1200));
  return true;
}

// Helper: Execute Exit from Current Chat and Transition to Next Stranger
async function executeExitAndNextPartner(
  client: any,
  botEntity: any,
  selectedBot: AnonymousBotProfile,
  session: AnonymousChatSession,
  reason:
    | 'max_messages_reached'
    | 'stranger_silence'
    | 'stranger_disconnected'
    | 'inappropriate_content'
    | 'manual_operator_skip'
    | 'partner_bye_exit'
    | 'bot_timeout'
    | 'spam_bot_skipped',
  statusExplanation: string
) {
  const instructions = appState.anonymousAutomator?.instructions || defaultAnonymousAutomatorConfig.instructions;

  // For friendly or planned exits (max messages, silence, partner goodbye, etc.), send farewell if enabled
  if (reason === 'max_messages_reached' || reason === 'partner_bye_exit' || reason === 'stranger_silence') {
    try {
      await sendPreExitFarewellIfEnabled(client, botEntity, session, instructions);
    } catch (farewellErr) {
      console.warn('[چت ناشناس] ارسال پیام خداحافظی با خطا روبرو شد:', farewellErr);
    }
  }

  // GUARANTEE: In all exit scenarios (early disconnect, silence, manual skip, max messages, partner bye),
  // always make sure the promotional message and banner are sent before initiating the exit sequence (unless already sent).
  if (reason !== 'inappropriate_content' && reason !== 'spam_bot_skipped') {
    try {
      await sendCampaignPromotionBeforeExitIfPending(client, botEntity, session, instructions);
    } catch (promoErr) {
      console.warn('[چت ناشناس] خطا در ارسال تبلیغ تضمینی قبل از خروج:', promoErr);
    }
  }

  session.exitReason = reason;
  session.status = 'ended';
  session.statusMessage = statusExplanation;
  session.transcript.push({
    id: 'msg_' + Date.now() + '_exit',
    sender: 'bot_system',
    text: `🛑 ${statusExplanation}`,
    timestamp: new Date().toISOString(),
  });
  saveData();

  // Always perform disconnection sequence according to exitSteps to reset menu/state cleanly
  await ensureChatDisconnected(client, botEntity, selectedBot, session);

  await new Promise((r) => setTimeout(r, 1000));
}

// ============================================================================
// ANONYMOUS CHAT BOT TELEGRAM AUTOMATION ENGINE
// ============================================================================
let activeAnonChatSession: AnonymousChatSession | null = null;
let isAnonEngineRunning = false;
let anonEngineAbort = false;
const botEntityCache = new Map<string, any>();

async function resolveBotEntitySmart(client: any, rawUsernameOrLink: string): Promise<any> {
  const cleanUsername = rawUsernameOrLink
    .replace('https://t.me/', '')
    .replace('http://t.me/', '')
    .replace('t.me/', '')
    .replace('@', '')
    .trim()
    .toLowerCase();

  const cacheKey = `${appState.credentials.phoneNumber || 'default'}_${cleanUsername}`;
  if (botEntityCache.has(cacheKey)) {
    const cached = botEntityCache.get(cacheKey);
    if (cached) return cached;
  }

  // 1. First attempt: Search in active dialogs (Zero network lookup, bypasses ResolveUsername flood wait entirely!)
  try {
    const dialogs = await client.getDialogs({ limit: 150 });
    for (const d of dialogs || []) {
      const entity = d.entity;
      if (!entity) continue;
      const entityUsername = (entity.username || '').toLowerCase();
      if (entityUsername && entityUsername === cleanUsername) {
        botEntityCache.set(cacheKey, entity);
        return entity;
      }
    }
  } catch (dialogErr: any) {
    console.warn('[resolveBotEntitySmart] Error scanning dialogs:', dialogErr?.message || dialogErr);
  }

  // 2. Second attempt: Direct getEntity lookup
  try {
    const entity = await client.getEntity(cleanUsername);
    if (entity) {
      botEntityCache.set(cacheKey, entity);
      return entity;
    }
  } catch (err: any) {
    const errMsg = String(err?.errorMessage || err?.message || err);
    if (errMsg.includes('FLOOD_WAIT') || errMsg.includes('wait of') || errMsg.includes('ResolveUsername')) {
      throw new Error(
        `حساب تلگرام شما به دلیل جستجوهای زیاد، از طرف تلگرام موقتاً دچار محدودیت جستجوی نام‌کاربری (FloodWait) شده است.\n\n💡 راه‌حل فوری: لطفاً یک‌بار در اپلیکیشن تلگرام خود ربات @${cleanUsername} را باز کرده و دکمه Start را بزنید تا این ربات به لیست چت‌های حساب شما اضافه شود. پس از آن، سیستم بدون نیاز به جستجو مستقیماً به ربات متصل خواهد شد.`
      );
    }
    throw err;
  }

  return null;
}

async function runAnonymousChatWorker() {
  if (isAnonEngineRunning) return;
  isAnonEngineRunning = true;
  anonEngineAbort = false;

  console.log('🤖 Starting Telegram Anonymous Chat Bot Automation Worker...');
  addLog('info', '[چت ناشناس] اتوماسیون ربات چت ناشناس فعال گردید.');

  while (isAnonEngineRunning && !anonEngineAbort) {
    if (!appState.anonymousAutomator?.isActive) {
      break;
    }

    const automator = appState.anonymousAutomator;
    const selectedBot = automator.bots.find((b) => b.id === automator.selectedBotId) || automator.bots[0];
    if (!selectedBot) {
      addLog('warning', '[چت ناشناس] هیچ ربات چت ناشناسی انتخاب نشده است.');
      break;
    }

    // Get active Telegram client
    const client = await getOrInitTgClient();
    if (!client) {
      addLog('error', '[چت ناشناس] اتصال به تلگرام برقرار نیست. لطفاً ابتدا وارد حساب تلگرام خود شوید.');
      break;
    }

    const sessionNum = (automator.stats.totalChatsInitiated || 0) + 1;
    const sessionId = 'anon_session_' + Date.now();
    activeAnonChatSession = {
      id: sessionId,
      sessionIndex: sessionNum,
      botId: selectedBot.id,
      botUsername: selectedBot.botUsername,
      botName: selectedBot.name,
      accountId: appState.activeAccountId || 'default',
      accountPhone: appState.credentials.phoneNumber || '',
      accountName: appState.credentials.userProfile?.firstName || 'UserBot',
      status: 'navigating_buttons',
      statusMessage: `در حال اتصال به ${selectedBot.name} (جلسه چت #${sessionNum}) و اجرای مراحل ورود...`,
      startedAt: new Date().toISOString(),
      messagesCount: 0,
      strangerMessagesCount: 0,
      aiMessagesCount: 0,
      transcript: [],
    };
    appState.activeAnonymousSession = activeAnonChatSession;
    saveData();

    try {
      // 1. Resolve Bot Entity using smart resolver
      let botEntity: any = null;
      try {
        botEntity = await resolveBotEntitySmart(client, selectedBot.botUsername);
        if (!botEntity) {
          throw new Error(`ربات ${selectedBot.botUsername} در تلگرام یافت نشد.`);
        }
      } catch (e: any) {
        addLog('error', `[چت ناشناس] یافتن ربات ${selectedBot.botUsername} ناموفق بود: ${e.message}`);
        activeAnonChatSession.status = 'failed';
        activeAnonChatSession.statusMessage = e.message || `ربات ${selectedBot.botUsername} یافت نشد.`;
        break;
      }

      // Record baseline message ID at start of session
      let sessionBaselineMsgId = 0;
      try {
        const initRecent = await client.getMessages(botEntity, { limit: 1 });
        sessionBaselineMsgId = initRecent[0]?.id || 0;
      } catch {}
      let lastProcessedMsgId = sessionBaselineMsgId;

      let isConnectedToPartner = false;
      const instructions = automator.instructions || {
        systemPrompt: 'شما در نقش یک کاربر عادی ایرانی هستید و کوتاه و صمیمی چت می‌کنید.',
        maxMessagesPerChat: 4,
        memoryWindowSize: 10,
        enforceSessionIsolation: true,
        extractPartnerProfileInfo: true,
        dynamicSessionStatePrompt: true,
        replyDelaySeconds: 1,
        silenceTimeoutSeconds: 30,
        enableSilenceNudge: true,
        silenceNudgeText: 'هستی؟ 🌸',
        inappropriateKeywords: ['بلاک', 'اسپم', 'فحش'],
      };

      // 2. Always send Start Command first if configured
      if (selectedBot.startCommand) {
        await client.sendMessage(botEntity, { message: selectedBot.startCommand });
        activeAnonChatSession.transcript.push({
          id: 'msg_' + Date.now(),
          sender: 'bot_system',
          text: `ارسال دستور شروع (${selectedBot.startCommand}) به ${selectedBot.name}`,
          timestamp: new Date().toISOString(),
        });
        saveData();
        await new Promise((r) => setTimeout(r, selectedBot.delayBetweenButtonsMs || 1500));
      }

      // 3. Sequentially execute Entry Steps (button clicks / commands in order)
      let lastClickedHex: string | undefined = undefined;
      const entrySteps = selectedBot.entrySteps || [];
      for (const step of entrySteps) {
        if (anonEngineAbort) break;
        const resHex = await executeBotButtonStep(
          client,
          botEntity,
          step,
          activeAnonChatSession,
          selectedBot,
          lastClickedHex
        );
        if (resHex) lastClickedHex = resHex;
        await new Promise((r) => setTimeout(r, Math.max(800, (step.delaySeconds || 1) * 1000)));
      }

      // Check messages received *during* this session (only id > sessionBaselineMsgId)
      let stuckInOldChat = false;
      try {
        const newSessionMsgs = await client.getMessages(botEntity, { limit: 10 });
        for (const m of newSessionMsgs || []) {
          if (!m.out && m.id > sessionBaselineMsgId && m.message) {
            // Check if stuck in old chat error was received in this session
            if (isAlreadyInChatNotice(m.message, selectedBot.alreadyInChatKeywords)) {
              stuckInOldChat = true;
              addLog('warning', `[بازیابی خودکار] خطای چت فعال قبلی («${m.message.slice(0, 45)}») حین ورود دریافت شد. بستن چت قبلی و شروع مجدد...`);
              break;
            }
            // Check if connection established
            if (
              isMatchNotification(m.message, m.replyMarkup, selectedBot.connectionKeywords) ||
              (selectedBot.connectionKeywords || []).some((kw) => kw.trim() && isKeywordMatchInText(m.message, kw.trim()))
            ) {
              isConnectedToPartner = true;
              const meta = extractPartnerMetadata(m.message);
              if (meta.partnerTag) activeAnonChatSession.partnerTag = meta.partnerTag;
              if (meta.partnerSnippet) activeAnonChatSession.partnerProfileSnippet = meta.partnerSnippet;
            }
          }
        }
      } catch {}

      if (stuckInOldChat) {
        await ensureChatDisconnected(client, botEntity, selectedBot, activeAnonChatSession);
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }

      // Update baseline message ID to latest
      let searchStartTime = Date.now();
      let lastPartnerActivityTime = Date.now();
      let lastAiReplyTime = Date.now();
      let silenceNudgeSent = false;
      let exitTriggered = false;

      // 4. Waiting / Chatting State Setup
      if (isConnectedToPartner) {
        activeAnonChatSession.status = 'chatting';
        activeAnonChatSession.statusMessage = 'اتصال به مخاطب ناشناس برقرار شد! آماده گفتگو...';
        automator.stats.totalChatsInitiated = (automator.stats.totalChatsInitiated || 0) + 1;
        automator.stats.lastActiveAt = new Date().toISOString();
        addLog('info', `[شروع جلسه #${activeAnonChatSession.sessionIndex || 1}] هم‌صحبت جدید متصل شد. حافظه مکالمات قبلی کاملاً پاکسازی شد.${activeAnonChatSession.partnerProfileSnippet ? ` مشخصات: ${activeAnonChatSession.partnerProfileSnippet}` : ''}`);
        saveData();

        // Send instant ice-breaker greeting if configured
        if (
          instructions.initiateGreetingOnConnect !== false &&
          (activeAnonChatSession.aiMessagesCount || 0) === 0 &&
          (activeAnonChatSession.strangerMessagesCount || 0) === 0
        ) {
          await sendIceBreakerGreeting(client, botEntity, activeAnonChatSession, instructions);
          lastAiReplyTime = Date.now();
          lastPartnerActivityTime = Date.now();
          silenceNudgeSent = false;
        }
      } else {
        activeAnonChatSession.status = 'waiting_for_stranger';
        activeAnonChatSession.statusMessage = 'در حال جستجو و انتظار برای اتصال هم‌صحبت ناشناس...';
        saveData();
      }

      // 5. Main Session Message Polling Loop with Consecutive Message Aggregator
      while (!anonEngineAbort && appState.anonymousAutomator?.isActive && !exitTriggered) {
        let recentMsgs: any[] = [];
        try {
          recentMsgs = await client.getMessages(botEntity, { limit: 10 });
        } catch (e) {}

        const pendingStrangerBatch: string[] = [];

        for (const msg of (recentMsgs || []).reverse()) {
          if (msg.id <= lastProcessedMsgId || !msg.message) continue;
          lastProcessedMsgId = msg.id;

          const msgText = msg.message.trim();

          // Process incoming messages from bot/stranger
          if (!msg.out) {
            // Case 1: Partner Disconnected Notification
            const isDisconnected = isDisconnectNotice(msgText, selectedBot.partnerDisconnectedKeywords);

            if (isDisconnected) {
              if (isConnectedToPartner) {
                addLog('info', `[چت ناشناس] مخاطب گفتگو را ترک کرد. خروج و رفتن به فرد بعدی...`);
                await executeExitAndNextPartner(
                  client,
                  botEntity,
                  selectedBot,
                  activeAnonChatSession,
                  'stranger_disconnected',
                  'مخاطب ناشناس مکالمه را ترک کرد. آماده اتصال به هم‌صحبت بعدی...'
                );
                exitTriggered = true;
                break;
              } else {
                isConnectedToPartner = false;
                continue;
              }
            }

            // Case 2: Connection Keyword Matched -> Entered stranger chat!
            if (!isConnectedToPartner) {
              const isConnectionMsg = (selectedBot.connectionKeywords || []).some(
                (kw) => kw.trim() && isKeywordMatchInText(msgText, kw.trim())
              ) || isMatchNotification(msgText, msg.replyMarkup, selectedBot.connectionKeywords);

              if (isConnectionMsg) {
                isConnectedToPartner = true;
                lastPartnerActivityTime = Date.now();
                lastAiReplyTime = Date.now();
                silenceNudgeSent = false;

                const meta = extractPartnerMetadata(msgText);
                if (meta.partnerTag) activeAnonChatSession.partnerTag = meta.partnerTag;
                if (meta.partnerSnippet) activeAnonChatSession.partnerProfileSnippet = meta.partnerSnippet;

                activeAnonChatSession.status = 'chatting';
                activeAnonChatSession.statusMessage = 'اتصال به مخاطب ناشناس تایید شد! در حال چت...';
                activeAnonChatSession.transcript.push({
                  id: 'msg_' + Date.now(),
                  sender: 'bot_system',
                  text: `🟢 اتصال به هم‌صحبت جدید برقرار شد (جلسه #${activeAnonChatSession.sessionIndex || 1}${meta.partnerSnippet ? ` | مشخصات: ${meta.partnerSnippet}` : ''}) - حافظه مکالمه قبلی ریست شد.`,
                  timestamp: new Date().toISOString(),
                });
                automator.stats.totalChatsInitiated = (automator.stats.totalChatsInitiated || 0) + 1;
                automator.stats.lastActiveAt = new Date().toISOString();
                addLog('info', `[شروع جلسه #${activeAnonChatSession.sessionIndex || 1}] اتصال برقرار شد. حافظه مکالمات قبلی ریست شد.`);
                saveData();
                continue;
              }
            }

            // Case 3: Already In Chat Error Notice (Only when NOT connected to partner, e.g. blocked by old ghost session)
            if (!isConnectedToPartner && isAlreadyInChatNotice(msgText, selectedBot.alreadyInChatKeywords)) {
              addLog('warning', `[بازیابی خودکار] پیام خطای چت فعال («${msgText.slice(0, 45)}») قبل از اتصال دریافت شد. اجرای خروج برای آزادسازی ربات...`);
              await executeExitAndNextPartner(
                client,
                botEntity,
                selectedBot,
                activeAnonChatSession,
                'stranger_disconnected',
                `خطای چت فعال قبلی («${msgText.slice(0, 45)}»). خروج اضطراری و شروع مجدد...`
              );
              exitTriggered = true;
              break;
            }

            // Case 4: Outside of Chat / Main Menu Notice (Only when NOT connected to partner and NOT currently navigating buttons)
            if (
              !isConnectedToPartner &&
              activeAnonChatSession.status !== 'navigating_buttons' &&
              isMainMenuNotice(msgText, selectedBot.notInChatKeywords)
            ) {
              addLog('warning', `[بازیابی خودکار] پیام خارج از چت («${msgText.slice(0, 45)}») شناسایی شد (هنوز در چت با ناشناس نیستیم). شروع مجدد فرآیند ورود...`);
              isConnectedToPartner = false;
              activeAnonChatSession.status = 'navigating_buttons';
              activeAnonChatSession.statusMessage = 'شناسایی وضعیت خارج از چت. در حال اجرای مجدد کلیک‌های ورود به چت...';
              activeAnonChatSession.transcript.push({
                id: 'msg_' + Date.now() + '_reenter',
                sender: 'bot_system',
                text: `🔄 پیام خارج از چت («${msgText.slice(0, 50)}») دریافت شد. اجرای مجدد مراحل ورود به چت...`,
                timestamp: new Date().toISOString(),
              });
              saveData();

              if (selectedBot.startCommand) {
                try {
                  await client.sendMessage(botEntity, { message: selectedBot.startCommand });
                  await new Promise((r) => setTimeout(r, selectedBot.delayBetweenButtonsMs || 1200));
                } catch {}
              }

              let reLastClickedHex: string | undefined = undefined;
              for (const step of selectedBot.entrySteps || []) {
                if (anonEngineAbort) break;
                const resHex = await executeBotButtonStep(
                  client,
                  botEntity,
                  step,
                  activeAnonChatSession,
                  selectedBot,
                  reLastClickedHex
                );
                if (resHex) reLastClickedHex = resHex;
                await new Promise((r) => setTimeout(r, (step.delaySeconds || 1) * 1000));
              }

              continue;
            }

            // Case 5: System Bot Message (Warnings, Coins, Profile View, System Alerts)
            const isSystemMsg = isSystemOrBotMessage(msgText, msg.replyMarkup, selectedBot);
            if (isSystemMsg) {
              activeAnonChatSession.transcript.push({
                id: 'msg_' + Date.now() + '_bot_sys',
                sender: 'bot_system',
                text: `📋 پیام سیستم ربات: ${msgText}`,
                timestamp: new Date().toISOString(),
              });
              saveData();
              continue;
            }

            // Case 6: Real stranger message -> Add to pending batch for consecutive aggregation
            if (!isConnectedToPartner) {
              addLog('info', `[چت ناشناس] پیام از مخاطب دریافت شد: «${msgText.slice(0, 30)}». ورود به چت تایید شد.`);
              isConnectedToPartner = true;
              activeAnonChatSession.status = 'chatting';
              activeAnonChatSession.statusMessage = 'در حال مکالمه فعال با مخاطب ناشناس...';
              automator.stats.totalChatsInitiated = (automator.stats.totalChatsInitiated || 0) + 1;
              automator.stats.lastActiveAt = new Date().toISOString();
              saveData();
            }

            pendingStrangerBatch.push(msgText);
          }
        }

        if (exitTriggered || (activeAnonChatSession.status as string) === 'ended') {
          break;
        }

        // If connected and no stranger messages yet, and initial greeting not sent, send greeting immediately
        if (
          isConnectedToPartner &&
          instructions.initiateGreetingOnConnect !== false &&
          (activeAnonChatSession.aiMessagesCount || 0) === 0 &&
          (activeAnonChatSession.strangerMessagesCount || 0) === 0 &&
          pendingStrangerBatch.length === 0
        ) {
          await sendIceBreakerGreeting(client, botEntity, activeAnonChatSession, instructions);
          lastAiReplyTime = Date.now();
          lastPartnerActivityTime = Date.now();
          silenceNudgeSent = false;
        }

        // Consecutive Message Aggregator: If stranger sent message(s), wait for additional consecutive lines before generating reply
        if (pendingStrangerBatch.length > 0) {
          const aggregationSec = Math.max(0.5, instructions.messageAggregationDelaySeconds !== undefined ? instructions.messageAggregationDelaySeconds : 1.5);
          const aggregationWindowMs = aggregationSec * 1000;
          const maxWaitMs = 5000; // Fast safety ceiling
          const aggregationStartTime = Date.now();
          let lastMsgArrival = Date.now();

          activeAnonChatSession.statusMessage = `در حال دریافت پیام‌های متوالی مخاطب (${pendingStrangerBatch.length} پیام)...`;
          saveData();

          while (
            Date.now() - lastMsgArrival < aggregationWindowMs &&
            Date.now() - aggregationStartTime < maxWaitMs &&
            !anonEngineAbort &&
            !exitTriggered
          ) {
            await new Promise((r) => setTimeout(r, 350));
            try {
              const checkRecent = await client.getMessages(botEntity, { limit: 5 });
              for (const subMsg of (checkRecent || []).reverse()) {
                if (subMsg.id <= lastProcessedMsgId || !subMsg.message || subMsg.out) continue;
                lastProcessedMsgId = subMsg.id;
                const subText = subMsg.message.trim();

                // Check if partner disconnected during aggregation
                const isSubDisconnected = isDisconnectNotice(subText, selectedBot.partnerDisconnectedKeywords);
                if (isSubDisconnected) {
                  addLog('info', `[چت ناشناس] مخاطب گفتگو را حین تجمیع پیام‌ها ترک کرد.`);
                  await executeExitAndNextPartner(
                    client,
                    botEntity,
                    selectedBot,
                    activeAnonChatSession,
                    'stranger_disconnected',
                    'مخاطب ناشناس مکالمه را ترک کرد.'
                  );
                  exitTriggered = true;
                  break;
                }

                // Check if system message
                const isSubSys = isSystemOrBotMessage(subText, subMsg.replyMarkup, selectedBot);
                if (isSubSys) {
                  activeAnonChatSession.transcript.push({
                    id: 'msg_' + Date.now() + '_bot_sys',
                    sender: 'bot_system',
                    text: `📋 پیام سیستم ربات: ${subText}`,
                    timestamp: new Date().toISOString(),
                  });
                  saveData();
                  continue;
                }

                // New consecutive message from stranger
                pendingStrangerBatch.push(subText);
                lastMsgArrival = Date.now();
                activeAnonChatSession.statusMessage = `پیام متوالی جدید دریافت شد (${pendingStrangerBatch.length} پیام). در حال تجمیع...`;
                saveData();
              }
            } catch {}
          }

          if (exitTriggered || (activeAnonChatSession.status as string) === 'ended') {
            break;
          }

          // Combine all consecutive stranger messages into a unified text block
          const unifiedStrangerText = pendingStrangerBatch.join('\n');
          lastPartnerActivityTime = Date.now();
          silenceNudgeSent = false;
          activeAnonChatSession.strangerMessagesCount++;
          activeAnonChatSession.messagesCount++;
          automator.stats.totalRepliesFromStrangers = (automator.stats.totalRepliesFromStrangers || 0) + 1;

          activeAnonChatSession.transcript.push({
            id: 'msg_' + Date.now() + '_stranger',
            sender: 'stranger',
            text: unifiedStrangerText,
            timestamp: new Date().toISOString(),
          });
          saveData();

          // Feature 4: Spam / Bot Link Fast Skip (فیلتر سریع ربات‌های تبلیغاتی و فرستنده‌های لینک)
          if (
            instructions.autoSkipSpamBots !== false &&
            (activeAnonChatSession.strangerMessagesCount || 0) <= 2
          ) {
            const isSpam = isSpamBotMessage(unifiedStrangerText, instructions.spamBotKeywords);
            if (isSpam) {
              activeAnonChatSession.isSpamBot = true;
              automator.stats.totalSpamBotsSkipped = (automator.stats.totalSpamBotsSkipped || 0) + 1;
              addLog(
                'warning',
                `[ضد اسپم] 🚫 مخاطب به عنوان ربات تبلیغاتی یا فرستنده لینک تشخیص داده شد («${unifiedStrangerText.slice(0, 35)}...»). خروج فوری بدون هدر رفتن سهمیه...`
              );
              await executeExitAndNextPartner(
                client,
                botEntity,
                selectedBot,
                activeAnonChatSession,
                'spam_bot_skipped',
                'تشخیص پیام اسپم/لینک تبلیغاتی. خروج فوری...'
              );
              exitTriggered = true;
              break;
            }
          }

          // Feature 5 (Analytics): Detect Positive Inquiry / Lead Response after Promo Pitch
          if (activeAnonChatSession.promoSent && isStrangerInquiryAfterPromo(unifiedStrangerText)) {
            if (!activeAnonChatSession.inquiryDetected) {
              activeAnonChatSession.inquiryDetected = true;
              activeAnonChatSession.inquirySnippet = unifiedStrangerText.slice(0, 150);
              automator.stats.totalInquiriesAfterPromo = (automator.stats.totalInquiriesAfterPromo || 0) + 1;
              addLog(
                'success',
                `[🎯 لید موفق / علاقه‌مندی مخاطب] مخاطب پس از دریافت معرفی محصول، سوال یا ابراز علاقه ارسال کرد: «${unifiedStrangerText.slice(0, 45)}»`
              );
              saveData();
            }
          }

          // Check for Inappropriate / Blacklisted keywords
          if (instructions.inappropriateKeywords?.length) {
            const lowerInput = unifiedStrangerText.toLowerCase();
            const allBadKws = instructions.inappropriateKeywords.flatMap((k) =>
              k.split(/[-–—\n]/).map((w) => w.trim().toLowerCase()).filter(Boolean)
            );
            const isInappropriate = allBadKws.some((badKw) =>
              lowerInput.includes(badKw) || isKeywordMatchInText(unifiedStrangerText, badKw)
            );
            if (isInappropriate) {
              await executeExitAndNextPartner(
                client,
                botEntity,
                selectedBot,
                activeAnonChatSession,
                'inappropriate_content',
                'دریافت کلمه نامناسب از مخاطب. خروج طبق ترتیب دکمه‌های خروج...'
              );
              exitTriggered = true;
              break;
            }
          }

          // Check if stranger said Goodbye or expressed Exit Intent
          if (instructions.autoExitOnPartnerBye !== false && isPartnerGoodbyeOrExitIntent(unifiedStrangerText)) {
            addLog('info', `[چت ناشناس] 🚪 مخاطب پیام خداحافظی یا قصد خروج ارسال کرد («${unifiedStrangerText.slice(0, 35)}»). اجرای فرایند خروج هوشمند...`);
            await executeExitAndNextPartner(
              client,
              botEntity,
              selectedBot,
              activeAnonChatSession,
              'partner_bye_exit',
              'مخاطب پیام خداحافظی یا قصد خروج ارسال نمود. خروج طبق مراحل تعیین‌شده...'
            );
            exitTriggered = true;
            break;
          }

          const sessionDurationSec = activeAnonChatSession.startedAt ? Math.floor((Date.now() - new Date(activeAnonChatSession.startedAt).getTime()) / 1000) : 0;
          const isUnder2Min = sessionDurationSec < 120;

          // Generate reply using isolated session transcript (only current partner)
          const replyResult = await generateAnonymousAiReply(
            activeAnonChatSession.transcript.map((t) => ({ sender: t.sender, text: t.text })),
            instructions,
            {
              sessionId: activeAnonChatSession.id,
              sessionIndex: activeAnonChatSession.sessionIndex,
              partnerTag: activeAnonChatSession.partnerTag,
              partnerProfileSnippet: activeAnonChatSession.partnerProfileSnippet,
              currentTurn: activeAnonChatSession.aiMessagesCount || 0,
              maxTurns: instructions.maxMessagesPerChat || 4,
              isNewSession: (activeAnonChatSession.aiMessagesCount || 0) === 0,
              elapsedSeconds: sessionDurationSec,
              isUnder2Minutes: isUnder2Min,
              conversationContext: activeAnonChatSession.conversationContext,
            }
          );

          if (replyResult.stepOutput) {
            activeAnonChatSession.conversationContext = replyResult.stepOutput.updatedContext;
            const ctx = replyResult.stepOutput.updatedContext;
            addLog(
              'info',
              `[ماشین وضعیت چت] 🧠 وضعیت: ${ctx.state} | قصد: ${replyResult.stepOutput.intentResult.intent} | لید: ${ctx.leadScore}/100 | تبلیغ: ${ctx.promotionLevel}${ctx.promotionLock ? ' [قفل تبلیغ]' : ''}`
            );
          }

          // Feature 3: Dynamic Typing Speed Simulation (شبیه‌سازی پویا و واقع‌گرایانه زمان تایپ متناسب با طول پاسخ)
          try {
            if (Api && Api.messages && Api.messages.SetTyping) {
              client.invoke(
                new Api.messages.SetTyping({ peer: botEntity, action: new Api.SendMessageTypingAction() })
              ).catch(() => {});
            }
          } catch {}

          const dynamicDelay = calculateTypingDelay(replyResult.text, instructions);
          activeAnonChatSession.statusMessage = `در حال شبیه‌سازی تایپ هوش مصنوعی (${(dynamicDelay / 1000).toFixed(1)} ثانیه)...`;
          saveData();
          await new Promise((r) => setTimeout(r, dynamicDelay));

          const maxMsgs = instructions.maxMessagesPerChat || 3;
          const promo = instructions.productPromotion;
          const currentAiCount = activeAnonChatSession.aiMessagesCount || 0;

          // STRICT PHOTO RULE: Photos are ONLY allowed if session duration >= 120,000 ms (2 minutes)
          const sessionDurationMs = sessionDurationSec * 1000;
          const isPhotoAllowedByTime = sessionDurationMs >= 120000;

          const lastStrangerText = activeAnonChatSession.transcript.filter(t => t.sender === 'stranger').pop()?.text || '';
          const strangerInquiredPromo = /(قیمت|چنده|چند|تست|خرید|اکانت|سرویس|اشتراک|تعرفه|لینک|آیدی|عکس|وی\s*پی\s*ان|فیلترشکن|vpn)/i.test(lastStrangerText);
          const aiReferencedPhoto = /(داخل عکس|تو عکس|عکسم|عکسی که|آیدی داخل عکس|نوا وی\s*پی\s*ان|تست رایگان)/i.test(replyResult.text);

          const fallbackCampaign = (appState.campaigns || []).find(c => c.isActive && c.imageUrl) || (appState.campaigns || []).find(c => c.imageUrl);
          let isPromoStep = false;
          if (promo?.enabled && !activeAnonChatSession.promoSent) {
            if (promo.sendMode === 'send_photo_with_caption_before_exit' && currentAiCount >= maxMsgs - 1) {
              isPromoStep = true;
            } else if (promo.sendMode === 'send_custom_card_at_step' && currentAiCount === (promo.sendAtMessageNumber || 2) - 1) {
              isPromoStep = true;
            } else if (replyResult.shouldSendPromoCard || (strangerInquiredPromo && (replyResult.promoMentioned || aiReferencedPhoto))) {
              isPromoStep = true;
            }
          }

          if (isPromoStep && promo) {
            if (promo.sendMode === 'send_photo_with_caption_before_exit' && currentAiCount >= maxMsgs - 1) {
              // Send pre-exit farewell text before promotional banner
              await sendPreExitFarewellIfEnabled(client, botEntity, activeAnonChatSession, instructions);
            }

            let promoText = (replyResult.text || promo.productDescription || '').trim();
            if (!promoText) {
              promoText = 'پلن‌ها قیمتشون عالیه، عکس رو ببین 🌸';
            }

            if (isUnder2Min) {
              promoText = sanitizeMessageForUnderTwoMinutes(promoText);
            } else {
              promoText = sanitizeAnonymousChatMessage(promoText);
            }

            const effectiveImageUrl = (promo.imageUrl && promo.imageUrl.trim()) || fallbackCampaign?.imageUrl;
            let sentWithPhoto = false;

            if (effectiveImageUrl && isPhotoAllowedByTime) {
              try {
                const tempImgPath = await getImageFilePathForTelegram(effectiveImageUrl);
                if (tempImgPath && fs.existsSync(tempImgPath)) {
                  try {
                    await client.sendFile(botEntity, {
                      file: tempImgPath,
                      caption: promoText,
                    });
                    sentWithPhoto = true;
                  } catch (sendFileErr: any) {
                    console.warn('[چت ناشناس] ارسال با sendFile ناموفق بود، تلاش با sendMessage...', sendFileErr?.message || sendFileErr);
                    try {
                      await client.sendMessage(botEntity, {
                        file: tempImgPath,
                        message: promoText,
                      });
                      sentWithPhoto = true;
                    } catch (e2) {
                      console.warn('[چت ناشناس] تلاش دوم ارسال عکس نیز ناموفق بود:', e2);
                    }
                  }
                }
              } catch (photoErr: any) {
                console.warn('[چت ناشناس] پردازش عکس تبلیغاتی با خطا مواجه شد:', photoErr?.message || photoErr);
              }
            } else if (effectiveImageUrl && !isPhotoAllowedByTime) {
              addLog('info', `[چت ناشناس] ⏱️ مکالمه ${sessionDurationSec} ثانیه طول کشید (< ۱۲۰ ثانیه). ارسال عکس غیرمجاز بوده و به صورت متنی ارسال شد.`);
            }

            if (!sentWithPhoto) {
              await client.sendMessage(botEntity, { message: promoText });
            }

            activeAnonChatSession.promoSent = true;
            automator.stats.totalPromoSent = (automator.stats.totalPromoSent || 0) + 1;
            activeAnonChatSession.aiMessagesCount = (activeAnonChatSession.aiMessagesCount || 0) + 1;
            activeAnonChatSession.messagesCount++;
            lastAiReplyTime = Date.now();

            activeAnonChatSession.transcript.push({
              id: 'msg_' + Date.now() + '_ai_promo',
              sender: 'me_melody',
              text: sentWithPhoto ? `[🖼 تصویر محصول با موفقیت ارسال شد]\n${promoText}` : promoText,
              timestamp: new Date().toISOString(),
            });
            saveData();
          } else if (promo?.enabled && (promo.sendMode === 'ai_natural_mention' || aiReferencedPhoto || strangerInquiredPromo) && (replyResult.shouldSendPromoCard || (replyResult.promoMentioned && (promo.imageUrl || fallbackCampaign?.imageUrl))) && !activeAnonChatSession.promoSent) {
            // AI decided it is the opportune time to pitch and send the product card/banner
            let promoText = (replyResult.text || promo.productDescription || '').trim();
            if (!promoText) {
              promoText = 'پلن‌ها قیمتشون عالیه، عکس رو ببین 🌸';
            }

            if (isUnder2Min) {
              promoText = sanitizeMessageForUnderTwoMinutes(promoText);
            } else {
              promoText = sanitizeAnonymousChatMessage(promoText);
            }

            const effectiveImageUrl = (promo.imageUrl && promo.imageUrl.trim()) || fallbackCampaign?.imageUrl;
            let sentWithPhoto = false;

            if (effectiveImageUrl && isPhotoAllowedByTime) {
              try {
                const tempImgPath = await getImageFilePathForTelegram(effectiveImageUrl);
                if (tempImgPath && fs.existsSync(tempImgPath)) {
                  try {
                    await client.sendFile(botEntity, {
                      file: tempImgPath,
                      caption: promoText,
                    });
                    sentWithPhoto = true;
                  } catch (sendFileErr: any) {
                    try {
                      await client.sendMessage(botEntity, {
                        file: tempImgPath,
                        message: promoText,
                      });
                      sentWithPhoto = true;
                    } catch {}
                  }
                }
              } catch (photoErr) {
                console.warn('[چت ناشناس] ارسال بنر معرفی هوشمند:', photoErr);
              }
            } else if (effectiveImageUrl && !isPhotoAllowedByTime) {
              addLog('info', `[چت ناشناس] ⏱️ قانون ۲ دقیقه: معرفی هوشمند بدون عکس انجام شد.`);
            }

            if (!sentWithPhoto) {
              await client.sendMessage(botEntity, { message: promoText });
            }

            activeAnonChatSession.promoSent = true;
            automator.stats.totalPromoSent = (automator.stats.totalPromoSent || 0) + 1;
            activeAnonChatSession.aiMessagesCount = (activeAnonChatSession.aiMessagesCount || 0) + 1;
            activeAnonChatSession.messagesCount++;
            lastAiReplyTime = Date.now();

            activeAnonChatSession.transcript.push({
              id: 'msg_' + Date.now() + '_ai_smart_promo',
              sender: 'me_melody',
              text: sentWithPhoto ? `[🎯 معرفی هوشمندانه توسط AI با تصویر بنر]\n${promoText}` : `[🎯 معرفی هوشمندانه توسط AI]\n${promoText}`,
              timestamp: new Date().toISOString(),
            });
            addLog('info', `[هوش مصنوعی] 🎯 هوش مصنوعی در خلال مکالمه زمان مناسب را تشخیص داد و محصول (${promo.productName || 'تبلیغ'}) را به همراه آفر/بنر ارسال نمود.`);
            saveData();
          } else {
            // Feature 1: Multi-bubble Messaging (ارسال پیام‌های چندتکه‌ای طبیعی و روان)
            const shouldMultiBubble = instructions.enableMultiBubble !== false;
            const bubbles = shouldMultiBubble
              ? splitIntoNaturalBubbles(replyResult.text, instructions.multiBubbleMaxChunks || 2)
              : [replyResult.text];

            if (bubbles.length > 1) {
              for (let bIdx = 0; bIdx < bubbles.length; bIdx++) {
                const bubbleText = bubbles[bIdx];
                if (bIdx > 0) {
                  // Small natural typing delay before sending subsequent bubble
                  try {
                    if (Api && Api.messages && Api.messages.SetTyping) {
                      client.invoke(
                        new Api.messages.SetTyping({ peer: botEntity, action: new Api.SendMessageTypingAction() })
                      ).catch(() => {});
                    }
                  } catch {}

                  const subBubbleDelay = calculateTypingDelay(bubbleText, instructions);
                  activeAnonChatSession.statusMessage = `در حال ارسال پیام ${bIdx + 1} از ${bubbles.length}...`;
                  saveData();
                  await new Promise((r) => setTimeout(r, Math.min(2200, Math.max(600, subBubbleDelay * 0.5))));
                }

                await client.sendMessage(botEntity, { message: bubbleText });
                activeAnonChatSession.aiMessagesCount = (activeAnonChatSession.aiMessagesCount || 0) + 1;
                activeAnonChatSession.messagesCount++;
                lastAiReplyTime = Date.now();

                activeAnonChatSession.transcript.push({
                  id: 'msg_' + Date.now() + `_ai_b${bIdx + 1}`,
                  sender: 'me_melody',
                  text: bubbleText,
                  timestamp: new Date().toISOString(),
                });
                saveData();

                if (bIdx < bubbles.length - 1) {
                  const waitBetween = (instructions.multiBubbleDelaySeconds || 1.5) * 1000;
                  await new Promise((r) => setTimeout(r, waitBetween));
                }
              }
            } else {
              await client.sendMessage(botEntity, { message: replyResult.text });
              activeAnonChatSession.aiMessagesCount = (activeAnonChatSession.aiMessagesCount || 0) + 1;
              activeAnonChatSession.messagesCount++;
              lastAiReplyTime = Date.now();

              activeAnonChatSession.transcript.push({
                id: 'msg_' + Date.now() + '_ai',
                sender: 'me_melody',
                text: replyResult.text,
                timestamp: new Date().toISOString(),
              });
              saveData();
            }

            if (promo?.enabled && replyResult.promoMentioned && !activeAnonChatSession.promoSent) {
              activeAnonChatSession.promoSent = true;
              automator.stats.totalPromoSent = (automator.stats.totalPromoSent || 0) + 1;
              addLog('info', `[هوش مصنوعی] 💬 هوش مصنوعی مشخصات محصول (${promo.productName || 'تبلیغ'}) را به طور خودمانی در متن پاسخ مطرح نمود.`);
            }
          }

          // Check if max messages reached -> Exit according to exitSteps!
          if (activeAnonChatSession.aiMessagesCount >= maxMsgs) {
            addLog('info', `[چت ناشناس] تعداد پیام‌های ربات به سقف مشخص شده (${maxMsgs}) رسید. آماده‌سازی خروج و بررسی ارسال پیام تبلیغاتی کمپین...`);
            await executeExitAndNextPartner(
              client,
              botEntity,
              selectedBot,
              activeAnonChatSession,
              'max_messages_reached',
              `اتمام ${maxMsgs} پیام مشخص‌شده. خروج طبق ترتیب دکمه‌های خروج و رفتن به نفر بعدی...`
            );
            exitTriggered = true;
            break;
          }
        }

        if (exitTriggered || (activeAnonChatSession.status as string) === 'ended') {
          break;
        }

        // Silence Timeout Detector
        if (isConnectedToPartner && activeAnonChatSession.status === 'chatting') {
          const silenceSec = (Date.now() - Math.max(lastPartnerActivityTime, lastAiReplyTime)) / 1000;
          const targetTimeout = instructions.silenceTimeoutSeconds || 30;

          // Optional Silence Nudge
          if (silenceSec >= targetTimeout / 2 && !silenceNudgeSent && instructions.enableSilenceNudge) {
            silenceNudgeSent = true;
            const nudgeText = instructions.silenceNudgeText || 'هستی؟ 🌸';
            try {
              await client.sendMessage(botEntity, { message: nudgeText });
              activeAnonChatSession.messagesCount++;
              lastAiReplyTime = Date.now();
              activeAnonChatSession.transcript.push({
                id: 'msg_' + Date.now() + '_nudge',
                sender: 'me_melody',
                text: nudgeText,
                timestamp: new Date().toISOString(),
              });
              saveData();
            } catch (nudgeErr) {
              console.warn('Nudge error:', nudgeErr);
            }
          }

          // Full silence timeout reached -> Exit using exitSteps
          if (silenceSec >= targetTimeout) {
            await executeExitAndNextPartner(
              client,
              botEntity,
              selectedBot,
              activeAnonChatSession,
              'stranger_silence',
              `عدم پاسخ مخاطب پس از ${targetTimeout} ثانیه. خروج طبق ترتیب دکمه‌های خروج...`
            );
            exitTriggered = true;
            break;
          }
        }

        // Timeout check for finding stranger
        if (!isConnectedToPartner && Date.now() - searchStartTime > 180000) {
          activeAnonChatSession.statusMessage = 'زمان انتظار جستجو طولانی شد. تلاش مجدد...';
          await ensureChatDisconnected(client, botEntity, selectedBot, activeAnonChatSession);
          break;
        }

        await new Promise((r) => setTimeout(r, 2000));
      }

      // Archive session to history
      if (activeAnonChatSession) {
        activeAnonChatSession.endedAt = new Date().toISOString();
        if (!appState.anonymousSessionHistory) appState.anonymousSessionHistory = [];
        const existingIdx = appState.anonymousSessionHistory.findIndex((s) => s.id === activeAnonChatSession?.id);
        if (existingIdx >= 0) {
          appState.anonymousSessionHistory[existingIdx] = { ...activeAnonChatSession };
        } else {
          appState.anonymousSessionHistory.unshift({ ...activeAnonChatSession });
        }
        if (appState.anonymousSessionHistory.length > 200) {
          appState.anonymousSessionHistory = appState.anonymousSessionHistory.slice(0, 200);
        }
        syncCurrentTestRunFromSessions();
        saveData();
      }

      // Cooldown before next chat cycle
      const isLoopEnabled = automator.loopForever !== false;
      if (isLoopEnabled && appState.anonymousAutomator?.isActive && !anonEngineAbort) {
        const cooldown = (automator.cooldownBetweenChatsSeconds || 4) * 1000;
        console.log(`⏳ Cooldown ${cooldown / 1000}s before next anonymous chat cycle...`);
        if (activeAnonChatSession) {
          activeAnonChatSession.statusMessage = `استراحت به مدت ${cooldown / 1000} ثانیه قبل از ورود به چت ناشناس بعدی...`;
          saveData();
        }
        await new Promise((r) => setTimeout(r, cooldown));
      } else {
        break;
      }
    } catch (chatErr: any) {
      console.error('Anonymous chat worker error:', chatErr);
      addLog('warning', `[چت ناشناس] خطایی در اجرای نشست چت ناشناس رخ داد: ${chatErr?.message || chatErr}`);
      if (activeAnonChatSession) {
        activeAnonChatSession.status = 'failed';
        activeAnonChatSession.statusMessage = 'خطا: ' + (chatErr?.message || chatErr);
        activeAnonChatSession.endedAt = new Date().toISOString();
        if (!appState.anonymousSessionHistory) appState.anonymousSessionHistory = [];
        if (!appState.anonymousSessionHistory.some((s) => s.id === activeAnonChatSession?.id)) {
          appState.anonymousSessionHistory.unshift({ ...activeAnonChatSession });
        }
        syncCurrentTestRunFromSessions();
        saveData();
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  isAnonEngineRunning = false;
  if (appState.anonymousAutomator) {
    appState.anonymousAutomator.isActive = false;
  }
  if (activeAnonChatSession) {
    if (activeAnonChatSession.status === 'chatting' || activeAnonChatSession.status === 'navigating_buttons') {
      activeAnonChatSession.status = 'ended';
      activeAnonChatSession.statusMessage = 'اتوماسیون متوقف گردید.';
      activeAnonChatSession.endedAt = new Date().toISOString();
    }
    if (activeAnonChatSession.transcript && activeAnonChatSession.transcript.length > 0) {
      if (!appState.anonymousSessionHistory) appState.anonymousSessionHistory = [];
      const existingIdx = appState.anonymousSessionHistory.findIndex((s) => s.id === activeAnonChatSession?.id);
      if (existingIdx >= 0) {
        appState.anonymousSessionHistory[existingIdx] = { ...activeAnonChatSession };
      } else {
        appState.anonymousSessionHistory.unshift({ ...activeAnonChatSession });
      }
    }
  }
  syncCurrentTestRunFromSessions();
  saveData();
  console.log('🛑 Telegram Anonymous Chat Bot Automation Worker stopped.');
}

// Helper: Build Clean Dialogue Turns strictly filtering out bot system messages, buttons, and popups
function buildCleanDialogueTurns(transcript: AnonymousChatMessage[]): AnonymousDialogueTurn[] {
  if (!Array.isArray(transcript)) return [];
  const turns: AnonymousDialogueTurn[] = [];
  for (const msg of transcript) {
    if (!msg || !msg.text) continue;
    // Strictly filter out bot system messages, button logs, popups and start commands
    if (msg.sender === 'bot_system') continue;

    let role: 'user' | 'assistant' = 'user';
    let sender: 'partner' | 'ai_bot' | 'operator_manual' = 'partner';

    if (msg.sender === 'stranger') {
      role = 'user';
      sender = 'partner';
    } else if (msg.sender === 'me_melody') {
      role = 'assistant';
      sender = 'ai_bot';
    } else if (msg.sender === 'operator_manual') {
      role = 'assistant';
      sender = 'operator_manual';
    }

    // Clean any bracketed system notifications or prompt injection markers
    let cleanText = msg.text.trim();
    if (cleanText.startsWith('[🎯 معرفی هوشمندانه')) {
      cleanText = cleanText.replace(/\[🎯[^\]]+\]\s*/g, '').trim();
    } else if (cleanText.startsWith('[🖼 تصویر محصول')) {
      cleanText = cleanText.replace(/\[🖼[^\]]+\]\s*/g, '').trim();
    }

    if (cleanText) {
      turns.push({
        sender,
        role,
        text: cleanText,
        timestamp: msg.timestamp || new Date().toISOString(),
      });
    }
  }
  return turns;
}

// Helper: Build Partner Conversation Object with isolated metrics
function buildPartnerConversationObject(
  session: AnonymousChatSession,
  partnerNumber: number
): AnonymousPartnerConversation {
  const dialogue = buildCleanDialogueTurns(session.transcript || []);
  let partnerCount = 0;
  let aiCount = 0;
  dialogue.forEach((t) => {
    if (t.sender === 'partner') partnerCount++;
    if (t.sender === 'ai_bot' || t.sender === 'operator_manual') aiCount++;
  });

  return {
    partnerNumber,
    sessionId: session.id,
    partnerTag: session.partnerTag || undefined,
    partnerProfile: session.partnerProfileSnippet || undefined,
    startedAt: session.startedAt,
    endedAt: session.endedAt || undefined,
    exitReason: session.exitReason || (session.status === 'ended' ? 'max_messages_reached' : undefined),
    messagesCount: {
      partner: partnerCount,
      aiBot: aiCount,
    },
    dialogue,
  };
}

// Helper: Sync current test run conversations and stats in real-time
function syncCurrentTestRunFromSessions() {
  if (!appState.currentTestRun) return;
  const history = appState.anonymousSessionHistory || [];
  const allSessions: AnonymousChatSession[] = [...history];
  if (activeAnonChatSession && !allSessions.some((s) => s.id === activeAnonChatSession?.id)) {
    allSessions.unshift({ ...activeAnonChatSession });
  }

  // Filter only sessions of the active test run
  const runStartTs = new Date(appState.currentTestRun.startedAt).getTime();
  const runSessions = allSessions.filter((s) => {
    const sStart = new Date(s.startedAt).getTime();
    return sStart >= runStartTs - 30000;
  });

  const partnerConvs: AnonymousPartnerConversation[] = [];
  // Sort chronologically (oldest to newest)
  const sortedSessions = [...runSessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  sortedSessions.forEach((s, idx) => {
    const conv = buildPartnerConversationObject(s, idx + 1);
    if (conv.dialogue.length > 0 || (s.messagesCount && s.messagesCount > 0) || s.partnerProfileSnippet || s.partnerTag) {
      partnerConvs.push(conv);
    }
  });

  let totalPartnerMsgs = 0;
  let totalAiMsgs = 0;
  partnerConvs.forEach((c) => {
    totalPartnerMsgs += c.messagesCount.partner;
    totalAiMsgs += c.messagesCount.aiBot;
  });

  appState.currentTestRun.conversationsByPartner = partnerConvs;
  appState.currentTestRun.analyticsSummary = {
    totalPartnersChatted: partnerConvs.length,
    totalPartnerMessagesReceived: totalPartnerMsgs,
    totalAiRepliesSent: totalAiMsgs,
    averageTurnsPerPartner:
      partnerConvs.length > 0
        ? Number(((totalPartnerMsgs + totalAiMsgs) / partnerConvs.length).toFixed(2))
        : 0,
  };
}

// Helper: Initialize a Fresh Prompt Evaluation Run
function initNewPromptEvaluationTestRun(botId?: string): AnonymousPromptTestRun {
  const automator = appState.anonymousAutomator || defaultAnonymousAutomatorConfig;
  const effectiveBotId = botId || automator.selectedBotId;
  const selectedBot = automator.bots.find((b) => b.id === effectiveBotId) || automator.bots[0];
  const instructions = automator.instructions;

  // Archive previous run if it had recorded conversations
  if (
    appState.currentTestRun &&
    (appState.currentTestRun.conversationsByPartner?.length > 0 ||
      appState.currentTestRun.analyticsSummary.totalPartnersChatted > 0)
  ) {
    if (!appState.previousTestRuns) appState.previousTestRuns = [];
    appState.currentTestRun.status = 'stopped';
    if (!appState.currentTestRun.endedAt) appState.currentTestRun.endedAt = new Date().toISOString();
    appState.previousTestRuns.unshift({ ...appState.currentTestRun });
    if (appState.previousTestRuns.length > 20) {
      appState.previousTestRuns = appState.previousTestRuns.slice(0, 20);
    }
  }

  // Clear session history for a clean fresh test run
  appState.anonymousSessionHistory = [];

  const runIndex = (appState.previousTestRuns?.length || 0) + 1;
  const newRun: AnonymousPromptTestRun = {
    id: `run_${Date.now()}_idx${runIndex}`,
    runIndex,
    startedAt: new Date().toISOString(),
    status: 'running',
    botProfile: {
      id: selectedBot?.id || 'hyper_gap_bot',
      name: selectedBot?.name || 'ربات ناشناس',
      botUsername: selectedBot?.botUsername || '',
    },
    aiInstructionsAndContext: {
      systemPrompt: instructions.systemPrompt || '',
      maxMessagesPerChat: instructions.maxMessagesPerChat || 4,
      memoryWindowSize: instructions.memoryWindowSize || 10,
      initialGreeting: {
        enabled: instructions.initiateGreetingOnConnect !== false,
        text: instructions.initialGreetingText || 'سلام خوبی؟ 🌸',
        mode: instructions.greetingMode || 'single',
      },
      preExitFarewell: {
        enabled: instructions.enablePreExitFarewell !== false,
        text: instructions.preExitFarewellText || '',
      },
      productPromotion: {
        enabled: Boolean(instructions.productPromotion?.enabled),
        productName: instructions.productPromotion?.productName || '',
        productDescription: instructions.productPromotion?.productDescription || '',
        contactHandleOrLink: instructions.productPromotion?.contactHandleOrLink || '',
        sendMode: instructions.productPromotion?.sendMode || 'send_photo_with_caption_before_exit',
      },
      inappropriateKeywords: instructions.inappropriateKeywords || [],
    },
    analyticsSummary: {
      totalPartnersChatted: 0,
      totalPartnerMessagesReceived: 0,
      totalAiRepliesSent: 0,
      averageTurnsPerPartner: 0,
    },
    conversationsByPartner: [],
  };

  appState.currentTestRun = newRun;
  saveData();
  return newRun;
}

// Helper: Format Clean Prompt Performance JSON
function generateCleanPromptEvaluationJson(run: AnonymousPromptTestRun | null): object {
  const automator = appState.anonymousAutomator;
  const currentOrEmpty = run || {
    id: `run_${Date.now()}`,
    runIndex: 1,
    startedAt: automator?.currentRunStartedAt || new Date().toISOString(),
    status: 'stopped' as const,
    botProfile: {
      id: automator?.bots[0]?.id || 'anon_bot',
      name: automator?.bots[0]?.name || 'ربات ناشناس',
      botUsername: automator?.bots[0]?.botUsername || '',
    },
    aiInstructionsAndContext: {
      systemPrompt: automator?.instructions.systemPrompt || '',
      maxMessagesPerChat: automator?.instructions.maxMessagesPerChat || 4,
      memoryWindowSize: automator?.instructions.memoryWindowSize || 10,
      initialGreeting: {
        enabled: automator?.instructions.initiateGreetingOnConnect !== false,
        text: automator?.instructions.initialGreetingText || 'سلام خوبی؟ 🌸',
        mode: automator?.instructions.greetingMode || 'single',
      },
      preExitFarewell: {
        enabled: automator?.instructions.enablePreExitFarewell !== false,
        text: automator?.instructions.preExitFarewellText || '',
      },
      productPromotion: {
        enabled: Boolean(automator?.instructions.productPromotion?.enabled),
        productName: automator?.instructions.productPromotion?.productName || '',
        productDescription: automator?.instructions.productPromotion?.productDescription || '',
        contactHandleOrLink: automator?.instructions.productPromotion?.contactHandleOrLink || '',
        sendMode: automator?.instructions.productPromotion?.sendMode || 'send_photo_with_caption_before_exit',
      },
      inappropriateKeywords: automator?.instructions.inappropriateKeywords || [],
    },
    analyticsSummary: {
      totalPartnersChatted: 0,
      totalPartnerMessagesReceived: 0,
      totalAiRepliesSent: 0,
      averageTurnsPerPartner: 0,
    },
    conversationsByPartner: [],
  };

  return {
    analysisTitle: 'تحلیل عملکرد دستورالعمل هوش مصنوعی در چت ناشناس تلگرام (Prompt Performance Evaluation)',
    description: 'این فایل فقط شامل رفت‌وبرگشت‌های مکالمه هوش مصنوعی با مخاطبان و دستورالعمل‌های داده‌شده به مدل است و پیام‌های سیستمی ربات حذف شده‌اند.',
    exportedAt: new Date().toISOString(),
    testRunId: currentOrEmpty.id,
    runIndex: currentOrEmpty.runIndex,
    startedAt: currentOrEmpty.startedAt,
    endedAt: currentOrEmpty.endedAt || (currentOrEmpty.status === 'stopped' ? new Date().toISOString() : undefined),
    status: currentOrEmpty.status,
    botProfile: currentOrEmpty.botProfile,
    aiInstructionsAndContext: currentOrEmpty.aiInstructionsAndContext,
    analyticsSummary: currentOrEmpty.analyticsSummary,
    conversationsByPartner: currentOrEmpty.conversationsByPartner,
  };
}

// Helper: Format Analytical Conversation Log for Export (TXT / MD)
function generateAnonymousChatTextReport(
  sessions: AnonymousChatSession[],
  automator: AnonymousChatAutomatorConfig | undefined,
  options: { runOnly?: boolean; currentRunStartedAt?: string } = {}
): string {
  let filteredSessions = sessions;
  if (options.runOnly && options.currentRunStartedAt) {
    const runStartTs = new Date(options.currentRunStartedAt).getTime();
    filteredSessions = sessions.filter((s) => {
      const startTs = new Date(s.startedAt).getTime();
      return startTs >= runStartTs - 30000;
    });
  }

  if (filteredSessions.length === 0 && sessions.length > 0) {
    filteredSessions = sessions;
  }

  const bot = automator?.bots.find((b) => b.id === automator.selectedBotId) || automator?.bots[0];
  const instructions = automator?.instructions;
  const nowStr = new Date().toLocaleString('fa-IR');
  const nowIso = new Date().toISOString();

  let totalStrangerMsgs = 0;
  let totalAiMsgs = 0;
  filteredSessions.forEach((s) => {
    totalStrangerMsgs += s.strangerMessagesCount || 0;
    totalAiMsgs += s.aiMessagesCount || 0;
  });

  const lines: string[] = [
    '================================================================================',
    '📊 گزارش تحلیلی جامع مکالمات چت ناشناس تلگرام (Anonymous Chat Analysis Report)',
    '================================================================================',
    `📅 زمان تولید گزارش: ${nowStr} (${nowIso})`,
    `🤖 ربات هدف: ${bot?.name || 'ربات ناشناس'} (@${bot?.botUsername?.replace('@', '') || ''})`,
    `📱 شماره حساب تلگرام: ${appState.credentials.phoneNumber || 'ثبت نشده'} (${appState.credentials.userProfile?.firstName || 'UserBot'})`,
    `👥 تعداد کل مکالمات ثبت‌شده در این گزارش: ${filteredSessions.length} مکالمه`,
    `📥 مجموع پیام‌های دریافتی از کاربران ناشناس: ${totalStrangerMsgs} پیام`,
    `📤 مجموع پاسخ‌های ارسالی هوش مصنوعی (Gemini): ${totalAiMsgs} پیام`,
    `📈 میانگین تبادل پیام در هر مکالمه: ${filteredSessions.length > 0 ? ((totalStrangerMsgs + totalAiMsgs) / filteredSessions.length).toFixed(1) : '0'} پیام`,
    '',
    '--------------------------------------------------------------------------------',
    '⚙️ دستورالعمل و پرامپت فعال هوش مصنوعی (Active AI System Prompt & Instructions)',
    '--------------------------------------------------------------------------------',
    `[متن دستورالعمل و هویت هوش مصنوعی]:`,
    instructions?.systemPrompt || '(دستورالعمل پیش‌فرض)',
    '',
    `• سقف پیام در هر چت: ${instructions?.maxMessagesPerChat || 4} پیام`,
    `• عمق پنجره حافظه مکالمه جاری: ${instructions?.memoryWindowSize || 10} پیام`,
    `• پیام سلام/شروع خودکار: ${instructions?.initiateGreetingOnConnect ? `فعال («${instructions?.initialGreetingText || 'سلام خوبی؟'}»)` : 'غیرفعال'}`,
    `• پیام خداحافظی قبل از خروج: ${instructions?.enablePreExitFarewell ? `فعال («${instructions?.preExitFarewellText || ''}»)` : 'غیرفعال'}`,
    `• محصول/کمپین تبلیغاتی: ${instructions?.productPromotion?.enabled ? `فعال (محصول: ${instructions?.productPromotion?.productName || 'نامشخص'} - آیدی: ${instructions?.productPromotion?.contactHandleOrLink || 'ندارد'})` : 'غیرفعال'}`,
    '',
    '================================================================================',
    '📋 مشروح متن مکالمات ثبت‌شده به ترتیب زمان (Full Conversation Transcripts)',
    '================================================================================',
    '',
  ];

  if (filteredSessions.length === 0) {
    lines.push('⚠️ هنوز هیچ مکالمه‌ای در این نشست ثبت نشده است.');
  } else {
    filteredSessions.forEach((s, idx) => {
      const sessionNum = s.sessionIndex || (filteredSessions.length - idx);
      const startFa = s.startedAt ? new Date(s.startedAt).toLocaleTimeString('fa-IR') : 'نامشخص';
      const endFa = s.endedAt ? new Date(s.endedAt).toLocaleTimeString('fa-IR') : 'در حال انجام';

      let exitReasonLabel = 'در حال گفتگو یا خروج عادی';
      switch (s.exitReason) {
        case 'max_messages_reached':
          exitReasonLabel = 'اتمام سقف پیام‌های مجاز (خروج طبق سناریو)';
          break;
        case 'stranger_silence':
          exitReasonLabel = 'سکوت و عدم پاسخ مخاطب (Timeout)';
          break;
        case 'stranger_disconnected':
          exitReasonLabel = 'قطع اتصال توسط کاربر ناشناس';
          break;
        case 'inappropriate_content':
          exitReasonLabel = 'شناسایی کلیدواژه نامناسب';
          break;
        case 'manual_operator_skip':
          exitReasonLabel = 'رد کردن دستی توسط اپراتور';
          break;
      }

      lines.push(`────────────────────────────────────────────────────────────────────────────────`);
      lines.push(`💬 [مکالمه شماره #${sessionNum}] (شناسه: ${s.id})`);
      lines.push(`• شروع: ${startFa}  |  پایان: ${endFa}  |  وضعیت/علت خاتمه: ${exitReasonLabel}`);
      if (s.partnerProfileSnippet) {
        lines.push(`• مشخصات استخراج‌شده هم‌صحبت: ${s.partnerProfileSnippet}`);
      }
      if (s.partnerTag) {
        lines.push(`• شناسه/تگ مخاطب: ${s.partnerTag}`);
      }
      lines.push(`• آمار پیام‌ها: ${s.aiMessagesCount || 0} پیام بات/هوش مصنوعی | ${s.strangerMessagesCount || 0} پیام کاربر ناشناس`);
      lines.push(`----------------- ریز دیالوگ‌ها و پیام‌ها -----------------`);

      if (!s.transcript || s.transcript.length === 0) {
        lines.push('  (پیامی رد و بدل نشد)');
      } else {
        s.transcript.forEach((m) => {
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('fa-IR') : '';
          let senderLabel = '[کاربر ناشناس]';
          if (m.sender === 'me_melody') {
            senderLabel = '[بات (هوش مصنوعی Gemini)]';
          } else if (m.sender === 'operator_manual') {
            senderLabel = '[اپراتور دستی]';
          } else if (m.sender === 'bot_system') {
            senderLabel = '[پیام سیستمی ربات]';
          }

          lines.push(`[${time}] ${senderLabel}: ${m.text}`);
        });
      }
      lines.push('');
    });
  }

  lines.push('================================================================================');
  lines.push('🏁 پایان گزارش تحلیلی چت ناشناس.');
  lines.push('================================================================================');

  return lines.join('\n');
}

// ============================================================================
// ANONYMOUS CHAT BOT API ENDPOINTS
// ============================================================================

app.get('/api/anonymous/state', (req, res) => {
  syncCurrentTestRunFromSessions();
  res.json({
    automator: appState.anonymousAutomator || defaultAnonymousAutomatorConfig,
    activeSession: activeAnonChatSession || appState.activeAnonymousSession || null,
    history: appState.anonymousSessionHistory || [],
    currentTestRun: appState.currentTestRun || null,
    previousTestRuns: appState.previousTestRuns || [],
  });
});

app.get('/api/anonymous/export-history', (req, res) => {
  try {
    syncCurrentTestRunFromSessions();
    const format = (req.query.format as string) || 'json';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'json') {
      const exportJson = generateCleanPromptEvaluationJson(appState.currentTestRun);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="prompt_evaluation_run_${timestamp}.json"`
      );
      res.send(JSON.stringify(exportJson, null, 2));
      return;
    }

    // Default: Formatted Text / Markdown Report
    const automator = appState.anonymousAutomator;
    const history = appState.anonymousSessionHistory || [];
    const allSessions = [...history];
    if (activeAnonChatSession && !allSessions.some((s) => s.id === activeAnonChatSession?.id)) {
      allSessions.unshift({ ...activeAnonChatSession });
    }

    const textReport = generateAnonymousChatTextReport(allSessions, automator, {
      runOnly: true,
      currentRunStartedAt: automator?.currentRunStartedAt,
    });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="anonymous_prompt_evaluation_${timestamp}.txt"`
    );
    res.send(textReport);
  } catch (err: any) {
    console.error('Failed to export anonymous history:', err);
    res.status(500).json({ error: 'خطا در تولید فایل خروجی تاریخچه: ' + (err.message || err) });
  }
});

app.get('/api/anonymous/export-run-json', (req, res) => {
  try {
    syncCurrentTestRunFromSessions();
    const runId = req.query.runId as string;
    let targetRun = appState.currentTestRun;
    if (runId && appState.previousTestRuns) {
      const found = appState.previousTestRuns.find((r) => r.id === runId);
      if (found) targetRun = found;
    }
    const exportJson = generateCleanPromptEvaluationJson(targetRun);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="prompt_evaluation_run_${timestamp}.json"`
    );
    res.send(JSON.stringify(exportJson, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: 'خطا در تولید فایل JSON: ' + (err.message || err) });
  }
});

app.post('/api/anonymous/clear-history', (req, res) => {
  appState.anonymousSessionHistory = [];
  if (appState.currentTestRun) {
    appState.currentTestRun.conversationsByPartner = [];
    appState.currentTestRun.analyticsSummary = {
      totalPartnersChatted: 0,
      totalPartnerMessagesReceived: 0,
      totalAiRepliesSent: 0,
      averageTurnsPerPartner: 0,
    };
  }
  saveData();
  addLog('info', '[چت ناشناس] آرشیو مکالمات دور جاری با موفقیت پاکسازی شد.');
  res.json({ success: true, message: 'تاریخچه مکالمات با موفقیت پاکسازی شد.', history: [] });
});

app.post('/api/anonymous/update-config', (req, res) => {
  const updates = req.body;
  appState.anonymousAutomator = normalizeAnonymousAutomatorConfig({
    ...appState.anonymousAutomator,
    ...updates,
    instructions: {
      ...(appState.anonymousAutomator?.instructions || {}),
      ...(updates.instructions || {}),
      productPromotion: {
        ...(appState.anonymousAutomator?.instructions?.productPromotion || {}),
        ...(updates.instructions?.productPromotion || {}),
      },
    },
  });

  saveData();
  res.json({ success: true, automator: appState.anonymousAutomator });
});

app.post('/api/anonymous/save-bot', (req, res) => {
  const bot: AnonymousBotProfile = req.body;
  if (!bot || !bot.name || !bot.botUsername) {
    res.status(400).json({ error: 'نام و آیدی ربات الزامی است.' });
    return;
  }
  if (!appState.anonymousAutomator) {
    appState.anonymousAutomator = { ...defaultAnonymousAutomatorConfig };
  }
  const existingIdx = appState.anonymousAutomator.bots.findIndex((b) => b.id === bot.id);
  if (existingIdx >= 0) {
    appState.anonymousAutomator.bots[existingIdx] = bot;
  } else {
    appState.anonymousAutomator.bots.push(bot);
  }
  saveData();
  res.json({ success: true, bots: appState.anonymousAutomator.bots });
});

app.post('/api/anonymous/delete-bot', (req, res) => {
  const { botId } = req.body;
  if (!appState.anonymousAutomator) {
    res.json({ success: true });
    return;
  }
  appState.anonymousAutomator.bots = appState.anonymousAutomator.bots.filter((b) => b.id !== botId);
  if (appState.anonymousAutomator.selectedBotId === botId) {
    appState.anonymousAutomator.selectedBotId = appState.anonymousAutomator.bots[0]?.id || '';
  }
  saveData();
  res.json({ success: true, bots: appState.anonymousAutomator.bots });
});

app.post('/api/anonymous/start', async (req, res) => {
  const { botId } = req.body;
  if (!appState.anonymousAutomator) {
    appState.anonymousAutomator = { ...defaultAnonymousAutomatorConfig };
  }
  if (botId) {
    appState.anonymousAutomator.selectedBotId = botId;
  }

  const automator = appState.anonymousAutomator;
  const selectedBot = automator.bots.find((b) => b.id === automator.selectedBotId) || automator.bots[0];
  if (!selectedBot) {
    return res.status(400).json({
      error: 'هیچ ربات چت ناشناسی در لیست وجود ندارد یا انتخاب نشده است.',
    });
  }

  // Pre-validate Telegram connection and session health
  const client = await getOrInitTgClient();
  if (!client) {
    appState.credentials.isConnected = false;
    appState.anonymousAutomator.isActive = false;
    saveData();
    addLog('error', '[چت ناشناس] شروع اتوماسیون ناموفق بود: اتصال به حساب تلگرام برقرار نیست یا نشست منقضی شده است.');
    return res.status(400).json({
      error: 'اتصال به حساب تلگرام برقرار نیست یا نشست حساب منقضی گردیده است. لطفاً ابتدا وارد حساب تلگرام خود شوید.',
      needAuth: true,
    });
  }

  // Pre-validate bot entity resolution before starting
  let botEntity: any = null;
  try {
    botEntity = await resolveBotEntitySmart(client, selectedBot.botUsername);
    if (!botEntity) {
      throw new Error(`ربات ${selectedBot.botUsername} در تلگرام یافت نشد.`);
    }
  } catch (entityErr: any) {
    appState.anonymousAutomator.isActive = false;
    saveData();
    addLog('error', `[چت ناشناس] یافتن ربات ${selectedBot.botUsername} ناموفق بود: ${entityErr.message}`);
    return res.status(400).json({
      error: entityErr.message,
    });
  }

  appState.anonymousAutomator.isActive = true;
  appState.anonymousAutomator.currentRunStartedAt = new Date().toISOString();

  // Initialize fresh prompt evaluation run (clearing previous run history from memory)
  const newRun = initNewPromptEvaluationTestRun(botId);
  activeAnonChatSession = null;
  saveData();

  addLog(
    'info',
    `[ارزیابی دستورالعمل] دوره جدید شماره #${newRun.runIndex} با پرامپت فعال آغاز شد. تمامی مکالمات این دوره تا زمان توقف به صورت تفکیک‌شده ذخیره می‌شوند.`
  );

  // Launch background worker
  runAnonymousChatWorker().catch((err) => {
    console.error('Failed to run anonymous chat worker:', err);
  });

  res.json({
    success: true,
    message: `دوره جدید تست دستورالعمل (#${newRun.runIndex}) با موفقیت آغاز شد.`,
    testRun: newRun,
  });
});

app.post('/api/anonymous/stop', async (req, res) => {
  if (appState.anonymousAutomator) {
    appState.anonymousAutomator.isActive = false;
  }
  anonEngineAbort = true;
  isAnonEngineRunning = false;
  if (activeAnonChatSession) {
    activeAnonChatSession.status = 'ended';
    activeAnonChatSession.statusMessage = 'توسط کاربر متوقف گردید.';
    activeAnonChatSession.endedAt = new Date().toISOString();
  }
  if (appState.currentTestRun) {
    appState.currentTestRun.status = 'stopped';
    appState.currentTestRun.endedAt = new Date().toISOString();
  }
  syncCurrentTestRunFromSessions();
  saveData();
  addLog(
    'info',
    `[ارزیابی دستورالعمل] اتوماسیون متوقف شد. ${appState.currentTestRun?.analyticsSummary.totalPartnersChatted || 0} مکالمه تفکیک‌شده در قالب JSON آماده دانلود است.`
  );
  res.json({
    success: true,
    message: 'اتوماسیون چت ناشناس متوقف گردید.',
    testRun: appState.currentTestRun,
  });
});

app.post('/api/anonymous/next-stranger', async (req, res) => {
  const client = await getOrInitTgClient();
  const automator = appState.anonymousAutomator;
  const selectedBot = automator?.bots.find((b) => b.id === automator.selectedBotId) || automator?.bots[0];
  if (client && selectedBot) {
    try {
      const botEntity = await resolveBotEntitySmart(client, selectedBot.botUsername);

      if (activeAnonChatSession) {
        await executeExitAndNextPartner(
          client,
          botEntity,
          selectedBot,
          activeAnonChatSession,
          'manual_operator_skip',
          'رد کردن دستی توسط اپراتور و درخواست اتصال به مخاطب جدید'
        );
      }

      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: e.message });
      return;
    }
  }
  res.status(400).json({ error: 'کلاینت تلگرام در دسترس نیست.' });
});

app.post('/api/anonymous/send-manual-message', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'متن پیام خالی است.' });
    return;
  }
  const client = await getOrInitTgClient();
  const automator = appState.anonymousAutomator;
  const selectedBot = automator?.bots.find((b) => b.id === automator.selectedBotId) || automator?.bots[0];
  if (client && selectedBot) {
    try {
      const botEntity = await resolveBotEntitySmart(client, selectedBot.botUsername);
      await client.sendMessage(botEntity, { message: text.trim() });
      if (activeAnonChatSession) {
        activeAnonChatSession.transcript.push({
          id: 'msg_' + Date.now() + '_operator',
          sender: 'me_melody',
          text: text.trim(),
          timestamp: new Date().toISOString(),
        });
        saveData();
      }
      res.json({ success: true });
      return;
    } catch (e: any) {
      res.status(500).json({ error: e.message });
      return;
    }
  }
  res.status(400).json({ error: 'کلاینت تلگرام در دسترس نیست.' });
});

app.post('/api/anonymous/test-ai-simulation', async (req, res) => {
  const { history, instructions, sessionContext } = req.body;
  try {
    const activeInstructions: AnonymousChatInstructions =
      instructions ||
      appState.anonymousAutomator?.instructions ||
      defaultAnonymousAutomatorConfig.instructions;

    const replyResult = await generateAnonymousAiReply(
      history || [],
      activeInstructions,
      sessionContext
    );
    res.json({
      reply: replyResult.text,
      source: replyResult.source,
      shouldSendPromoCard: replyResult.shouldSendPromoCard,
      promoMentioned: replyResult.promoMentioned,
      stepOutput: replyResult.stepOutput,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to simulate reply' });
  }
});

app.get('/api/anonymous/run-conversation-tests', (req, res) => {
  try {
    const summary = runAllConversationTests();
    res.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || String(err),
    });
  }
});

// =========================================================================
// STEP 5: EVALUATION & REPLAY ENGINE API ENDPOINTS (Offline / Isolated / Read-Only)
// =========================================================================

app.get('/api/evaluation/gold-dataset', (req, res) => {
  try {
    const summaries = GOLD_DATASET.map((c) => ({
      conversationId: c.conversationId,
      category: c.category,
      categoryTitleFa: c.categoryTitleFa,
      description: c.description,
      partnerTag: c.partnerTag,
      turnCount: c.turns.length,
      expectedOutcome: c.expectedOutcome,
    }));
    res.json({
      success: true,
      totalConversations: GOLD_DATASET.length,
      dataset: summaries,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post('/api/evaluation/run-replay', async (req, res) => {
  try {
    const { mode = 'DETERMINISTIC_REPLAY', categoryFilter, conversationIds } = req.body;

    let targetDataset = [...GOLD_DATASET];
    if (categoryFilter && categoryFilter !== 'ALL') {
      targetDataset = targetDataset.filter((c) => c.category === categoryFilter);
    }
    if (Array.isArray(conversationIds) && conversationIds.length > 0) {
      targetDataset = targetDataset.filter((c) => conversationIds.includes(c.conversationId));
    }

    const replayMode =
      mode === 'LLM_REPLAY' ? ReplayMode.LLM_REPLAY : ReplayMode.DETERMINISTIC_REPLAY;

    const report = await runFullEvaluation(targetDataset, replayMode);

    res.json({
      success: true,
      report,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.get('/api/evaluation/run-tests', async (req, res) => {
  try {
    const testResults = await runAllEvaluationTests();
    res.json({
      success: true,
      testResults,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

app.post('/api/evaluation/export', async (req, res) => {
  try {
    const { format = 'json', report } = req.body;
    let evalReport = report;
    if (!evalReport) {
      evalReport = await runFullEvaluation(GOLD_DATASET, ReplayMode.DETERMINISTIC_REPLAY);
    }

    if (format === 'csv') {
      const csv = exportTracesToCSV(evalReport.allTraces || []);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="evaluation_traces_${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(csv);
    }

    const json = exportReportToJSON(evalReport);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="evaluation_report_${new Date().toISOString().slice(0, 10)}.json"`);
    return res.send(json);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});


// SERVER-SIDE BACKGROUND SCHEDULER LOOP (Checks every 10 seconds)
setInterval(async () => {
  if (!appState.scheduler.isAutoRunActive) return;

  // Night Mode Check (01:00 AM to 07:00 AM)
  if (appState.scheduler.nightModePause) {
    const currentHour = new Date().getHours();
    if (currentHour >= 1 && currentHour < 7) {
      return; // Skip posting during sleep hours
    }
  }

  if (appState.scheduler.nextRunTime) {
    const nextRun = new Date(appState.scheduler.nextRunTime).getTime();
    const now = Date.now();
    
    if (now >= nextRun) {
      console.log('⏰ Triggering automated Telegram UserBot product campaign broadcast...');
      await executeBroadcast(false);
    }
  }
}, 10000);

// VITE SERVING & LAUNCH
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', async () => {
    logger.info('SERVER_STARTUP_SUCCESS', {
      data: { port: PORT, nodeEnv: process.env.NODE_ENV || 'development' },
    });
    console.log(`Telegram UserBot Promoter running at http://0.0.0.0:${PORT}`);
    if (appState.credentials.sessionString && appState.credentials.isConnected) {
      console.log('🔄 Restoring saved Telegram session...');
      getOrInitTgClient().then(client => {
        if (client) {
          console.log('✅ Telegram session restored successfully on startup!');
        } else {
          console.log('⚠️ Could not restore saved Telegram session on startup.');
        }
      }).catch(err => {
        console.warn('Telegram auto-reconnect error:', err?.message || err);
      });
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`[SHUTDOWN] Received ${signal}. Starting graceful shutdown...`);
    logger.info('SERVER_SHUTDOWN_SIGNAL', { data: { signal } });
    HealthService.markShuttingDown();

    server.close(() => {
      console.log('[SHUTDOWN] HTTP server closed gracefully.');
      saveData();
      process.exit(0);
    });

    // Force exit if hanging after 5s
    setTimeout(() => {
      console.error('[SHUTDOWN] Forceful shutdown triggered after timeout.');
      process.exit(1);
    }, 5000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Global uncaught exception and unhandled rejection safety
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT_EXCEPTION', err);
    console.error('[CRITICAL] Uncaught Exception:', err);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED_REJECTION', reason);
    console.error('[CRITICAL] Unhandled Rejection:', reason);
  });
}

startServer();
