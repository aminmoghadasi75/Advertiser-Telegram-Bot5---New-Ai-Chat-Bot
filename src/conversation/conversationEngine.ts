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
import { validateAndSanitizeResponse, ValidationResult } from './responseValidator';

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
}

/**
 * Initializes a clean ConversationContext for a new anonymous chat session
 */
export function createInitialConversationContext(
  partnerTag?: string,
  partnerProfileSnippet?: string
): ConversationContext {
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
    elapsedSeconds: 0,
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
  messageHistory: AnonymousChatMessage[] = []
): ConversationStepOutput {
  const currentTurn = currentContext.turnCount + 1;
  const historyForIntent = messageHistory.map((m) => ({
    sender: m.sender,
    text: m.text,
  }));

  // Step 1: Detect User Intent
  const intentResult = detectIntent(userMessage, historyForIntent);
  const currentIntent = intentResult.intent;

  // Step 2: Handle Rejections & Objections counts
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

  // Step 3: Calculate Lead Score with Deduplication
  const scoreUpdate = calculateLeadScoreUpdate(
    currentContext.leadScore,
    currentIntent,
    currentContext.scoreFactors,
    currentTurn
  );

  const updatedFactors = scoreUpdate.factor
    ? [...currentContext.scoreFactors, scoreUpdate.factor]
    : currentContext.scoreFactors;

  // Step 4: Evaluate Promotion Policy
  const tempContextForPolicy: ConversationContext = {
    ...currentContext,
    intent: currentIntent,
    leadScore: scoreUpdate.newScore,
    turnCount: currentTurn,
    promotionLock: newPromotionLock,
  };

  const promotionDecision = evaluatePromotionPolicy(
    tempContextForPolicy,
    currentIntent,
    promotionConfig
  );

  // Step 5: Analyze Objection if applicable
  let objectionAnalysis: ObjectionAnalysis | undefined;
  if (currentIntent === Intent.OBJECTION) {
    objectionAnalysis = analyzeObjection(userMessage);
  }

  // Step 6: State Transition Engine
  const stateTransition = transitionConversationState(
    currentContext.state,
    currentIntent,
    {
      ...tempContextForPolicy,
      promotionLevel: promotionDecision.allowedLevel,
    },
    maxTurns
  );

  // Step 7: Build Final Updated Context
  const isDirectCTA =
    promotionDecision.allowedLevel === PromotionLevel.DIRECT_OFFER &&
    (currentIntent === Intent.SUPPORT_REQUEST ||
      currentIntent === Intent.PURCHASE_INTENT ||
      currentIntent === Intent.PRICE_REQUEST ||
      stateTransition.newState === ConversationState.SUPPORT_HANDOFF);

  const updatedContext: ConversationContext = {
    state: stateTransition.newState,
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
    elapsedSeconds: currentContext.elapsedSeconds,
    rejectionsCount,
    objectionsCount,
    lastObjectionCategory: objectionAnalysis?.category,
    partnerTag: currentContext.partnerTag,
    partnerProfileSnippet: currentContext.partnerProfileSnippet,
  };

  // Step 8: Build Prompt Context Directive
  const promptDirective = buildPromptDirective(
    updatedContext,
    intentResult,
    promotionDecision,
    stateTransition,
    objectionAnalysis,
    promotionConfig
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
    isTerminal: stateTransition.isTerminalState,
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
  promotionConfig?: AnonymousProductPromotion
): string {
  const lines: string[] = [];

  lines.push(`=== CONVERSATION ENGINE DIRECTIVE (Turn ${context.turnCount}) ===`);
  lines.push(`• Current State: ${context.state} (from ${context.previousState})`);
  lines.push(`• Detected Intent: ${context.intent} (Confidence: ${Math.round(intentResult.confidence * 100)}%)`);
  lines.push(`• Lead Score: ${context.leadScore}/100 (${context.leadScore >= 56 ? 'HOT' : context.leadScore >= 26 ? 'WARM' : 'COLD'})`);
  lines.push(`• Promotion Policy: ${promotionDecision.allowedLevel} (Locked: ${context.promotionLock ? 'YES' : 'NO'})`);

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
    if (promotionConfig?.contactHandleOrLink) {
      lines.push(`• Support Handle: ${promotionConfig.contactHandleOrLink.replace(/^@/, '')}`);
    }
  }

  if (objectionAnalysis) {
    lines.push(`🛡️ OBJECTION HANDLING (${objectionAnalysis.category}):`);
    lines.push(`• Strategy: ${objectionAnalysis.suggestedStrategy}`);
    objectionAnalysis.recommendedTalkingPoints.forEach((point) => {
      lines.push(`  - ${point}`);
    });
  }

  if (context.state === ConversationState.GOODBYE || context.intent === Intent.GOODBYE) {
    lines.push(`👋 FAREWELL: Respond warmly and wish them well.`);
  }

  lines.push(`========================================================`);

  return lines.join('\n');
}

export { validateAndSanitizeResponse };
