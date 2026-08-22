import {
  ConversationState,
  Intent,
  PromotionLevel,
  ObjectionCategory,
  ConversationContext,
  AnonymousProductPromotion,
  AnonymousChatMessage,
} from '../types';
import { detectIntent, IntentDetectionResult } from './intentEngine';
import { calculateLeadScoreUpdate, ScoreUpdateResult } from './leadScoring';
import { evaluatePromotionPolicy, PromotionDecision } from './promotionPolicy';
import { analyzeObjection, ObjectionAnalysis } from './objectionEngine';
import { transitionConversationState, StateTransitionResult } from './stateMachine';
import { validateAndSanitizeResponse, ValidationResult, MAX_BOT_MESSAGES_LIMIT } from './responseValidator';
import { DEFAULT_PRODUCT_CONFIG, ProductConfig, formatProductPromptContext } from '../config/productConfig';

export interface ConversationStepOutput {
  updatedContext: ConversationContext;
  intentResult: IntentDetectionResult;
  scoreUpdate: ScoreUpdateResult;
  promotionDecision: PromotionDecision;
  stateTransition: StateTransitionResult;
  objectionAnalysis?: ObjectionAnalysis;
  promptDirective: string;
  shouldSendPhotoBanner: boolean;
  isTerminal: boolean;
  messageLimitReached: boolean;
}

/**
 * Initializes a clean ConversationContext for a new anonymous chat session
 */
export function createInitialConversationContext(
  partnerTag?: string,
  partnerProfileSnippet?: string,
  startedAt?: string
): ConversationContext {
  const nowIso = startedAt || new Date().toISOString();
  return {
    state: ConversationState.INITIAL_GREETING,
    previousState: ConversationState.CONNECTING,
    intent: Intent.UNKNOWN,
    detectedIntentsHistory: [],
    leadScore: 0,
    scoreFactors: [],
    scoredIntentCategories: [],
    promotionLock: false,
    promotionLevel: PromotionLevel.NO_PROMOTION,
    productMentioned: false,
    lastPromotionTurn: 0,
    lastCTATurn: 0,
    turnCount: 0,
    botMessageCount: 0,
    userMessageCount: 0,
    maxBotMessages: MAX_BOT_MESSAGES_LIMIT,
    conversationStartedAt: nowIso,
    elapsedSeconds: 0,
    supportIdAvailable: false,
    offerCount: 0,
    recentBotMessages: [],
    recentStrangerMessages: [],
    rejectionsCount: 0,
    objectionsCount: 0,
    partnerTag,
    partnerProfileSnippet,
  };
}

/**
 * Core Orchestration Pipeline for Conversation Turn
 * Deterministically processes the user message through all decision engines.
 */
export function processConversationTurn(
  userMessage: string,
  currentContext: ConversationContext,
  promotionConfig?: AnonymousProductPromotion,
  maxTurns: number = 4,
  messageHistory: AnonymousChatMessage[] = [],
  productConfig: ProductConfig = DEFAULT_PRODUCT_CONFIG
): ConversationStepOutput {
  const currentTurn = currentContext.turnCount + 1;
  const historyForIntent = messageHistory.map((m) => ({
    sender: m.sender,
    text: m.text,
  }));

  // Step 1: Detect User Intent
  const intentResult = detectIntent(userMessage, historyForIntent);
  const currentIntent = intentResult.intent;

  // Step 2: Handle Timing and Duration (A2)
  const startedAtEpoch = currentContext.conversationStartedAt
    ? new Date(currentContext.conversationStartedAt).getTime()
    : Date.now();
  const calculatedDurationSec = Math.max(
    currentContext.elapsedSeconds || 0,
    Math.floor((Date.now() - startedAtEpoch) / 1000)
  );
  const supportIdAvailable = calculatedDurationSec >= 120;

  // Step 3: Handle Rejections & Objections counts
  let newPromotionLock = currentContext.promotionLock;
  let rejectionsCount = currentContext.rejectionsCount;
  let objectionsCount = currentContext.objectionsCount;

  if (currentIntent === Intent.REJECTION) {
    newPromotionLock = true;
    rejectionsCount += 1;
  } else if (intentResult.isExplicitProductIntent && newPromotionLock) {
    // Release lock if user explicitly initiates product inquiry
    newPromotionLock = false;
  }

  if (currentIntent === Intent.OBJECTION) {
    objectionsCount += 1;
  }

  // Step 4: Calculate Lead Score with Deduplication
  const scoreUpdate = calculateLeadScoreUpdate(
    currentContext.leadScore,
    currentIntent,
    currentContext.scoreFactors,
    currentTurn
  );

  const updatedFactors = scoreUpdate.factor
    ? [...currentContext.scoreFactors, scoreUpdate.factor]
    : currentContext.scoreFactors;

  // Step 5: Evaluate Promotion Policy
  const tempContextForPolicy: ConversationContext = {
    ...currentContext,
    intent: currentIntent,
    leadScore: scoreUpdate.newScore,
    turnCount: currentTurn,
    elapsedSeconds: calculatedDurationSec,
    supportIdAvailable,
    promotionLock: newPromotionLock,
  };

  const promotionDecision = evaluatePromotionPolicy(
    tempContextForPolicy,
    currentIntent,
    promotionConfig
  );

  // Step 6: Analyze Objection if applicable
  let objectionAnalysis: ObjectionAnalysis | undefined;
  if (currentIntent === Intent.OBJECTION) {
    objectionAnalysis = analyzeObjection(userMessage);
  }

  // Step 7: State Transition Engine
  const stateTransition = transitionConversationState(
    currentContext.state,
    currentIntent,
    {
      ...tempContextForPolicy,
      promotionLevel: promotionDecision.allowedLevel,
    },
    maxTurns
  );

  // Step 8: Build Final Updated Context
  const isDirectCTA =
    promotionDecision.allowedLevel === PromotionLevel.DIRECT_OFFER &&
    (currentIntent === Intent.SUPPORT_REQUEST ||
      currentIntent === Intent.PURCHASE_INTENT ||
      currentIntent === Intent.PRICE_REQUEST ||
      stateTransition.newState === ConversationState.SUPPORT_HANDOFF);

  const maxLimit = currentContext.maxBotMessages || MAX_BOT_MESSAGES_LIMIT;
  const messageLimitReached = (currentContext.botMessageCount || 0) >= maxLimit;

  let finalState = stateTransition.newState;
  if (messageLimitReached) {
    finalState = ConversationState.EXITING;
  }

  const updatedRecentStranger = [...(currentContext.recentStrangerMessages || []), userMessage].slice(-10);

  const updatedContext: ConversationContext = {
    state: finalState,
    previousState: currentContext.state,
    intent: currentIntent,
    detectedIntentsHistory: [...currentContext.detectedIntentsHistory, currentIntent],
    leadScore: scoreUpdate.newScore,
    scoreFactors: updatedFactors,
    scoredIntentCategories: updatedFactors.map((f) => f.intent),
    promotionLock: promotionDecision.isPromotionLocked || newPromotionLock,
    promotionLevel: promotionDecision.allowedLevel,
    productMentioned: currentContext.productMentioned || promotionDecision.allowedLevel !== PromotionLevel.NO_PROMOTION,
    lastPromotionTurn:
      promotionDecision.allowedLevel !== PromotionLevel.NO_PROMOTION
        ? currentTurn
        : currentContext.lastPromotionTurn,
    lastCTATurn: isDirectCTA ? currentTurn : currentContext.lastCTATurn,
    turnCount: currentTurn,
    botMessageCount: currentContext.botMessageCount || 0,
    userMessageCount: (currentContext.userMessageCount || 0) + 1,
    maxBotMessages: maxLimit,
    conversationStartedAt: currentContext.conversationStartedAt || new Date().toISOString(),
    elapsedSeconds: calculatedDurationSec,
    supportIdAvailable,
    offerCount: promotionDecision.allowedLevel === PromotionLevel.DIRECT_OFFER
      ? (currentContext.offerCount || 0) + 1
      : (currentContext.offerCount || 0),
    recentBotMessages: currentContext.recentBotMessages || [],
    recentStrangerMessages: updatedRecentStranger,
    rejectionsCount,
    objectionsCount,
    lastObjectionCategory: objectionAnalysis?.category,
    partnerTag: currentContext.partnerTag,
    partnerProfileSnippet: currentContext.partnerProfileSnippet,
  };

  // Step 9: Build Prompt Context Directive
  const promptDirective = buildPromptDirective(
    updatedContext,
    intentResult,
    promotionDecision,
    stateTransition,
    objectionAnalysis,
    promotionConfig,
    productConfig
  );

  return {
    updatedContext,
    intentResult,
    scoreUpdate,
    promotionDecision,
    stateTransition,
    objectionAnalysis,
    promptDirective,
    shouldSendPhotoBanner: promotionDecision.canSendBannerPhoto,
    isTerminal: stateTransition.isTerminalState || messageLimitReached,
    messageLimitReached,
  };
}

/**
 * Builds the exact deterministic instructions for Gemini
 */
export function buildPromptDirective(
  context: ConversationContext,
  intentResult: IntentDetectionResult,
  promotionDecision: PromotionDecision,
  stateTransition: StateTransitionResult,
  objectionAnalysis?: ObjectionAnalysis,
  promotionConfig?: AnonymousProductPromotion,
  productConfig: ProductConfig = DEFAULT_PRODUCT_CONFIG
): string {
  const lines: string[] = [];

  lines.push(`=== CONVERSATION ENGINE DIRECTIVE (Turn ${context.turnCount}) ===`);
  lines.push(`• Current State: ${context.state} (from ${context.previousState})`);
  lines.push(`• Detected Intent: ${context.intent} (Confidence: ${Math.round(intentResult.confidence * 100)}%)`);
  lines.push(`• Lead Score: ${context.leadScore}/100 (${context.leadScore >= 56 ? 'HOT' : context.leadScore >= 26 ? 'WARM' : 'COLD'})`);
  lines.push(`• Promotion Policy: ${promotionDecision.allowedLevel} (Locked: ${context.promotionLock ? 'YES' : 'NO'})`);
  lines.push(`• Bot Message Count: ${context.botMessageCount}/${context.maxBotMessages || 18}`);
  lines.push(`• Conversation Duration: ${context.elapsedSeconds}s (Support ID Access: ${context.supportIdAvailable ? 'ALLOWED' : 'GATED (<120s)'})`);

  if (promotionDecision.isExplicitOverride) {
    lines.push(`⚡ EXPLICIT OVERRIDE ACTIVE: User asked for product/VPN directly. Answer immediately without stalling.`);
  }

  if (context.promotionLock) {
    lines.push(`⛔ PROMOTION LOCKED: The user previously rejected. DO NOT mention VPN, sales, or channels. Speak purely as a friendly human.`);
  } else if (promotionDecision.allowedLevel === PromotionLevel.NO_PROMOTION) {
    lines.push(`💬 MODE: CASUAL RAPPORT ONLY. Do not sell or pitch yet.`);
  } else if (promotionDecision.allowedLevel === PromotionLevel.SOFT_MENTION) {
    lines.push(`🌱 MODE: SOFT BRIDGE. You may casually mention that you use a fast private config/VPN without sounding like a salesperson.`);
  } else if (promotionDecision.allowedLevel === PromotionLevel.DIRECT_OFFER) {
    lines.push(`🎯 MODE: DIRECT OFFER. Answer questions with product details, pricing, test config offer, and support link.`);
    if (context.supportIdAvailable) {
      const handle = (productConfig.support.handle || promotionConfig?.contactHandleOrLink || 'nova_vpn10').replace(/^@/, '');
      lines.push(`• Support Handle: ${handle} (strictly without @)`);
    } else {
      lines.push(`• Support Handle: [LOCKED: conversation duration < 120s - DO NOT provide handle yet]`);
    }
  }

  if (objectionAnalysis) {
    lines.push(`🛡️ OBJECTION HANDLING (${objectionAnalysis.category}):`);
    lines.push(`• Strategy: ${objectionAnalysis.suggestedStrategy}`);
    objectionAnalysis.recommendedTalkingPoints.forEach((point) => {
      lines.push(`  - ${point}`);
    });
  }

  // A5: Exit behavior based on user context
  if (context.state === ConversationState.GOODBYE || context.intent === Intent.GOODBYE) {
    lines.push(`👋 FAREWELL: The user is leaving. Give a short, natural, warm goodbye. Do NOT force an advertisement on exit unless they explicitly asked.`);
  }

  lines.push(`========================================================`);

  return lines.join('\n');
}

export { validateAndSanitizeResponse };
