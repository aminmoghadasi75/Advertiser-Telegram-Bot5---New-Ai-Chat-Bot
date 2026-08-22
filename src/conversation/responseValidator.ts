import {
  ConversationState,
  Intent,
  PromotionLevel,
  ConversationContext,
  AnonymousProductPromotion,
} from '../types';
import { checkResponseSimilarity, SimilarityCheckResult } from './similarityDetector';
import { DEFAULT_PRODUCT_CONFIG, ProductConfig } from '../config/productConfig';

export interface ValidationRuleResult {
  ruleName: string;
  passed: boolean;
  message?: string;
}

export interface ValidationResult {
  isValid: boolean;
  sanitizedText: string;
  violations: string[];
  ruleResults: ValidationRuleResult[];
  requiresRegeneration: boolean;
  wasFallbackUsed: boolean;
  similarityInfo?: SimilarityCheckResult;
}

export const MAX_BOT_MESSAGES_LIMIT = 18;

/**
 * Validates and sanitizes AI-generated responses according to state, policy, similarity, and safety constraints.
 */
export function validateAndSanitizeResponse(
  rawAiReply: string,
  context: ConversationContext,
  promotionConfig?: AnonymousProductPromotion,
  productConfig: ProductConfig = DEFAULT_PRODUCT_CONFIG
): ValidationResult {
  const violations: string[] = [];
  const ruleResults: ValidationRuleResult[] = [];
  let requiresRegeneration = false;
  let text = (rawAiReply || '').trim();

  // 1. Strip unwanted prefixes (e.g. "من:", "پاسخ:", "Melody:", "بات:")
  text = text.replace(/^(من|بات|ملودی|پاسخ|جواب|AI|Assistant|Melody)\s*[:：\-–]\s*/i, '');
  text = text.replace(/^["'«»](.*)["'«»]$/s, '$1').trim();

  // 2. Empty or Too Short Check
  const notEmpty = text.length >= 2;
  ruleResults.push({
    ruleName: 'empty_response',
    passed: notEmpty,
    message: notEmpty ? undefined : 'Response was empty or shorter than 2 characters',
  });
  if (!notEmpty) {
    violations.push('Response was empty or too short');
    requiresRegeneration = true;
    text = getSafeFallbackText(context.state, context.intent, context.supportIdAvailable);
    return {
      isValid: false,
      sanitizedText: text,
      violations,
      ruleResults,
      requiresRegeneration,
      wasFallbackUsed: true,
    };
  }

  // 3. Message Length Check (Max 600 characters for Telegram single turn bubble)
  const validLength = text.length <= 600;
  ruleResults.push({
    ruleName: 'message_length',
    passed: validLength,
    message: validLength ? undefined : `Message length (${text.length}) exceeded 600 character ceiling`,
  });
  if (!validLength) {
    violations.push('Message length exceeded limit');
    text = text.slice(0, 500).trim() + '...';
  }

  // 4. Message Counter Constraint Check (MAX_BOT_MESSAGES = 18)
  const maxLimit = context.maxBotMessages || MAX_BOT_MESSAGES_LIMIT;
  const isWithinMessageLimit = (context.botMessageCount || 0) < maxLimit;
  ruleResults.push({
    ruleName: 'message_count',
    passed: isWithinMessageLimit,
    message: isWithinMessageLimit ? undefined : `Bot message count (${context.botMessageCount}) reached limit (${maxLimit})`,
  });
  if (!isWithinMessageLimit) {
    violations.push(`Max bot message limit (${maxLimit}) reached. Bot should cease producing new turns.`);
  }

  // 5. Similarity / Duplicate Response Check against recent bot messages (A7)
  const recentMessages = context.recentBotMessages || [];
  const similarityInfo = checkResponseSimilarity(text, recentMessages, 0.72);
  ruleResults.push({
    ruleName: 'duplicate_response',
    passed: !similarityInfo.isDuplicate,
    message: similarityInfo.isDuplicate ? similarityInfo.reason : undefined,
  });

  if (similarityInfo.isDuplicate) {
    violations.push(`Duplicate response detected (${similarityInfo.reason})`);
    requiresRegeneration = true;
    text = getAlternativeVariedFallback(context.state, context.intent, recentMessages, context.supportIdAvailable);
    return {
      isValid: false,
      sanitizedText: text,
      violations,
      ruleResults,
      requiresRegeneration,
      wasFallbackUsed: true,
      similarityInfo,
    };
  }

  // 6. Support ID Access Gating Check (A3 & A2: Duration >= 120s)
  const effectiveSupportHandle = (productConfig.support.handle || promotionConfig?.contactHandleOrLink || 'nova_vpn10')
    .replace(/^@/, '')
    .trim();
  const supportIdRegex = new RegExp(`(@?${effectiveSupportHandle}|@FastVpnSupport|@nova_vpn10|آیدی\\s*پشتیبانی|به\\s*آیدی|پیام\\s*بده\\s*به)`, 'i');

  const isSupportIdExposed = supportIdRegex.test(text);
  const isSupportAllowed = context.supportIdAvailable || context.elapsedSeconds >= 120;

  if (isSupportIdExposed && !isSupportAllowed) {
    ruleResults.push({
      ruleName: 'support_id_access',
      passed: false,
      message: `Support ID exposed when conversation duration (${context.elapsedSeconds}s) < 120s`,
    });
    violations.push('Support ID gated: Conversation duration is under 120 seconds. Support handle must not be exposed.');
    requiresRegeneration = true;
    // Sanitize by removing the handle or using safe pre-120s response
    text = text.replace(new RegExp(`@?${effectiveSupportHandle}`, 'gi'), '').trim();
    text = text.replace(/@FastVpnSupport/gi, '').trim();
    text = text.replace(/@nova_vpn10/gi, '').trim();
    if (text.length < 5) {
      text = getSafeFallbackText(context.state, context.intent, false);
      return {
        isValid: false,
        sanitizedText: text,
        violations,
        ruleResults,
        requiresRegeneration,
        wasFallbackUsed: true,
      };
    }
  } else {
    ruleResults.push({
      ruleName: 'support_id_access',
      passed: true,
    });
  }

  // 7. Promotion Lock Violation Check
  if (context.promotionLock) {
    const promotionalKeywordsRegex = /(فیلترشکن|وی\s*پی\s*ان|vpn|کانفیگ|سرور|خرید|تعرفه|تومان|تست رایگان|پشتیبانی|آیدی|@\w+)/i;
    if (promotionalKeywordsRegex.test(text)) {
      ruleResults.push({
        ruleName: 'promotion_lock',
        passed: false,
        message: 'AI attempted promotional pitch while Promotion Lock is active',
      });
      violations.push('Promotion Lock active: AI attempted to mention promotional keywords after rejection');
      text = getSafeFallbackText(context.state, context.intent, context.supportIdAvailable);
      return {
        isValid: false,
        sanitizedText: text,
        violations,
        ruleResults,
        requiresRegeneration: true,
        wasFallbackUsed: true,
      };
    }
  }

  // 8. Repeated CTA / Promotion Frequency Check
  if (context.promotionLevel === PromotionLevel.DIRECT_OFFER && context.lastCTATurn && context.turnCount - context.lastCTATurn < 2) {
    const ctaRegex = /(پیام بده|خرید کن|ثبت سفارش|آیدی پشتیبانی)/i;
    if (ctaRegex.test(text) && context.intent !== Intent.PURCHASE_INTENT && context.intent !== Intent.SUPPORT_REQUEST) {
      ruleResults.push({
        ruleName: 'repeated_CTA',
        passed: false,
        message: 'Repeated CTA without intervening turns',
      });
      violations.push('Repeated CTA within short turn window');
    }
  }

  // 9. Format Support Handle (ensure NO @ character)
  if (effectiveSupportHandle) {
    if (text.includes(`@${effectiveSupportHandle}`)) {
      text = text.replace(new RegExp(`@${effectiveSupportHandle}`, 'g'), effectiveSupportHandle);
    }
  }

  return {
    isValid: violations.length === 0,
    sanitizedText: text,
    violations,
    ruleResults,
    requiresRegeneration,
    wasFallbackUsed: false,
    similarityInfo,
  };
}

/**
 * Returns deterministic fallback text for various conversation states and intents
 */
export function getSafeFallbackText(
  state: ConversationState,
  intent: Intent,
  supportIdAvailable: boolean = false
): string {
  // Exit / Goodbye: strictly natural, no unsolicited ad (A5)
  if (intent === Intent.GOODBYE || state === ConversationState.GOODBYE) {
    return 'مرسی عزیزم، منم کار برام پیش اومد باید برم. مراقب خودت باش 🌸';
  }

  if (intent === Intent.REJECTION || state === ConversationState.REJECTED || state === ConversationState.LOW_INTEREST) {
    return 'کاملاً درکت میکنم عزیزم، مشکلی نیست! چیکارا میکنی دیگه؟ 🌸';
  }

  if (intent === Intent.VPN_REQUEST || state === ConversationState.PRODUCT_INTEREST) {
    return 'آره من خودم یه سرور اختصاصی خیلی پرسرعت و بدون قطعی استفاده می‌کنم که روی تمام نتها جوابه 🌸';
  }

  if (intent === Intent.PRICE_REQUEST || state === ConversationState.PRICE_DISCUSSION) {
    return 'تعرفه‌هاش خیلی مناسبه، پلن‌های ماهانه نامحدود و پرسرعت داره که تست هم می‌تونی بگیری 🌸';
  }

  if (intent === Intent.TRIAL_REQUEST || state === ConversationState.TRIAL_DISCUSSION) {
    return 'آره حتماً، اکانت تست رایگان داره که اول کیفیتش رو چک کنی بعد تصمیم بگیری 🌸';
  }

  if (intent === Intent.SUPPORT_REQUEST || intent === Intent.PURCHASE_INTENT || state === ConversationState.SUPPORT_HANDOFF) {
    if (supportIdAvailable) {
      return 'می‌تونی به پشتیبانی nova_vpn10 پیام بدی تا برات فعالش کنن و راهنماییت کنن 🌸';
    }
    return 'می‌تونی به پشتیبانی پیام بدی تا برات فعالش کنن و راهنماییت کنن 🌸';
  }

  if (intent === Intent.RELEVANT_NEED || state === ConversationState.NEED_DETECTED) {
    return 'وای آره واقعاً اوضاع نت این روزا خیلی اذیت میکنه، اینستای منم تا دیروز باز نمیشد 🌸';
  }

  return 'منم خوبم مرسی عزیزم، تو چیکارا میکنی؟ 🌸';
}

/**
 * Returns varied fallback to prevent repeating the exact same fallback response
 */
export function getAlternativeVariedFallback(
  state: ConversationState,
  intent: Intent,
  recentMessages: string[] = [],
  supportIdAvailable: boolean = false
): string {
  const candidatesByIntent: Record<string, string[]> = {
    [Intent.GREETING]: [
      'سلام عزیزم، روزت بخیر باشه 🌸',
      'سلام چطوری؟ اوضاع چطوره؟ 🌸',
      'درود بر شما، خوبی؟ چه خبرا؟ 🌸',
    ],
    [Intent.SMALL_TALK]: [
      'منم سرگرم کارام بودم پای گوشی، شما چیکار می‌کنی؟ 🌸',
      'خداروشکر همه چی خوبه، چه خبرا؟ 🌸',
      'مشغول وبگردی بودم، روزت چطور گذشت؟ 🌸',
    ],
    [Intent.GOODBYE]: [
      'فعلاً عزیزم، مراقب خودت باش 🌸',
      'خوشحال شدم از هم‌صحبتیت، روز خوبی داشته باشی 🌸',
      'خداحافظ عزیزم، به امید دیدار 🌸',
    ],
    [Intent.REJECTION]: [
      'باشه عزیزم حله! بگذریم، چه خبر دیگه؟ 🌸',
      'کاملاً اوکیه! راستی از خودت بگو چیکارا میکنی 🌸',
    ],
    [Intent.PRICE_REQUEST]: [
      'پلن‌های ماهانه‌ش از هشتاد و پنج هزار تومن شروع میشه و نامحدود هم داره 🌸',
      'قیمتاش خیلی اقتصادیه، ماهیانه نامحدود داره با گارانتی کامل 🌸',
    ],
  };

  const pool = candidatesByIntent[intent] || [
    'منم خوبم مرسی، روزت چطور میگذره؟ 🌸',
    'همه چی خوبه خداروشکر، تو چیکارا می‌کنی؟ 🌸',
    'آره واقعاً، از کار و بارت چه خبر؟ 🌸',
  ];

  for (const candidate of pool) {
    const sim = checkResponseSimilarity(candidate, recentMessages, 0.70);
    if (!sim.isDuplicate) {
      return candidate;
    }
  }

  return getSafeFallbackText(state, intent, supportIdAvailable);
}
