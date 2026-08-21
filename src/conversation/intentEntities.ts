import { normalizePersianText, tokenizePersianText, hasExactToken, matchBoundedPattern } from './normalizer';

/**
 * Entity & Lexical Evidence Extractor for Persian Conversational Sales
 * Extracts domain-specific entities and structural concepts independently of intent scoring.
 */

export interface ExtractedEntities {
  hasProductEntity: boolean;
  hasPriceEntity: boolean;
  hasPlanEntity: boolean;
  hasSupportEntity: boolean;
  hasTrialEntity: boolean;
  hasPurchaseEntity: boolean;
  hasRejectionEntity: boolean;
  hasObjectionEntity: boolean;
  hasNeedEntity: boolean;
  hasBotSuspicionEntity: boolean;
  hasGreetingEntity: boolean;
  hasGoodbyeEntity: boolean;
  hasSmallTalkEntity: boolean;
  hasGeneralQuestionEntity: boolean;
  hasInappropriateEntity: boolean;
  hasSpamEntity: boolean;
  hasCommercialTrapEntity: boolean;
  hasOffTopicPositiveEntity: boolean;

  // Granular concept flags
  planConcepts: {
    hasPlanToken: boolean;
    hasDurationToken: boolean;
    hasUsageLimitToken: boolean;
    hasUserCountToken: boolean;
    hasComparisonToken: boolean;
  };

  needConcepts: {
    hasPlatformOrNetwork: boolean;
    hasFailureOrDegradation: boolean;
    hasFrustrationOrImpact: boolean;
    hasIpOrTradingRisk: boolean;
    hasGamingLatency: boolean;
  };

  objectionConcepts: {
    hasPriceResistance: boolean;
    hasTrustConcern: boolean;
    hasRiskOrFailureConcern: boolean;
    hasValueDoubt: boolean;
    hasCompetitorComparison: boolean;
    hasRefundOrGuaranteeConcern: boolean;
    hasUsabilityDoubt: boolean;
    hasBadPriorExperience: boolean;
  };

  smallTalkConcepts: {
    hasAslPattern: boolean;
    hasOccupationOrStudy: boolean;
    hasRoutineOrDailyStatus: boolean;
    hasHobbyOrActivity: boolean;
    hasSocialBonding: boolean;
    hasPersonalDisclosure: boolean;
    hasCasualFollowup: boolean;
  };

  productCuriousConcepts: {
    hasDeviceOrOs: boolean;
    hasIspOrNetwork: boolean;
    hasProtocolOrTech: boolean;
    hasLocationOrServer: boolean;
    hasFixedIpOrKillSwitch: boolean;
  };

  offTopicConcepts: {
    hasCommodityOrMarket: boolean;
    hasMacroEconomy: boolean;
    hasAcademicOrExams: boolean;
    hasCookingOrFoodRecipe: boolean;
    hasSportsScoresOrTeams: boolean;
    hasAutomotiveRepair: boolean;
  };

  matchedEntities: string[];
}

// ---------------------------------------------------------
// TOKEN-SAFE SAFETY / PROFANITY LEXICON
// ---------------------------------------------------------

const SAFE_EXCLUDED_TOKENS = new Set([
  'پادکست',
  'پروکسی',
  'عکس',
  'عکسی',
  'عکسها',
  'عکسای',
  'عکساش',
  'عکسات',
  'تاکسی',
  'انعکاس',
  'کلاسیک',
  'کاست',
  'لوکیشن',
  'اکانت',
  'آیکون',
  'قانون',
  'اکونومی',
  'ارگانیک',
  'مکانیک',
  'الکترونیک',
  'تکنیک',
  'تاکتیک',
  'گیر',
  'گیرم',
  'گیری',
  'گیره',
]);

const EXACT_INAPPROPRIATE_TOKENS = new Set([
  'کس',
  'کص',
  'کیر',
  'کونی',
  'جنده',
  'سکس',
  'لاشی',
  'حرومی',
  'سیکتیر',
  'گمشو',
  'حرومزاده',
  'کصکش',
  'کسکش',
  'بیناموس',
  'بی‌ناموس',
  'حروملقمه',
  'ممه',
  'کون',
  'کصده',
  'کسده',
  'کصلیس',
  'کسلیس',
  'کصخل',
  'کسخل',
  'کونده',
  'شاش',
  'جقی',
  'کصشعر',
  'کسشعر',
  'سیکتیرکن',
]);

function checkInappropriate(tokens: string[], normText: string): boolean {
  for (const token of tokens) {
    if (SAFE_EXCLUDED_TOKENS.has(token)) {
      continue;
    }
    if (EXACT_INAPPROPRIATE_TOKENS.has(token)) {
      return true;
    }
    // Specific compound stems with safety bounds
    if (/^(کیر(م|ت|ش|تون|شون|خر|کلفت|سیاه)?)$/.test(token)) {
      return true;
    }
    if (/^(کص|کس)(کش|لیس|خل|ده|شعر|لیس|م|ت|ش)$/.test(token)) {
      return true;
    }
    if (/^(کون(ی|ده|م|ت|ش|تون|شون)?)$/.test(token)) {
      return true;
    }
    if (/^(لاشی|لاشیه|حرومزاده|سیکتیر)$/.test(token)) {
      return true;
    }
  }

  // Phrase-level boundary check
  if (matchBoundedPattern(normText, '(کصکش|کسکش|بی ناموس|بیناموس|حروم زاده|حرومزاده|مادر جنده|مادرتو|خواهرتو|سیکتیر|گمشو لاشی|لاشی بازی)')) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------
// REGULAR EXPRESSION PATTERNS FOR LEXICAL EVIDENCE
// ---------------------------------------------------------

export const ENTITY_PATTERNS = {
  PRODUCT: /(فیلترشکن|وی پی ان|vpn|v2ray|vless|vmess|shadowsocks|پروکسی|proxy|کانفیگ|کانفیک|سرور اختصاصی|v2box|streisand|nekobox|hiddify|outline|reality|trojan|وارپ|warp)/i,

  PRICE: /(قیمت|قیمتش|هزینه|هزینش|چند تومن|چندتومنه|تعرفه|نرخ|ماهی چنده|ماهانه چقدر|سالیانه|چند میدی|چند درمیاد|لیست قیمت|تعرفه‌ها|تعرفه ها|چقدر میشه|چقدر باید بدم|چند هزار تومن|چقدر درمیاد آخرش|باید پرداخت کنیم|ماهی چقدر|قیمت روز)/i,

  PLAN: /(پلن|پلن‌ها|پلنها|پلنا|پکیج|پکیج‌ها|بسته|بسته‌ها|اشتراک|سرویس|تعرفه|ترافیک|نامحدود|حجمی|گیگ|گیگابایت|یک ماهه|دو ماهه|سه ماهه|شش ماهه|سالیانه|سالانه|ماهانه|تک کاربره|دو کاربره|سه کاربره|چهار کاربره|چند کاربره|چند دستگاه|کاربره|خانواده|سقف مصرف|تنوع پلن|دو نفر|دوکاربره)/i,

  SUPPORT: /(آیدی ادمین|ایدی ادمین|آیدی پشتیبانی|ایدی پشتیبانی|آیدی شو داری|آیدیشو داری|آیدیشو|آیدی شو|آیدی بده|ایدی بده|آیدی تلگرام|از کجا بخرم|از کجا بگیرم|از کجا باید تهیه کنم|از کجا تهیه کنم|چطوری تهیه کنم|چجوری تهیه کنم|کجا پیام بدم|به کی پیام بدم|لینک خرید|لینک پشتیبانی|کانال کجاست|کانال یا آیدی|آیدی فروش|برای خرید به کجا پیام|آیدی رو بده|آیدی کانال|ادمین صحبت|وارد برنامه کنم|ست کنه بلد نیستم|پیوی ادمین|پشتیبانیتون|ادمین چنل|کانال تلگرامتون|لینک کانال|پشتیبانی راهنمایی|به کی بگم|پیام میدم به ادمین|فیش واریزی)/i,

  TRIAL: /(اکانت تست|کانفیگ تست|تست رایگان|تست میدی|تست بدی|تست بده|اول تست|تست کنم|امتحان کنم|دمو داری|تست نیم ساعته|تست یک روزه|تست ۲۴ ساعته|تست ۱۲ ساعته|تست خوب بدی|تست اولش میدی|تست داری|تست سرعت|تست یک ساعته|یه ساعت تست|اولش تست|یه تست بده|اول امتحان کنم)/i,

  PURCHASE: /(میخوام بخرم|میخوام سفارش بدم|شماره کارت|شماره کارت بده|شماره کارت بفرست|شماره حساب|شماره شبا|اطلاعات پرداخت|الان واریز کنم|الان پرداخت میکنم|واریز کنم|پرداخت کنم|برام فعال کن|خرید قطعی|من یه دونه میخوام|اکانت میخوام بخرم|چجوری پرداخت کنم|میخوامش|اوکی میخوامش|برام اوکی کن الان واریز|مبلغ رو زدم|وجه رو انتقال|میخام بخرم|سفارشمو ثبت کن|فیش واریزی|بخرم راحت شم|قطعی میخرم|پیام میدم بخرم)/i,

  REJECTION: /(نمیخوام|لازم ندارم|نیاز ندارم|علاقه ندارم|تبلیغاتیه|تبلیغه|بازاریاب|فروشنده‌ای|ولم کن|نه مرسی|نه ممنون|(?:\b|^|\s)نه بابا(?:\b|$|\s)|دستت درد نکنه نمیخوام|تبلیغ نکن|اسپم نکن|خریدار نیستم|پول ندارم بدم|بس کن|حوصله ندارم|ولش کن نمیخوام|فیلترشکن نمیخوام|اصلا نمیخوام|قصد خرید ندارم|تمایلی ندارم|کنسله|صرف نظر کردم|حوصله تو ندارم|نمیخوام داداش|هیچی نمیخوام)/i,

  OBJECTION: /(گرونه|خیلی گرونه|گرونه بابا|گرانه|تخفیف|ارزونتر|کلاهبردار|کلاهبرداری|اعتماد ندارم|تضمینیه|تضمینی هست|نکنه قطع بشه|نکنه فیلتر بشه|پولمون بسوزه|گارانتی بازگشت وجه|ضمانت مرجوعی|سایفون دارم|سایفون رایگان|رایگان دارم|خودم رایگان دارم|خودم vpn دارم|بلد نیستم.*(کانفیگ|نصب|برنامه)|پیچیده و سخته|پاسخگو نبودن|چرا اینقدر گرونه|چرا اینقدر قیمتش بالاست|بقیه کانالا.*میدن|از هرکی خریدم.*قطع|نصف این قیمت|سرور اختصاصی طلاست|مگه.*(طلاست|ناسا)|قبلا از یه کانال خریدم|پشتیبانی جواب نمیدن|بدون تست خرید نمیکنم|پول ندارم بدم|تضمین بدون قطعی|خودم اختصاصی دارم|خودم دارم)/i,

  NEED: /(اینترنت.*(قطعه|خرابه|کنده|افتضاحه|داغونه|وصل نمیشه|نمیکشه|محدوده)|نت.*(قطعه|خرابه|کنده|افتضاحه|داغونه|وصل نمیشه|نمیکشه)|فیلترینگ|اینستا.*(باز نمیشه|وا نمیشه|قطعه|وصل نمیشه|لود نمیشه|فیلتره)|تلگرام.*(باز نمیشه|قطعه|وصل نمیشه|لود نمیشه|عکس.*لود نمیشه|وویس.*گوش)|یوتیوب.*(باز نمیشه|قطعه|وصل نمیشه|لود نمیشه|۴k|ویدیو.*آپلود)|پینترست|پینگ.*(بالاست|داغونه|رفته بالا|بالا|۳۰۰)|نت خوابگاه|سرعت داغونه|استوری آپلود نمیشه|فروش صفر شده|سفارش مشتری|پروژه‌هام.*تحویل|هیچ فیلترشکنی کار نمیکنه|فیلترشکنام.*از کار افتاده|کانفیگام.*از کار افتادن|کل فیلترشکنام|همه چی فیلتره|تحریم شکن|وضع نت|هیچی باز نمیشه|کلافه شدم|درمونده شدم|اعصابم خورده|اعصابم داغونه|روزی \d+ گیگ دانلود|کارم دانلوده|کارم فریلنسریه.*قطعی|عکس.*لود نمیشه|ترید.*صرافی|بایننس.*آیپی|حسابم بسته میشه)/i,

  BOT_SUSPICION: /(تو رباتی|رباتی\?|رباتی؟|رباتی|ربات نشسته|هوش مصنوعی|ai هستی|باتی|انسان نیستی|داری ضبط شده|داری خودکار|خودکار|از پیش ضبط شده|پیام.*خودکار|پشت گوشی کیه|پشت گوشی.*(ربات|انسان|کیه|ادم)|لحنت مثل بات|مثل رباتا|مثل باتا|مثل بات|مثل روبات|چرا مثل بات|چرا مثل ربات|ربات نیستی|یا ادمی|پشت خط ادمه|پشت خط کیه|چت باتی|چت جی پی تی)/i,

  GREETING: /^(سلام|درود|هلو|hi|slm|hello|وقت بخیر|صبح بخیر|شبت بخیر|روز خوش|سلاممم|سلاام|سلااام)/i,

  GOODBYE: /(خداحافظ|خدافظ|بای|بای بای|bye|فعلا|برم دیگه|باید برم|شبت خوش|شبت آروم|شبت شیک|شب بخیر|شبتون پر از آرامش|خوشحال شدم.*(فعلا|بای|خدافظ|شب)|قربانت فعلا|دمت گرم بای|یا علی|من رفتم بخوابم|برم بخوابم|برم دوش بگیرم|برم سر کارم|شب پیام میدم|بعد از ظهر میام پیام میدم|اسکرین گرفتم.*(پیام|شب|حقوق)|سر ماه.*پیام میدم|حقوق بدن پیام میدم|حقوق دادن پیام میدم|ذخیره کردم.*پیام میدم|باید برم فعلا|مراقب خودت باش)/i,

  // Commercial Traps (Non-VPN commerce / unrelated goods / positive off-topic indicators)
  COMMERCIAL_TRAP: /(قیمت.*(طلا|سکه|دلار|ارز|ماشین|خودرو|مسکن|خونه|اجاره|بیتکوین|سهام|بورس|زعفران|پسته|گندم|گوجه|آهن|میلگرد)|شهریه.*(دانشگاه|مدرسه|کلاس)|تست.*(رانندگی|کنکور|پزشکی|خون|بارداری|کرونا|آیلتس|تافل)|خرید.*(ماشین|خونه|لپتاپ|کفش|لباس|طلا|سکه))/i,

  QUESTION_MARKERS: /(\?|؟|چرا|چطور|چجوری|کجا|کی|آیا|مگه|کدوم|چی خوردی|اهل .* هستی|داری\?|داری؟|باشگاه میری|حیوون خونگی|پایتون کار میکنی|کد زدن|پیشنهاد بدی|دانشگاه رفتی|مشغولی|اهل کجایی|چی گوش میدی|چه پادکستی|چه فیلمی|کجا رفتی)/i,

  SPAM: /(t\.me\/|telegram\.me\/|joinchat|instagram\.com\/|youtube\.com\/|rubika\.ir|bale\.ai|soroush\.ir|پکیج آموزش کسب درآمد|درآمد دلاری|کانال من|عضو کانال|ربات شارژ|ربات صیغه|شارژ رایگان)/i,
};

/**
 * Extracts entities present in the normalized message.
 */
export function extractEntities(normText: string): ExtractedEntities {
  const matchedEntities: string[] = [];
  const tokens = tokenizePersianText(normText);

  // 1. Safety & Profanity (Token-safe)
  const hasInappropriate = checkInappropriate(tokens, normText);
  if (hasInappropriate) matchedEntities.push('INAPPROPRIATE');

  // 2. Spam
  const hasSpam = !hasInappropriate && ENTITY_PATTERNS.SPAM.test(normText);
  if (hasSpam) matchedEntities.push('SPAM');

  // 3. Off-Topic Positive Concepts & Commercial Traps
  const hasCommodityOrMarket = /(قیمت.*(طلا|سکه|دلار|ارز|بیتکوین|اتریوم|سهام|بورس|زعفران|پسته|گندم|گوجه|آهن|میلگرد)|شاخص بورس|شاخص کل بورس|اوراق بهادار|نرخ ارز|نرخ دلار)/i.test(normText);
  const hasMacroEconomy = /(نرخ تورم|نرخ بهره|نرخ بیکاری|نرخ رشد|بانک مرکزی|صندوق بین‌المللی)/i.test(normText);
  const hasAcademicOrExams = /(شهریه دانشگاه|تست رانندگی|آزمون آیین نامه|کنکور سراسری|امتحان نهایی|مدرک تافل|آیلتس)/i.test(normText);
  const hasCookingOrFoodRecipe = /(طرز تهیه|دستور پخت|طرز پخت|دستور تهیه|مواد لازم برای|قورمه سبزی چطور درست میشه)/i.test(normText);
  const hasSportsScoresOrTeams = /(نتیجه بازی|لیگ برتر|جدول رده بندی|ترکیب پرسپولیس|ترکیب استقلال|بازی دیشب|چند چند شد|بارسلونا|رئال مادرید|بازی رو برد|گل زد)/i.test(normText);
  const hasAutomotiveRepair = /(تعویض روغن|روغن موتور|لنت ترمز|تسمه تایم|تعمیرگاه ماشین|مکانیکی)/i.test(normText);

  const hasOffTopicPositive = hasCommodityOrMarket || hasMacroEconomy || hasAcademicOrExams || hasCookingOrFoodRecipe || hasSportsScoresOrTeams || hasAutomotiveRepair;
  const hasCommercialTrap = ENTITY_PATTERNS.COMMERCIAL_TRAP.test(normText) || hasCommodityOrMarket || hasMacroEconomy;
  if (hasCommercialTrap || hasOffTopicPositive) matchedEntities.push('COMMERCIAL_TRAP');

  // 4. Product Entity
  const hasProduct = ENTITY_PATTERNS.PRODUCT.test(normText);
  if (hasProduct) matchedEntities.push('PRODUCT');

  // 5. Price Entity
  const hasPrice = !hasCommercialTrap && ENTITY_PATTERNS.PRICE.test(normText);
  if (hasPrice) matchedEntities.push('PRICE');

  // 6. Plan Concepts
  const hasPlanToken = /(پلن|پلن‌ها|پلنها|پلنا|پکیج|پکیج‌ها|بسته|بسته‌ها|اشتراک|تعرفه)/i.test(normText);
  const hasDurationToken = /(یک ماهه|دو ماهه|سه ماهه|شش ماهه|سالیانه|سالانه|ماهانه|چند ماهه|یکماهه|دوماهه|سهماهه|ششماهه|۱ ماهه|۲ ماهه|۳ ماهه|۶ ماهه)/i.test(normText);
  const hasUsageLimitToken = /(نامحدود|حجمی|گیگ|گیگابایت|ترافیک|سقف مصرف|حجم|حجمش|گیگی)/i.test(normText);
  const hasUserCountToken = /(تک کاربره|دو کاربره|سه کاربره|چهار کاربره|خانواده|همزمان|چند کاربره|چند نفره|چند اکانته|چند دستگاه|کاربره)/i.test(normText);
  const hasComparisonToken = /(چه پلن‌هایی|کدوم پلن|فرق پلن|لیست پلن|انواع پلن|کدوم بسته|پلن هاتون چیه|تنوع پلن)/i.test(normText);

  const hasPlan = hasPlanToken || (hasDurationToken && (hasProduct || hasUsageLimitToken || hasUserCountToken || /اشتراک|اکانت/i.test(normText))) || hasComparisonToken;
  if (hasPlan) matchedEntities.push('PLAN');

  // 7. Support Entity
  const hasSupport = ENTITY_PATTERNS.SUPPORT.test(normText);
  if (hasSupport) matchedEntities.push('SUPPORT');

  // 8. Trial Entity
  const hasTrial = !hasCommercialTrap && ENTITY_PATTERNS.TRIAL.test(normText);
  if (hasTrial) matchedEntities.push('TRIAL');

  // 9. Purchase Entity
  const hasPurchase = !hasCommercialTrap && ENTITY_PATTERNS.PURCHASE.test(normText);
  if (hasPurchase) matchedEntities.push('PURCHASE');

  // 10. Rejection Entity
  const hasRejection = ENTITY_PATTERNS.REJECTION.test(normText);
  if (hasRejection) matchedEntities.push('REJECTION');

  // 11. Objection Concepts (Broad multidimensional representation)
  const hasPriceResistance = /(گرونه|خیلی گرونه|گرونه بابا|گرانه|تخفیف|ارزونتر|چرا اینقدر گرونه|چرا اینقدر قیمتش بالاست|مگه.*(طلاست|ناسا)|نصف این قیمت|قیمتش زیاده|گرون میدی|چه خبره)/i.test(normText);
  const hasTrustConcern = /(کلاهبردار|کلاهبرداری|اعتماد ندارم|از کجا مطمئن بشم|پولمونو نخوری|نکنه دزد باشید|فیک نیست|اعتمادی نیست)/i.test(normText);
  const hasRiskOrFailureConcern = /(نکنه قطع بشه|نکنه فیلتر بشه|پولمون بسوزه|دو روزه قطع شه|سروراتون دان بشه|تضمینیه|تضمینی هست|گارانتی داره)/i.test(normText);
  const hasValueDoubt = /(سایفون دارم|سایفون رایگان|رایگان دارم|خودم رایگان دارم|خودم vpn دارم|چرا باید پول بدم|مگه رایگان نیست|پروکسی رایگان)/i.test(normText);
  const hasCompetitorComparison = /(بقیه کانالا.*میدن|بقیه جاها ارزونتره|کانال.*نصف قیمت|جاهای دیگه ارزونتر)/i.test(normText);
  const hasRefundOrGuaranteeConcern = /(گارانتی بازگشت وجه|ضمانت مرجوعی|پول پس میدین|مرجوعی دارید|اگه وصل نشد پول)/i.test(normText);
  const hasUsabilityDoubt = /(بلد نیستم.*(کانفیگ|نصب|برنامه|ست)|پیچیده و سخته|گیج کننده است|سخته وصل شدنش)/i.test(normText) && !/پشتیبانی.*راهنمایی|راهنماییم کنه/i.test(normText);
  const hasBadPriorExperience = /(از هرکی خریدم.*(قطع شد|سوخت)|قبلا خریدم کار نکرد|پاسخگو نبودن|پشتیبانیشون جواب نداد)/i.test(normText);

  const hasObjection =
    ENTITY_PATTERNS.OBJECTION.test(normText) ||
    hasPriceResistance ||
    hasTrustConcern ||
    hasRiskOrFailureConcern ||
    hasValueDoubt ||
    hasCompetitorComparison ||
    hasRefundOrGuaranteeConcern ||
    hasUsabilityDoubt ||
    hasBadPriorExperience;

  if (hasObjection) matchedEntities.push('OBJECTION');

  // 12. Need Concepts (Broad multidimensional problem representation)
  const hasPlatformOrNetwork = /(اینترنت|نت|وای فای|همراه اول|ایرانسل|رایتل|مخابرات|شاتل|زیتل|تلگرام|اینستاگرام|اینستا|واتساپ|یوتیوب|پینترست|توییتر|گوگل|فیلترشکنام|کل فیلترشکنام|سرور|پروکسی|کانفیگام|مودم|آنتن|سیمکارت)/i.test(normText);
  const hasFailureOrDegradation = /(قطعه|قطع شده|وصل نمیشه|کانکت نمیشه|باز نمیشه|وا نمیشه|لود نمیشه|افتضاح|خرابه|کنده|نمیکشه|پینگ.*بالا|پینگم بالاست|سرعت داغونه|کار نمیکنه|از کار افتاده|از کار افتادن|آپلود نمیشه|دانلود نمیکنه|هیچی باز نمیکنه|لگ داره|تایم اوت)/i.test(normText);
  const hasFrustrationOrImpact = /(درمونده شدم|کلافه شدم|اعصابم خورده|اعصابم داغونه|کار و زندگیم.*(خوابیده|لنگ)|فروش صفر شده|سفارش مشتری|پروژه‌هام.*تحویل|هیچی باز نمیشه|هیچ عکسی|وویس تلگرام|دانلود نمیتونم بکنم)/i.test(normText);
  const hasIpOrTradingRisk = /(حسابم بسته میشه|بن میشم|لیمیت شدم|نمیتونم ترید کنم|آیپی لو بره|حسابم بلاک)/i.test(normText);
  const hasGamingLatency = /(پینگ.*(بالاست|داغونه|رفته بالا|۳۰۰|بالای)|پینگم بالاست|لگ دارم|نمیشه پلی داد|پینگ وارزون بالاست)/i.test(normText);

  const hasNeed =
    ENTITY_PATTERNS.NEED.test(normText) ||
    (hasPlatformOrNetwork && hasFailureOrDegradation) ||
    hasFrustrationOrImpact ||
    hasIpOrTradingRisk ||
    hasGamingLatency;

  if (hasNeed) matchedEntities.push('NEED');

  // 13. Bot Suspicion Entity
  const hasBotSuspicion = ENTITY_PATTERNS.BOT_SUSPICION.test(normText);
  if (hasBotSuspicion) matchedEntities.push('BOT_SUSPICION');

  // 14. Greeting Entity
  const hasGreeting = ENTITY_PATTERNS.GREETING.test(normText);
  if (hasGreeting) matchedEntities.push('GREETING');

  // 15. Goodbye Entity
  const hasGoodbye = ENTITY_PATTERNS.GOODBYE.test(normText);
  if (hasGoodbye) matchedEntities.push('GOODBYE');

  // 16. Small Talk Concepts (Broad functional dimensions)
  const isMathQuery = /(به علاوه|منهای|ضربدر|تقسیم|چند میشه)/i.test(normText);
  const hasAslPattern =
    !isMathQuery &&
    (/(اصل میدی|asl|اسمت چیه|چند سالته|چندسالته|کجا میشینی|کجایی هستی|دختری یا پسر|پسر یا دختر|کدوم شهری|اهل کجایی)/i.test(normText) ||
      /^\d{1,2}\s+[آ-ی\s]{3,20}$/i.test(normText) ||
      /سلام \d{1,2}\s+[آ-ی\s]{3,20}/i.test(normText) ||
      /سلام اصل میدی \d{1,2}\s+[آ-ی\s]{3,20}/i.test(normText) ||
      /من \d{1,2} سالمه/i.test(normText));

  const hasOccupationOrStudy =
    /(شغلت چیه|تو چیکاره‌ای|تو چیکاره ای|دانشجوام|دانشجو ام|دانشگاه|رشته [آ-ی]+ خوندم|رشته [آ-ی]+ میخونم|کارمند|معمار|آنلاین شاپ|برنامه نویس|پزشک|معلم|فریلنسر|شغل|شاغلم|سر کار|تایم بیکاریم|بیکارم|مدیرمون|رشته معماری|رشته کامپیوتر|رشته هنر|مهندسی صنایع|حسابداری|دانشجوی سال|کار آزاد)/i.test(normText);

  const hasRoutineOrDailyStatus =
    /(خسته شدم|خسته کننده|سر کار بودم|غر شنیدم|تازه بیدار شدم|شام پیتزا|ناهار خوردم|شام سفارش دادم|دارم چایی میخورم|دارم چای|صدای بارون|خوابم میاد|حوصلم سر رفته|حوصله ام سر رفته|دلم گرفته|روز شلوغی بود|روز زندگیم|زیر باد کولر|هوای بیرون|عکسهای قدیمی|یاد قدیما|هوا گرمه|هوا بارونیه|تنهایی نشستم|خوابیده بود|اومدم چت کنم|بحثو عوض کنیم|چت کنم)/i.test(normText);

  const hasHobbyOrActivity =
    /(گیم میزنم|بازی میکنم|بازیگوشی|فیلم میبینم|سریال میبینم|موزیک گوش میدم|آهنگ گوش میدم|شادمهر|هایده|خواننده|گوش میدم.*آرامش|پادکست|کتاب میخونم|بدنسازی|باشگاه|ورزش میکنم|گربه|سگ|حیوون خانگی|حیوون خونگی|قورمه سبزی|ژانر|اینتراستلار|آلمان اقدام میکنم|مدارکم رو ترجمه میکنم|زبان میخونم|گیتار میزنم|پیاده روی|کوه)/i.test(normText);

  const hasSocialBonding =
    /(خوشبختم|خوشحال شدم|چه خبرا|تعریف کن|چیکارا میکنی|چیکار میکنی|روزت چطور بود|حالت چطوره|فکر کردم چت جی پی تی)/i.test(normText);

  const hasPersonalDisclosure =
    /(من معمولا|علاقه دارم|دوست دارم|خوشم میاد|عاشق اینم|من ترجیح میدم|راستش من|من بیشتر)/i.test(normText);

  const hasCasualFollowup =
    /(جدی میگی|واقعا\?|واقعا؟|چه باحال|چه جالب|آره دقیقا|همینطوره|منم همین حس|چه خوب)/i.test(normText);

  const hasSmallTalk =
    hasAslPattern ||
    hasOccupationOrStudy ||
    hasRoutineOrDailyStatus ||
    hasHobbyOrActivity ||
    hasSocialBonding ||
    hasPersonalDisclosure ||
    hasCasualFollowup;

  if (hasSmallTalk) matchedEntities.push('SMALL_TALK');

  // 17. Product Curiosity Concepts (Features, Compatibility, Tech Specs)
  const hasDeviceOrOs = /(^|\s|[،.؛!?؟])(ویندوز|مک|مک‌بوک|آیفون|ios|اندروید|لپتاپ|لپ‌تاپ|کامپیوتر|لینوکس|گوشی|موبایل|تبلت|تلویزیون|روتر|مودم)($|\s|[،.؛!?؟])/i.test(normText);
  const hasIspOrNetwork = /(ایرانسل|همراه اول|رایتل|مخابرات|وای فای|شاتل|زیتل|فیبر نوری|adsl|vds|td-lte)/i.test(normText);
  const hasProtocolOrTech = /(vless|vmess|reality|trojan|shadowsocks|hiddify|nekobox|streisand|v2rayng|پروتکل|v2box)/i.test(normText);
  const hasLocationOrServer = /(سرور.*(آلمان|فنلاند|هلند|ترکیه|فرانسه|سوئد|آمریکا|انگلیس|کانادا|خارج|ترکیه|امارات)|(آلمان|فنلاند|هلند|ترکیه|فرانسه|سوئد|آمریکا|کانادا|خارج).*(سرور|لوکیشن)|لوکیشن|آیپی چه کشوری)/i.test(normText);
  const hasFixedIpOrKillSwitch = /(آیپی ثابت|ایپی ثابت|کیل سوییچ|کیل سویچ|بدون قطعی|تعویض سرور|تعویض کانفیگ|گارانتی|نت ملی|سه ماهه یا شش ماهه|چهار کاربره|تک کاربره|دو کاربره|چند کاربره|چند دستگاه|تفاوت پلن|تفاوت|سقف ترافیک|حجم ماهانه|اختصاصی با|معمولی در چیه|سه ثانیه|زیر ۳ ثانیه|استوری اینستا|ارائه میدین|گیگابایتیه|چه وی پی انی)/i.test(normText);

  // 18. General Question Entity
  const hasGeneralQuestion = ENTITY_PATTERNS.QUESTION_MARKERS.test(normText);
  if (hasGeneralQuestion) matchedEntities.push('QUESTION_MARKER');

  return {
    hasProductEntity: hasProduct,
    hasPriceEntity: hasPrice,
    hasPlanEntity: hasPlan,
    hasSupportEntity: hasSupport,
    hasTrialEntity: hasTrial,
    hasPurchaseEntity: hasPurchase,
    hasRejectionEntity: hasRejection,
    hasObjectionEntity: hasObjection,
    hasNeedEntity: hasNeed,
    hasBotSuspicionEntity: hasBotSuspicion,
    hasGreetingEntity: hasGreeting,
    hasGoodbyeEntity: hasGoodbye,
    hasSmallTalkEntity: hasSmallTalk,
    hasGeneralQuestionEntity: hasGeneralQuestion,
    hasInappropriateEntity: hasInappropriate,
    hasSpamEntity: hasSpam,
    hasCommercialTrapEntity: hasCommercialTrap,
    hasOffTopicPositiveEntity: hasOffTopicPositive,

    planConcepts: {
      hasPlanToken,
      hasDurationToken,
      hasUsageLimitToken,
      hasUserCountToken,
      hasComparisonToken,
    },

    needConcepts: {
      hasPlatformOrNetwork,
      hasFailureOrDegradation,
      hasFrustrationOrImpact,
      hasIpOrTradingRisk,
      hasGamingLatency,
    },

    objectionConcepts: {
      hasPriceResistance,
      hasTrustConcern,
      hasRiskOrFailureConcern,
      hasValueDoubt,
      hasCompetitorComparison,
      hasRefundOrGuaranteeConcern,
      hasUsabilityDoubt,
      hasBadPriorExperience,
    },

    smallTalkConcepts: {
      hasAslPattern,
      hasOccupationOrStudy,
      hasRoutineOrDailyStatus,
      hasHobbyOrActivity,
      hasSocialBonding,
      hasPersonalDisclosure,
      hasCasualFollowup,
    },

    productCuriousConcepts: {
      hasDeviceOrOs,
      hasIspOrNetwork,
      hasProtocolOrTech,
      hasLocationOrServer,
      hasFixedIpOrKillSwitch,
    },

    offTopicConcepts: {
      hasCommodityOrMarket,
      hasMacroEconomy,
      hasAcademicOrExams,
      hasCookingOrFoodRecipe,
      hasSportsScoresOrTeams,
      hasAutomotiveRepair,
    },

    matchedEntities,
  };
}
