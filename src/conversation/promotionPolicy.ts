import {
  ConversationState,
  Intent,
  PromotionLevel,
  ConversationContext,
  AnonymousProductPromotion,
} from '../types';

export const MIN_CTA_TURN_GAP = 2; // Minimum turns between consecutive direct CTAs
export const MIN_NATURAL_PHOTO_DELAY_SECONDS = 120; // 2 minutes rule for unprompted banners

export interface PromotionDecision {
  allowedLevel: PromotionLevel;
  canSendDirectOffer: boolean;
  canSendSoftMention: boolean;
  canSendBannerPhoto: boolean;
  isPromotionLocked: boolean;
  isExplicitOverride: boolean;
  isSuppressed?: boolean;
  reasonCodes?: string[];
  reason: string;
}

/**
 * Deterministic Promotion Policy Engine
 * Enforces business rules, safety locks, time gates, promotion locks, and explicit intent overrides.
 */
export function evaluatePromotionPolicy(
  context: ConversationContext,
  currentIntent: Intent,
  promotionConfig?: AnonymousProductPromotion
): PromotionDecision {
  const reasonCodes: string[] = [];

  // If product promotion is completely disabled in settings
  if (!promotionConfig || !promotionConfig.enabled) {
    reasonCodes.push('PROMOTION_DISABLED_IN_CONFIG');
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: 'Product promotion feature is disabled in configuration',
    };
  }

  // 1. Hard Safety Suppression (INAPPROPRIATE, SPAM)
  if (currentIntent === Intent.INAPPROPRIATE || currentIntent === Intent.SPAM) {
    reasonCodes.push('SAFETY_HARD_SUPPRESSION', `TRIGGER_${currentIntent}`);
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: true,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: `User triggered safety violation (${currentIntent}). Hard promotion lock engaged.`,
    };
  }

  // 2. Explicit Rejection
  if (currentIntent === Intent.REJECTION) {
    reasonCodes.push('EXPLICIT_USER_REJECTION', 'PROMOTION_LOCK_ACTIVATED');
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: true,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: 'User expressed explicit rejection. Promotion lock activated.',
    };
  }

  // 3. Terminal Conversation Constraints (GOODBYE, EXITING)
  if (
    currentIntent === Intent.GOODBYE ||
    context.state === ConversationState.GOODBYE ||
    context.state === ConversationState.EXITING
  ) {
    reasonCodes.push('TERMINAL_STATE_SUPPRESSION');
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: context.promotionLock,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: 'Conversation is in goodbye / terminal closing phase. Promotions suppressed.',
    };
  }

  // 4. Check if Promotion Lock is active
  const isExplicitProductIntent = [
    Intent.VPN_REQUEST,
    Intent.TRIAL_REQUEST,
    Intent.PRICE_REQUEST,
    Intent.PLAN_REQUEST,
    Intent.SUPPORT_REQUEST,
    Intent.PURCHASE_INTENT,
  ].includes(currentIntent);

  if (context.promotionLock && !isExplicitProductIntent) {
    reasonCodes.push('PROMOTION_LOCK_ACTIVE', 'NON_COMMERCIAL_INTENT');
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: true,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: 'Promotion lock active from prior rejection. Chit-chat only.',
    };
  }

  // 5. EXPLICIT USER INTENT OVERRIDE RULE
  if (isExplicitProductIntent) {
    const minPhotoDelay = promotionConfig.minPhotoDelaySeconds ?? MIN_NATURAL_PHOTO_DELAY_SECONDS;
    const isPhotoAllowed = context.elapsedSeconds >= minPhotoDelay;

    const turnsSinceLastCTA = context.turnCount - context.lastCTATurn;
    const isCtaInCooldown = context.lastCTATurn > 0 && turnsSinceLastCTA < MIN_CTA_TURN_GAP;

    // To eliminate unnecessary Duplicate CTAs:
    // If we are in CTA Cooldown (sent CTA very recently), we only allow DIRECT_OFFER
    // if the user explicitly asks for PRICE, TRIAL, PURCHASE, or SUPPORT.
    // For VPN_REQUEST or PLAN_REQUEST, a SOFT_MENTION is sufficient if we JUST showed the banner.
    const criticalIntents = [
      Intent.PRICE_REQUEST,
      Intent.TRIAL_REQUEST,
      Intent.PURCHASE_INTENT,
      Intent.SUPPORT_REQUEST,
    ];

    if (isCtaInCooldown && !criticalIntents.includes(currentIntent)) {
      reasonCodes.push('EXPLICIT_INTENT_DOWNGRADED_DUE_TO_COOLDOWN');
      return {
        allowedLevel: PromotionLevel.SOFT_MENTION,
        canSendDirectOffer: false,
        canSendSoftMention: true,
        canSendBannerPhoto: false,
        isPromotionLocked: false,
        isExplicitOverride: true,
        isSuppressed: false,
        reasonCodes,
        reason: `Explicit user intent detected (${currentIntent}) but CTA is in cooldown. Downgrading to soft mention.`,
      };
    }

    reasonCodes.push('EXPLICIT_PRODUCT_INTENT_OVERRIDE', `ACTIONABLE_${currentIntent}`);

    return {
      allowedLevel: PromotionLevel.DIRECT_OFFER,
      canSendDirectOffer: true,
      canSendSoftMention: true,
      canSendBannerPhoto: Boolean(promotionConfig.imageUrl && isPhotoAllowed),
      isPromotionLocked: false,
      isExplicitOverride: true,
      isSuppressed: false,
      reasonCodes,
      reason: `Explicit user intent detected (${currentIntent}). Product knowledge active. Photo allowed only if >= 120s (${isPhotoAllowed ? 'YES' : 'NO'}).`,
    };
  }

  // 6. Objection Handling (Empathetic Value Proposition / Test Offer)
  if (currentIntent === Intent.OBJECTION || context.state === ConversationState.OBJECTION_HANDLING) {
    reasonCodes.push('OBJECTION_RESOLUTION_MODE', 'SOFT_MENTION_PERMITTED');
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: 'User raised objection. Soft conversational value proposition permitted.',
    };
  }

  // 7. Relevant Need (Problem with filtering/internet detected naturally)
  if (currentIntent === Intent.RELEVANT_NEED || context.state === ConversationState.NEED_DETECTED) {
    reasonCodes.push('RELEVANT_NEED_DETECTED', 'SOFT_MENTION_PERMITTED');
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: 'User shared internet/filtering pain point. Soft conversational bridge permitted.',
    };
  }

  // 8. Check CTA Cooldown Gap
  const turnsSinceLastCTA = context.turnCount - context.lastCTATurn;
  const isCtaInCooldown = context.lastCTATurn > 0 && turnsSinceLastCTA < MIN_CTA_TURN_GAP;

  // 9. Natural Time & Lead Score Evaluation (Unsolicited Promotion)
  const minDelaySec = promotionConfig.minPhotoDelaySeconds ?? MIN_NATURAL_PHOTO_DELAY_SECONDS;
  const hasMetTimeRequirement = context.elapsedSeconds >= minDelaySec;
  const hasMetTurnRequirement = context.turnCount >= 2;

  // If before 2 minutes and early in chat -> Strictly NO PROMOTION
  if (!hasMetTimeRequirement && !hasMetTurnRequirement) {
    reasonCodes.push('EARLY_CONVERSATION_DISCOVERY', 'RAPPORT_BUILDING');
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: `Conversation in early discovery (< ${minDelaySec}s and < 2 turns). Building natural rapport.`,
    };
  }

  // If CTA cooldown is active, restrict to soft mention or no promotion
  if (isCtaInCooldown) {
    reasonCodes.push('CTA_COOLDOWN_ACTIVE');
    return {
      allowedLevel: context.leadScore >= 20 ? PromotionLevel.SOFT_MENTION : PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: context.leadScore >= 20,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: true,
      reasonCodes,
      reason: `CTA cooldown active (${turnsSinceLastCTA}/${MIN_CTA_TURN_GAP} turns since last CTA).`,
    };
  }

  // Natural Funnel Progression:
  // After initial greeting/rapport (turnCount >= 2 or botMessageCount >= 2), if product hasn't been mentioned yet,
  // allow honest, soft introduction of VPN subscription
  if ((context.turnCount >= 2 || (context.botMessageCount || 0) >= 2) && !context.productMentioned && !context.promotionLock) {
    reasonCodes.push('HONEST_MARKETER_INTRO_PHASE');
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: 'Initial rapport established. Permitting honest, casual introduction of VPN subscription.',
    };
  }

  // Lead Score gating for unsolicited offers:
  if (context.leadScore >= 50 && hasMetTimeRequirement) {
    reasonCodes.push('HIGH_LEAD_SCORE_TIME_MET');
    return {
      allowedLevel: PromotionLevel.DIRECT_OFFER,
      canSendDirectOffer: true,
      canSendSoftMention: true,
      canSendBannerPhoto: Boolean(promotionConfig.imageUrl),
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: `Lead score is high (${context.leadScore}) and time threshold met (${context.elapsedSeconds}s).`,
    };
  }

  if (context.leadScore >= 20 || context.turnCount >= 2) {
    reasonCodes.push('WARM_LEAD_SCORE');
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      isSuppressed: false,
      reasonCodes,
      reason: `Lead score is warm (${context.leadScore}). Soft introduction permitted.`,
    };
  }

  reasonCodes.push('COLD_LEAD_SCORE');
  return {
    allowedLevel: PromotionLevel.NO_PROMOTION,
    canSendDirectOffer: false,
    canSendSoftMention: false,
    canSendBannerPhoto: false,
    isPromotionLocked: false,
    isExplicitOverride: false,
    isSuppressed: false,
    reasonCodes,
    reason: `Lead score (${context.leadScore}) is cold. Maintaining casual rapport.`,
  };
}
