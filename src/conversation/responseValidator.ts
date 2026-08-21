import {
  ConversationState,
  Intent,
  PromotionLevel,
  ConversationContext,
  AnonymousProductPromotion,
} from '../types';

export interface ValidationResult {
  isValid: boolean;
  sanitizedText: string;
  violations: string[];
  wasFallbackUsed: boolean;
}

/**
 * Validates and sanitizes AI-generated responses according to state, policy, and safety constraints.
 */
export function validateAndSanitizeResponse(
  rawAiReply: string,
  context: ConversationContext,
  promotionConfig?: AnonymousProductPromotion
): ValidationResult {
  const violations: string[] = [];
  let text = (rawAiReply || '').trim();

  // 1. Strip unwanted prefixes (e.g. "من:", "پاسخ:", "Melody:", "بات:")
  text = text.replace(/^(من|بات|ملودی|پاسخ|جواب|AI|Assistant|Melody)\s*[:：\-–]\s*/i, '');
  text = text.replace(/^["'«»](.*)["'«»]$/s, '$1').trim();

  // 2. Promotion Lock Violation Check
  if (context.promotionLock) {
    const promotionalKeywordsRegex = /(فیلترشکن|وی\s*پی\s*ان|vpn|کانفیگ|سرور|خرید|تعرفه|تومان|تست رایگان|پشتیبانی|آیدی|@\w+)/i;
    if (promotionalKeywordsRegex.test(text)) {
      violations.push('Promotion Lock active: AI attempted to mention promotional keywords after rejection');
      text = getSafeFallbackText(context.state, context.intent);
      return {
        isValid: false,
        sanitizedText: text,
        violations,
        wasFallbackUsed: true,
      };
    }
  }

  // 3. Under 2-minute constraint (unless explicit override)
  const isExplicitOverride = [
    Intent.VPN_REQUEST,
    Intent.TRIAL_REQUEST,
    Intent.PRICE_REQUEST,
    Intent.PLAN_REQUEST,
    Intent.SUPPORT_REQUEST,
    Intent.PURCHASE_INTENT,
  ].includes(context.intent);

  if (context.elapsedSeconds < 120 && !isExplicitOverride && context.promotionLevel === PromotionLevel.NO_PROMOTION) {
    // Check for explicit phone numbers or direct payment links
    if (/(09\d{9}|\+98\d{10}|شماره کارت|واریز کنید)/i.test(text)) {
      violations.push('Time constraint (<120s): Response contained direct payment/phone solicitation without user request');
      text = getSafeFallbackText(context.state, context.intent);
      return {
        isValid: false,
        sanitizedText: text,
        violations,
        wasFallbackUsed: true,
      };
    }
  }

  // 4. Handle Formatting
  if (promotionConfig?.contactHandleOrLink) {
    const rawHandle = promotionConfig.contactHandleOrLink.trim();
    const cleanHandle = rawHandle.replace(/^@/, '');
    // If handle is present, normalize it
    if (text.includes(`@${cleanHandle}`)) {
      text = text.replace(new RegExp(`@${cleanHandle}`, 'g'), cleanHandle);
    }
  }

  // 5. Empty or too short check
  if (text.length < 2) {
    violations.push('Response was empty or too short');
    text = getSafeFallbackText(context.state, context.intent);
    return {
      isValid: false,
      sanitizedText: text,
      violations,
      wasFallbackUsed: true,
    };
  }

  return {
    isValid: violations.length === 0,
    sanitizedText: text,
    violations,
    wasFallbackUsed: false,
  };
}

/**
 * Returns deterministic fallback text for various conversation states and intents
 */
export function getSafeFallbackText(state: ConversationState, intent: Intent): string {
  if (intent === Intent.GOODBYE || state === ConversationState.GOODBYE) {
    return 'مرسی عزیزم، منم کار دارم باید برم. مراقب خودت باش 🌸';
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
    return 'می‌تونی به پشتیبانی پیام بدی تا برات فعالش کنن و راهنماییت کنن 🌸';
  }

  if (intent === Intent.RELEVANT_NEED || state === ConversationState.NEED_DETECTED) {
    return 'وای آره واقعاً اوضاع نت این روزا خیلی اذیت میکنه، اینستای منم تا دیروز باز نمیشد 🌸';
  }

  return 'منم خوبم مرسی عزیزم، تو چیکارا میکنی؟ 🌸';
}
