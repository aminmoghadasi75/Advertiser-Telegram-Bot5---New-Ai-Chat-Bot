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

export const MAX_BOT_MESSAGES_LIMIT = 25;
export const MAX_COMMERCIAL_LEAD_MESSAGES_LIMIT = 35;

/**
 * Repairs broken, truncated, or incomplete Persian sentence endings
 * e.g., "چیکار می" -> "چیکار می‌کنی؟", dangling conjunctions/prepositions stripped
 */
export function repairIncompleteSentences(text: string): string {
  if (!text) return '';
  let fixed = text.trim();

  // Repair specific common truncated verb phrases
  if (/(?:چیکار|داری|داری چیکار|چیکارا)\s+می$/i.test(fixed)) {
    fixed = fixed.replace(/\s+می$/i, ' می‌کنی؟');
  } else if (/(?:کجا|داری)\s+می$/i.test(fixed)) {
    fixed = fixed.replace(/\s+می$/i, ' می‌ری؟');
  } else if (/(?:چی|چی شد|که)\s+می$/i.test(fixed)) {
    fixed = fixed.replace(/\s+می$/i, ' می‌شه؟');
  } else if (/\bمی$/i.test(fixed)) {
    fixed = fixed.replace(/\s*می$/i, ' کنی؟');
  } else if (/\bنمی$/i.test(fixed)) {
    fixed = fixed.replace(/\s*نمی$/i, ' خوای؟');
  }

  // Remove dangling conjunctions or prepositions left at the very end
  fixed = fixed.replace(/\s+(که|چون|اگر|برای|تا|به|با|از|رو|در|اما|ولی|یا|و)\s*$/i, '').trim();

  // Remove dangling commas or trailing colons
  fixed = fixed.replace(/[,،:;\-–—]+$/, '').trim();

  return fixed;
}

/**
 * Cleans prompt leakage, code artifacts, markdown remnants, stray slashes, quotes, brackets,
 * and strips unnatural punctuation (periods at end of chat bubbles, multiple exclamation marks, formal quotes, colons).
 * Normalizes textual age representations (e.g., "بیست و شش" -> "۲۶") into human-like digits.
 */
export function cleanCodeArtifactsAndPunctuation(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  // 1. Remove markdown code blocks and inline code formatting
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

  // 2. Remove comments and syntax artifacts (e.g. /* ... */, // ..., / "). * ", etc.)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  cleaned = cleaned.replace(/(?:\/{2,}|\/\*+|\*+\/|[\\\/]\s*["')\]]+\s*(?:\.\s*\*?\s*")?).*/g, '');
  cleaned = cleaned.replace(/[\/\\*#_~`^<>{}[\]|•]+/g, ' ');

  // 3. Remove stray quote and paren artifacts in middle of text
  cleaned = cleaned.replace(/["'«»“”\(\)]\s*[\.\*\/\\\-]+\s*["'«»“”\(\)]/g, ' ');
  cleaned = cleaned.replace(/["'«»“”]/g, '');

  // 4. Remove leading/trailing symbols, quotes, brackets, slashes, colons
  cleaned = cleaned.replace(/^["'«»“”(.)\/\\:;؛،,\s\-–—]+/, '');
  cleaned = cleaned.replace(/["'«»“”(.)\/\\:;؛،,\s\-–—]+$/, '');

  // 5. Clean unnatural punctuation for Telegram chat:
  // - Remove multiple exclamation marks
  cleaned = cleaned.replace(/!+/g, '');
  // - Clean redundant question marks (leave at most one ؟)
  cleaned = cleaned.replace(/([؟?]){2,}/g, '$1');
  // - Clean redundant commas, semicolons, and colons
  cleaned = cleaned.replace(/[,،;؛:：]+/g, ' ');
  // - Remove trailing dots or dots at the end of sentences
  cleaned = cleaned.replace(/\.+$/g, '');
  cleaned = cleaned.replace(/\.+/g, ' ');

  // 6. Normalize age: Convert written Persian words for age 26 (e.g. "بیست و شش") to natural digits "۲۶"
  cleaned = cleaned
    .replace(/بیست\s+و\s+شش/g, '۲۶')
    .replace(/بیست\s+و\s+شیش/g, '۲۶')
    .replace(/بیست\s+و\s+6/g, '۲۶')
    .replace(/20\s+ساله/g, '۲۶ ساله')
    .replace(/۲۰\s+ساله/g, '۲۶ ساله')
    .replace(/بیست\s+ساله/g, '۲۶ ساله')
    .replace(/بیست\s+سالمه/g, '۲۶ سالمه');

  // 7. Clean multi-spaces and redundant whitespace
  cleaned = cleaned.replace(/[ \t]+/g, ' ').trim();

  // 8. Repair truncated verbs/prefixes
  cleaned = repairIncompleteSentences(cleaned);

  // 9. Final trim of trailing punctuation
  cleaned = cleaned.replace(/[\.\:،,!;؛\-–—]+$/g, '').trim();

  return cleaned;
}

/**
 * Splits text into natural, ultra-short Telegram chat bubbles.
 * Rule: NO single bubble may exceed 7 words. If a sentence is longer,
 * it is broken down into small, conversational chunks (3-7 words each).
 * All unnecessary punctuation (trailing periods, colons, quotes) is stripped.
 */
export function splitIntoNaturalBubbles(text: string, maxChunks: number = 6): string[] {
  if (!text) return [];
  const clean = cleanCodeArtifactsAndPunctuation(text).trim();
  if (!clean) return [];

  // 1. Initial split by explicit line breaks or question mark delimiters
  const initialParts = clean
    .split(/\n+|(?<=[!؟?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawBubbles: string[] = [];

  for (const part of initialParts) {
    const words = part.split(/\s+/).filter(Boolean);
    if (words.length <= 7) {
      rawBubbles.push(part);
      continue;
    }

    // Split long sentence into sub-chunks of at most 7 words
    let currentWords: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      currentWords.push(w);

      const remaining = words.length - (i + 1);
      // Check if we should break:
      // a) We hit 7 words
      // b) Or we have 4-6 words and next word is a natural conjunction/connector (و, که, چون, ولی, اما, بعد, راستی, آخه)
      //    and the remaining words are at least 2 words
      const nextWord = words[i + 1] || '';
      const isNaturalBreakWord = /^(و|که|چون|ولی|اما|بعد|راستی|آخه|تا|اگه|اگر|چرا|واسه|شما)$/i.test(nextWord);
      const shouldBreakOnConjunction = currentWords.length >= 4 && isNaturalBreakWord && remaining >= 2;
      const shouldBreakOnMaxWords = currentWords.length >= 7;

      if ((shouldBreakOnMaxWords || shouldBreakOnConjunction) && remaining > 0) {
        rawBubbles.push(currentWords.join(' '));
        currentWords = [];
      }
    }
    if (currentWords.length > 0) {
      rawBubbles.push(currentWords.join(' '));
    }
  }

  // 2. Clean, repair and format each bubble
  const finalBubbles: string[] = [];
  for (let b of rawBubbles) {
    let cleanedB = repairIncompleteSentences(b);
    cleanedB = cleanedB.replace(/[\.\:،,!;؛\-–—]+$/g, '').trim();
    if (cleanedB.length >= 2) {
      finalBubbles.push(cleanedB);
    }
  }

  const effectiveMax = Math.max(1, Math.min(maxChunks, 8));
  return finalBubbles.length > 0 ? finalBubbles.slice(0, effectiveMax) : [clean];
}

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

  // 2. Clean code artifacts, slashes, asterisks, brackets, hallucinated prompt remnants
  text = cleanCodeArtifactsAndPunctuation(text);

  // 3. Empty or Meaningful Persian Text Check
  const persianCharCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const isMeaningful = persianCharCount >= 2 && text.length >= 2;
  ruleResults.push({
    ruleName: 'meaningful_persian_text',
    passed: isMeaningful,
    message: isMeaningful ? undefined : 'Response was empty, too short, or contained non-meaningful symbols/gibberish',
  });
  if (!isMeaningful) {
    violations.push('Response lacked meaningful Persian text or contained code artifacts');
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

  // 4. Message Counter Constraint Check (Dynamic 18-25 messages, up to 35 for interested leads)
  const isCommercialActive = [
    ConversationState.PRODUCT_INTRODUCTION,
    ConversationState.PRODUCT_INTEREST,
    ConversationState.PRICE_DISCUSSION,
    ConversationState.TRIAL_DISCUSSION,
    ConversationState.SUPPORT_HANDOFF,
    ConversationState.OBJECTION_HANDLING,
    ConversationState.NEED_DETECTED,
  ].includes(context.state);

  const effectiveMaxLimit = (isCommercialActive || context.leadScore >= 35)
    ? (context.maxBotMessages ? Math.max(context.maxBotMessages, MAX_COMMERCIAL_LEAD_MESSAGES_LIMIT) : MAX_COMMERCIAL_LEAD_MESSAGES_LIMIT)
    : (context.maxBotMessages || MAX_BOT_MESSAGES_LIMIT);

  const isWithinMessageLimit = (context.botMessageCount || 0) < effectiveMaxLimit;
  ruleResults.push({
    ruleName: 'message_count',
    passed: isWithinMessageLimit,
    message: isWithinMessageLimit ? undefined : `Bot message count (${context.botMessageCount}) reached limit (${effectiveMaxLimit})`,
  });
  if (!isWithinMessageLimit) {
    violations.push(`Max bot message limit (${effectiveMaxLimit}) reached. Bot should cease producing new turns.`);
  }

  // 5. Similarity / Duplicate Response Check against recent bot messages (A7) & Anti-Repetition
  const recentMessages = context.recentBotMessages || [];
  const lastUserMsg = (context.recentStrangerMessages || []).slice(-1)[0] || '';
  const similarityInfo = checkResponseSimilarity(text, recentMessages, 0.72, lastUserMsg);
  ruleResults.push({
    ruleName: 'duplicate_response',
    passed: !similarityInfo.isDuplicate,
    message: similarityInfo.isDuplicate ? similarityInfo.reason : undefined,
  });

  if (similarityInfo.isDuplicate) {
    violations.push(`Duplicate/Repetitive response detected (${similarityInfo.reason})`);
    requiresRegeneration = true;
    text = similarityInfo.suggestedCorrection || getAlternativeVariedFallback(context.state, context.intent, recentMessages, context.supportIdAvailable, lastUserMsg);
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
    return 'مرسی عزیزم منم کار برام پیش اومد باید برم مراقب خودت باش 🌸';
  }

  if (intent === Intent.REJECTION || state === ConversationState.REJECTED || state === ConversationState.LOW_INTEREST) {
    return 'کاملاً درکت می‌کنم مشکلی نیست روزت چطور گذشت 🌸';
  }

  if (intent === Intent.VPN_REQUEST || state === ConversationState.PRODUCT_INTEREST) {
    return 'آره من خودم یه سرور اختصاصی خیلی پرسرعت بدون قطعی استفاده می‌کنم 🌸';
  }

  if (intent === Intent.PRICE_REQUEST || state === ConversationState.PRICE_DISCUSSION) {
    return 'تعرفه‌هاش خیلی مناسبه پلن‌های ماهانه پرسرعت داره تست هم می‌تونی بگیری 🌸';
  }

  if (intent === Intent.TRIAL_REQUEST || state === ConversationState.TRIAL_DISCUSSION) {
    return 'آره حتماً اکانت تست رایگان داره اول چک کن بعد تصمیم بگیر 🌸';
  }

  if (intent === Intent.SUPPORT_REQUEST || intent === Intent.PURCHASE_INTENT || state === ConversationState.SUPPORT_HANDOFF) {
    if (supportIdAvailable) {
      return 'می‌تونی به پشتیبانی nova_vpn10 پیام بدی برات فعال کنن 🌸';
    }
    return 'می‌تونی به پشتیبانی پیام بدی برات فعال کنن 🌸';
  }

  if (intent === Intent.RELEVANT_NEED || state === ConversationState.NEED_DETECTED) {
    return 'وای آره واقعاً اوضاع نت این روزا خیلی اذیت می‌کنه 🌸';
  }

  return 'منم خوبم مرسی عزیزم بیشتر فیلم می‌بینم و آهنگ گوش می‌دم 🌸';
}

/**
 * Returns varied fallback to prevent repeating the exact same fallback response
 */
export function getAlternativeVariedFallback(
  state: ConversationState,
  intent: Intent,
  recentMessages: string[] = [],
  supportIdAvailable: boolean = false,
  lastUserMsg?: string
): string {
  const candidatesByIntent: Record<string, string[]> = {
    [Intent.GREETING]: [
      'سلام عزیزم روزت بخیر باشه 🌸',
      'سلام چطوری اوضاع چطوره 🌸',
      'درود بر شما روز خوبی داشته باشی 🌸',
    ],
    [Intent.SMALL_TALK]: [
      'سرگرم کارامم پای لپ‌تاپم 🌸',
      'بیشتر فیلم می‌بینم آهنگ گوش می‌دم 🌸',
      'مشغول وبگردی و گشتن تو اینستام 🌸',
      'خداروشکر همه چی خوبه و آرومه 🌸',
    ],
    [Intent.GOODBYE]: [
      'فعلاً عزیزم مراقب خودت باش 🌸',
      'خوشحال شدم روز خوبی داشته باشی 🌸',
      'خداحافظ عزیزم به امید دیدار 🌸',
    ],
    [Intent.REJECTION]: [
      'باشه حله بگذریم روزت چطور گذشت 🌸',
      'کاملاً اوکیه از خودت چه خبرا 🌸',
    ],
    [Intent.PRICE_REQUEST]: [
      'پلن‌های ماهانه‌ش خیلی مناسبه و نامحدود هم داره 🌸',
      'قیمتاش خیلی اقتصادیه با گارانتی کامل 🌸',
    ],
  };

  const pool = candidatesByIntent[intent] || [
    'منم خوبم مرسی بیشتر فیلم می‌بینم و آهنگ گوش می‌دم 🌸',
    'سرگرم کارامم پای لپ‌تاپم 🌸',
    'مشغول کارهای روزمره‌ام هستم 🌸',
  ];

  for (const candidate of pool) {
    const sim = checkResponseSimilarity(candidate, recentMessages, 0.70, lastUserMsg);
    if (!sim.isDuplicate) {
      return candidate;
    }
  }

  return getSafeFallbackText(state, intent, supportIdAvailable);
}
