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
  reason: string;
}

/**
 * Deterministic Promotion Policy Engine
 * Enforces business rules, time gates, promotion locks, and explicit intent overrides.
 */
export function evaluatePromotionPolicy(
  context: ConversationContext,
  currentIntent: Intent,
  promotionConfig?: AnonymousProductPromotion
): PromotionDecision {
  // If product promotion is completely disabled in settings
  if (!promotionConfig || !promotionConfig.enabled) {
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: 'Product promotion feature is disabled in configuration',
    };
  }

  // 1. Check if user is actively rejecting
  if (currentIntent === Intent.REJECTION || currentIntent === Intent.INAPPROPRIATE || currentIntent === Intent.SPAM) {
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: true,
      isExplicitOverride: false,
      reason: 'User expressed explicit rejection or spam/inappropriate intent. Promotion locked.',
    };
  }

  // 2. Check if Promotion Lock is active
  // If locked, only an explicit product-related user intent can unlock it!
  const isExplicitProductIntent = [
    Intent.VPN_REQUEST,
    Intent.TRIAL_REQUEST,
    Intent.PRICE_REQUEST,
    Intent.PLAN_REQUEST,
    Intent.SUPPORT_REQUEST,
    Intent.PURCHASE_INTENT,
    Intent.PRODUCT_CURIOUS,
  ].includes(currentIntent);

  if (context.promotionLock && !isExplicitProductIntent) {
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: true,
      isExplicitOverride: false,
      reason: 'Promotion lock active from prior rejection. Chit-chat only.',
    };
  }

  // 3. EXPLICIT USER INTENT OVERRIDE RULE:
  // "Explicit User Intent > Time-based constraint"
  // If user explicitly asks for VPN / trial / price / plans / purchase, bypass time delays and lock!
  if (isExplicitProductIntent) {
    const isPhotoAllowed =
      context.elapsedSeconds >= (promotionConfig.minPhotoDelaySeconds ?? MIN_NATURAL_PHOTO_DELAY_SECONDS) ||
      currentIntent === Intent.PURCHASE_INTENT ||
      currentIntent === Intent.SUPPORT_REQUEST;

    return {
      allowedLevel: PromotionLevel.DIRECT_OFFER,
      canSendDirectOffer: true,
      canSendSoftMention: true,
      canSendBannerPhoto: Boolean(promotionConfig.imageUrl && isPhotoAllowed),
      isPromotionLocked: false,
      isExplicitOverride: true,
      reason: `Explicit user intent detected (${currentIntent}). Time-based delay bypassed per override policy.`,
    };
  }

  // 4. Check CTA Cooldown Gap
  const turnsSinceLastCTA = context.turnCount - context.lastCTATurn;
  const isCtaInCooldown = context.lastCTATurn > 0 && turnsSinceLastCTA < MIN_CTA_TURN_GAP;

  // 5. Relevant Need (Problem with filtering/internet detected naturally)
  if (currentIntent === Intent.RELEVANT_NEED) {
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: 'User shared internet/filtering pain point. Soft conversational bridge permitted.',
    };
  }

  // 6. Natural Time & Lead Score Evaluation (Unsolicited Promotion)
  const minDelaySec = promotionConfig.minPhotoDelaySeconds ?? MIN_NATURAL_PHOTO_DELAY_SECONDS;
  const hasMetTimeRequirement = context.elapsedSeconds >= minDelaySec;
  const hasMetTurnRequirement = context.turnCount >= 2;

  // If before 2 minutes and early in chat -> Strictly NO PROMOTION
  if (!hasMetTimeRequirement && !hasMetTurnRequirement) {
    return {
      allowedLevel: PromotionLevel.NO_PROMOTION,
      canSendDirectOffer: false,
      canSendSoftMention: false,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: `Conversation in early discovery (< ${minDelaySec}s and < 2 turns). Building natural rapport.`,
    };
  }

  // If CTA cooldown is active, restrict to soft mention only
  if (isCtaInCooldown) {
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: `CTA cooldown active (${turnsSinceLastCTA}/${MIN_CTA_TURN_GAP} turns since last CTA).`,
    };
  }

  // Lead Score gating for unsolicited offers:
  // Score >= 50 and time elapsed -> DIRECT_OFFER
  // Score >= 25 -> SOFT_MENTION
  // Score < 25 -> NO_PROMOTION
  if (context.leadScore >= 50 && hasMetTimeRequirement) {
    return {
      allowedLevel: PromotionLevel.DIRECT_OFFER,
      canSendDirectOffer: true,
      canSendSoftMention: true,
      canSendBannerPhoto: Boolean(promotionConfig.imageUrl),
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: `Lead score is high (${context.leadScore}) and time threshold met (${context.elapsedSeconds}s).`,
    };
  }

  if (context.leadScore >= 25) {
    return {
      allowedLevel: PromotionLevel.SOFT_MENTION,
      canSendDirectOffer: false,
      canSendSoftMention: true,
      canSendBannerPhoto: false,
      isPromotionLocked: false,
      isExplicitOverride: false,
      reason: `Lead score is warm (${context.leadScore}). Soft introduction permitted.`,
    };
  }

  return {
    allowedLevel: PromotionLevel.NO_PROMOTION,
    canSendDirectOffer: false,
    canSendSoftMention: false,
    canSendBannerPhoto: false,
    isPromotionLocked: false,
    isExplicitOverride: false,
    reason: `Lead score (${context.leadScore}) is cold. Maintaining casual rapport.`,
  };
}
