import {
  ConversationState,
  Intent,
  ConversationContext,
  PromotionLevel,
} from '../types';

export interface StateTransitionResult {
  newState: ConversationState;
  previousState: ConversationState;
  transitionReason: string;
  isTerminalState: boolean;
}

/**
 * Deterministic State Machine for Anonymous Conversational Sales
 * Transitions between conversation phases according to strict deterministic rules.
 */
export function transitionConversationState(
  currentState: ConversationState,
  intent: Intent,
  context: ConversationContext,
  maxTurns: number = 4
): StateTransitionResult {
  const previousState = currentState;

  // 1. Safety & Terminal Rules
  if (intent === Intent.INAPPROPRIATE || intent === Intent.SPAM) {
    return {
      newState: ConversationState.EXITING,
      previousState,
      transitionReason: `Terminal event: User triggered ${intent}`,
      isTerminalState: true,
    };
  }

  if (intent === Intent.GOODBYE) {
    return {
      newState: ConversationState.GOODBYE,
      previousState,
      transitionReason: 'User initiated farewell/goodbye',
      isTerminalState: false,
    };
  }

  // 2. Rejection Rule (Sets REJECTED state)
  if (intent === Intent.REJECTION) {
    return {
      newState: ConversationState.REJECTED,
      previousState,
      transitionReason: 'User expressed explicit rejection of promotion/bot',
      isTerminalState: false,
    };
  }

  // 3. Max Turn Exceeded
  if (context.turnCount >= maxTurns && currentState !== ConversationState.SUPPORT_HANDOFF) {
    return {
      newState: ConversationState.GOODBYE,
      previousState,
      transitionReason: `Maximum conversation turns reached (${context.turnCount}/${maxTurns})`,
      isTerminalState: false,
    };
  }

  // 4. Recovery from Rejection / Low Interest
  if (currentState === ConversationState.REJECTED) {
    // If user explicitly asks about product in a later turn, recover!
    if ([Intent.VPN_REQUEST, Intent.PRODUCT_CURIOUS, Intent.TRIAL_REQUEST, Intent.PRICE_REQUEST, Intent.PURCHASE_INTENT].includes(intent)) {
      return {
        newState: ConversationState.PRODUCT_INTEREST,
        previousState,
        transitionReason: 'User re-initiated product interest after rejection. Lock released.',
        isTerminalState: false,
      };
    }
    return {
      newState: ConversationState.LOW_INTEREST,
      previousState,
      transitionReason: 'Continuing casual conversation after user rejection',
      isTerminalState: false,
    };
  }

  if (currentState === ConversationState.LOW_INTEREST) {
    if ([Intent.VPN_REQUEST, Intent.PRODUCT_CURIOUS].includes(intent)) {
      return {
        newState: ConversationState.PRODUCT_INTEREST,
        previousState,
        transitionReason: 'User initiated product interest from low interest state',
        isTerminalState: false,
      };
    }
    return {
      newState: ConversationState.LOW_INTEREST,
      previousState,
      transitionReason: 'Staying in low interest / casual chit-chat',
      isTerminalState: false,
    };
  }

  // 5. Objection Handling Transitions
  if (intent === Intent.OBJECTION) {
    return {
      newState: ConversationState.OBJECTION_HANDLING,
      previousState,
      transitionReason: 'Objection detected regarding price, trust, or complexity',
      isTerminalState: false,
    };
  }

  if (currentState === ConversationState.OBJECTION_HANDLING) {
    if (intent === Intent.PURCHASE_INTENT || intent === Intent.SUPPORT_REQUEST) {
      return {
        newState: ConversationState.SUPPORT_HANDOFF,
        previousState,
        transitionReason: 'Objection resolved; user requested support/purchase',
        isTerminalState: false,
      };
    }
    if (intent === Intent.TRIAL_REQUEST) {
      return {
        newState: ConversationState.TRIAL_DISCUSSION,
        previousState,
        transitionReason: 'Objection addressed with trial request',
        isTerminalState: false,
      };
    }
    if (intent === Intent.PRICE_REQUEST) {
      return {
        newState: ConversationState.PRICE_DISCUSSION,
        previousState,
        transitionReason: 'Objection transitioned to pricing discussion',
        isTerminalState: false,
      };
    }
    return {
      newState: ConversationState.PRODUCT_INTEREST,
      previousState,
      transitionReason: 'Objection acknowledged, returning to product interest',
      isTerminalState: false,
    };
  }

  // 6. Direct Explicit Intent Overrides (Can happen from any conversational phase)
  if (intent === Intent.PURCHASE_INTENT || intent === Intent.SUPPORT_REQUEST) {
    return {
      newState: ConversationState.SUPPORT_HANDOFF,
      previousState,
      transitionReason: 'Direct user purchase intent or support handoff request',
      isTerminalState: false,
    };
  }

  if (intent === Intent.TRIAL_REQUEST) {
    return {
      newState: ConversationState.TRIAL_DISCUSSION,
      previousState,
      transitionReason: 'User explicitly requested free test/trial',
      isTerminalState: false,
    };
  }

  if (intent === Intent.PRICE_REQUEST || intent === Intent.PLAN_REQUEST) {
    return {
      newState: ConversationState.PRICE_DISCUSSION,
      previousState,
      transitionReason: 'User inquired about pricing, tariffs, or plan options',
      isTerminalState: false,
    };
  }

  if (intent === Intent.VPN_REQUEST || intent === Intent.PRODUCT_CURIOUS) {
    return {
      newState: ConversationState.PRODUCT_INTEREST,
      previousState,
      transitionReason: 'User asked about VPN / product capabilities',
      isTerminalState: false,
    };
  }

  if (intent === Intent.RELEVANT_NEED) {
    return {
      newState: ConversationState.NEED_DETECTED,
      previousState,
      transitionReason: 'User shared problem/pain point regarding internet/filtering',
      isTerminalState: false,
    };
  }

  // 7. Natural Progressive Transitions
  switch (currentState) {
    case ConversationState.CONNECTING:
      return {
        newState: ConversationState.INITIAL_GREETING,
        previousState,
        transitionReason: 'Session connected, initial greeting phase',
        isTerminalState: false,
      };

    case ConversationState.INITIAL_GREETING:
      return {
        newState: ConversationState.EARLY_CONVERSATION,
        previousState,
        transitionReason: 'User replied to initial greeting, moving to early chit-chat',
        isTerminalState: false,
      };

    case ConversationState.EARLY_CONVERSATION:
      if (context.turnCount >= 2 || intent === Intent.SMALL_TALK || intent === Intent.QUESTION) {
        return {
          newState: ConversationState.ENGAGED,
          previousState,
          transitionReason: 'User actively engaged in conversation exchange',
          isTerminalState: false,
        };
      }
      return {
        newState: ConversationState.EARLY_CONVERSATION,
        previousState,
        transitionReason: 'Continuing early conversation',
        isTerminalState: false,
      };

    case ConversationState.ENGAGED:
      if (context.promotionLevel === PromotionLevel.SOFT_MENTION || context.leadScore >= 30) {
        return {
          newState: ConversationState.QUALIFYING,
          previousState,
          transitionReason: 'User engaged and qualified for subtle bridge',
          isTerminalState: false,
        };
      }
      return {
        newState: ConversationState.ENGAGED,
        previousState,
        transitionReason: 'Maintaining engaged casual rapport',
        isTerminalState: false,
      };

    case ConversationState.NEED_DETECTED:
      return {
        newState: ConversationState.QUALIFYING,
        previousState,
        transitionReason: 'Need acknowledged, qualifying user situation',
        isTerminalState: false,
      };

    case ConversationState.QUALIFYING:
      if (context.promotionLevel === PromotionLevel.DIRECT_OFFER || context.leadScore >= 40) {
        return {
          newState: ConversationState.PRODUCT_INTRODUCTION,
          previousState,
          transitionReason: 'Qualification complete, introducing product solution',
          isTerminalState: false,
        };
      }
      return {
        newState: ConversationState.QUALIFYING,
        previousState,
        transitionReason: 'Continuing qualification dialogue',
        isTerminalState: false,
      };

    case ConversationState.PRODUCT_INTRODUCTION:
      return {
        newState: ConversationState.PRODUCT_INTEREST,
        previousState,
        transitionReason: 'Product introduced, moving to interest dialogue',
        isTerminalState: false,
      };

    case ConversationState.PRODUCT_INTEREST:
      return {
        newState: ConversationState.PRODUCT_INTEREST,
        previousState,
        transitionReason: 'Continuing product interest discussion',
        isTerminalState: false,
      };

    case ConversationState.TRIAL_DISCUSSION:
    case ConversationState.PRICE_DISCUSSION:
      return {
        newState: currentState,
        previousState,
        transitionReason: 'Continuing commercial evaluation',
        isTerminalState: false,
      };

    case ConversationState.SUPPORT_HANDOFF:
      return {
        newState: ConversationState.GOODBYE,
        previousState,
        transitionReason: 'Support handoff provided, preparing graceful exit',
        isTerminalState: false,
      };

    case ConversationState.GOODBYE:
      return {
        newState: ConversationState.EXITING,
        previousState,
        transitionReason: 'Goodbye finished, exiting chat session',
        isTerminalState: true,
      };

    case ConversationState.EXITING:
      return {
        newState: ConversationState.EXITING,
        previousState,
        transitionReason: 'Already in exiting state',
        isTerminalState: true,
      };

    default:
      return {
        newState: ConversationState.EARLY_CONVERSATION,
        previousState,
        transitionReason: 'Default fallback transition',
        isTerminalState: false,
      };
  }
}
