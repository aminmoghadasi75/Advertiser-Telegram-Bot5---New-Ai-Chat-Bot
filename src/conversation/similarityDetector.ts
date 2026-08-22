/**
 * Semantic & String Similarity Detector for Bot Message Outputs
 * Prevents repetitive, looped, or duplicate messages during conversation turns.
 */

import { normalizePersianText } from './normalizer';

export interface SimilarityCheckResult {
  isDuplicate: boolean;
  maxSimilarity: number;
  matchedMessage?: string;
  matchedIndex?: number;
  reason?: string;
}

/**
 * Calculates token-based Jaccard similarity between two Persian strings.
 */
export function calculateJaccardSimilarity(textA: string, textB: string): number {
  const normA = normalizePersianText(textA);
  const normB = normalizePersianText(textB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const tokensA = new Set(normA.split(/\s+/).filter((t) => t.length > 1));
  const tokensB = new Set(normB.split(/\s+/).filter((t) => t.length > 1));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);

  return intersection.size / union.size;
}

/**
 * Calculates character-level Levenshtein distance similarity (0.0 to 1.0).
 */
export function calculateLevenshteinSimilarity(textA: string, textB: string): number {
  const normA = normalizePersianText(textA);
  const normB = normalizePersianText(textB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const lenA = normA.length;
  const lenB = normB.length;
  const maxLen = Math.max(lenA, lenB);
  if (maxLen === 0) return 1.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= lenB; i++) matrix[i] = [i];
  for (let j = 0; j <= lenA; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenB; i++) {
    for (let j = 1; j <= lenA; j++) {
      if (normB.charAt(i - 1) === normA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const distance = matrix[lenB][lenA];
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Combined hybrid similarity metric (Token Jaccard 50% + Levenshtein 50%).
 */
export function calculateCompositeSimilarity(textA: string, textB: string): number {
  const normA = normalizePersianText(textA);
  const normB = normalizePersianText(textB);

  if (normA === normB && normA.length > 0) return 1.0;

  const jaccard = calculateJaccardSimilarity(textA, textB);
  const levenshtein = calculateLevenshteinSimilarity(textA, textB);

  // If high word overlap or high character match
  return Math.max(jaccard, levenshtein, jaccard * 0.5 + levenshtein * 0.5);
}

/**
 * Checks whether candidate text is too similar to any recent bot message.
 * @param candidate Candidate bot message text
 * @param recentBotMessages Array of recently sent bot messages in current session
 * @param threshold Similarity threshold (default: 0.70)
 */
export function checkResponseSimilarity(
  candidate: string,
  recentBotMessages: string[] = [],
  threshold: number = 0.70
): SimilarityCheckResult {
  const normCandidate = normalizePersianText(candidate);
  if (!normCandidate || recentBotMessages.length === 0) {
    return { isDuplicate: false, maxSimilarity: 0 };
  }

  let maxSim = 0;
  let matchedMsg: string | undefined;
  let matchedIdx: number | undefined;
  let reason: string | undefined;

  for (let i = recentBotMessages.length - 1; i >= 0; i--) {
    const prevMsg = recentBotMessages[i];
    const normPrev = normalizePersianText(prevMsg);

    // 1. Exact normalized match
    if (normCandidate === normPrev && normCandidate.length > 0) {
      return {
        isDuplicate: true,
        maxSimilarity: 1.0,
        matchedMessage: prevMsg,
        matchedIndex: i,
        reason: 'Exact duplicate of previously sent bot message',
      };
    }

    // 2. Composite similarity score
    const sim = calculateCompositeSimilarity(candidate, prevMsg);
    if (sim > maxSim) {
      maxSim = sim;
      matchedMsg = prevMsg;
      matchedIdx = i;
    }

    if (sim >= threshold) {
      reason = `High similarity (${(sim * 100).toFixed(1)}% >= ${(threshold * 100).toFixed(0)}%) with message at index ${i}`;
      return {
        isDuplicate: true,
        maxSimilarity: sim,
        matchedMessage: prevMsg,
        matchedIndex: i,
        reason,
      };
    }
  }

  return {
    isDuplicate: maxSim >= threshold,
    maxSimilarity: Number(maxSim.toFixed(3)),
    matchedMessage: matchedMsg,
    matchedIndex: matchedIdx,
    reason: maxSim >= threshold ? reason : undefined,
  };
}
