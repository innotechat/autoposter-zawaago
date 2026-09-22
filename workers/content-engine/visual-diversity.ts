import type { VisualFamily } from "./types";
import { getBrandProfile } from "./brand-brain";

export interface PastVisualRecord {
  visualFamily: VisualFamily;
  createdAt?: string;
  publishedAt?: string;
}

/**
 * Calculates a diversity penalty/boost map based on trailing visual history
 */
export function computeVisualFamilyWeights(
  brandName: string,
  history: PastVisualRecord[],
  lookbackCount = 10
): Record<VisualFamily, number> {
  const profile = getBrandProfile(brandName);
  const preferred = new Set(profile.visualIdentity.preferredFamilies);
  const restricted = new Set(profile.visualIdentity.restrictedFamilies);

  // Baseline weights
  const weights: Record<VisualFamily, number> = {
    "editorial-photo": 1.0,
    "cinematic": 1.0,
    "premium-business-photo": 1.0,
    "premium-illustration": 0.9,
    "3d": 0.9,
    "3d-isometric": 1.0,
    "stylized-3d-character": 0.8,
    "cartoon-character": 0.3,
    "futuristic-concept": 0.9,
    "minimal-corporate": 0.9,
    "bold-abstract": 0.4,
    "infographic-concept": 0.8,
    "human-centric": 1.0,
    "Indian-business": 1.0,
    "technology-concept": 1.0,
    "cinematic-storytelling": 1.0
  };

  // Adjust for brand preferences
  for (const key of Object.keys(weights) as VisualFamily[]) {
    if (restricted.has(key)) {
      weights[key] = 0.05; // Heavily de-prioritize or ban
    } else if (preferred.has(key)) {
      weights[key] *= 1.8;
    }
  }

  // Count recent usage
  const recent = history.slice(0, lookbackCount);
  const usageCounts: Partial<Record<VisualFamily, number>> = {};
  for (const item of recent) {
    usageCounts[item.visualFamily] = (usageCounts[item.visualFamily] || 0) + 1;
  }

  // Heavily penalize immediate back-to-back repetitions
  const immediateLast = recent[0]?.visualFamily;
  if (immediateLast) {
    weights[immediateLast] *= 0.15; // Strongly avoid the exact same visual family two days in a row
  }

  // Apply frequency dampening: more past uses = lower current weight
  for (const [family, count] of Object.entries(usageCounts)) {
    const fam = family as VisualFamily;
    if (weights[fam]) {
      weights[fam] *= Math.pow(0.55, count);
    }
  }

  return weights;
}

/**
 * Selects a visual family using weighted random sampling based on diversity scores
 */
export function selectDiverseVisualFamily(
  brandName: string,
  history: PastVisualRecord[],
  overrideFamily?: VisualFamily
): VisualFamily {
  if (overrideFamily) return overrideFamily;

  const weights = computeVisualFamilyWeights(brandName, history);
  const entries = Object.entries(weights) as [VisualFamily, number][];

  // Calculate cumulative sum
  let totalWeight = 0;
  for (const [, w] of entries) {
    totalWeight += Math.max(0.01, w);
  }

  const randomPoint = Math.random() * totalWeight;
  let cumulative = 0;

  for (const [family, w] of entries) {
    cumulative += Math.max(0.01, w);
    if (randomPoint <= cumulative) {
      return family;
    }
  }

  return entries[0][0];
}

/**
 * Evaluates the overall visual diversity score of a series of content plans (0.0 - 1.0)
 */
export function calculateDiversityIndex(families: VisualFamily[]): number {
  if (families.length <= 1) return 1.0;
  const counts: Record<string, number> = {};
  for (const f of families) counts[f] = (counts[f] || 0) + 1;

  const unique = Object.keys(counts).length;
  const maxRepetition = Math.max(...Object.values(counts));

  // High score if multiple unique families and low repetition concentration
  const uniqueRatio = unique / Math.min(families.length, 6);
  const repetitionPenalty = (maxRepetition - 1) / families.length;

  return Math.max(0.2, Math.min(1.0, uniqueRatio * (1 - repetitionPenalty * 0.5)));
}
