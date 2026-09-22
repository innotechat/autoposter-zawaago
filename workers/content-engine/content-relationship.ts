import type { AngleType, ContentFormat, UnifiedContentPlan } from "./types";
import { ANGLE_CONFIGS } from "./topic-engine";

export interface FormatRelationshipRule {
  brand: string;
  date: string;
  postPlan?: UnifiedContentPlan;
  reelPlan?: UnifiedContentPlan;
  storyPlan?: UnifiedContentPlan;
  isCoordinated: boolean;
  relationshipNarrative: string;
}

/**
 * Ensures that morning Post and evening Reel for the same brand complement each other
 * without repeating the exact angle or creative treatment.
 */
export function coordinateSameDayFormats(
  brand: string,
  date: string,
  postPlan: UnifiedContentPlan,
  reelPlan: UnifiedContentPlan
): FormatRelationshipRule {
  const sameTopic = postPlan.topic.toLowerCase().trim() === reelPlan.topic.toLowerCase().trim();
  const sameAngle = postPlan.angle === reelPlan.angle;

  let narrative: string;

  if (sameTopic) {
    if (sameAngle) {
      // Conflict: same topic + same angle on the same day is forbidden
      narrative = `Conflict detected: Post and Reel for ${brand} on ${date} share both topic ('${postPlan.topic}') and angle ('${postPlan.angle}'). Reel angle must be pivoted.`;
    } else {
      narrative = `Theme-Day Synergy: Post covers '${postPlan.topic}' via '${ANGLE_CONFIGS[postPlan.angle].label}', while the evening Reel tackles it via '${ANGLE_CONFIGS[reelPlan.angle].label}'. High synergy with zero narrative duplication.`;
    }
  } else {
    narrative = `Pillar Breadth: Post explores '${postPlan.topic}' (${postPlan.pillar}) while the Reel introduces '${reelPlan.topic}' (${reelPlan.pillar}). Balances audience interest across core brand pillars.`;
  }

  return {
    brand,
    date,
    postPlan,
    reelPlan,
    isCoordinated: !sameAngle,
    relationshipNarrative: narrative
  };
}

/**
 * Suggests an alternative non-conflicting angle for a Reel if a same-day Post already claimed an angle
 */
export function selectComplementaryReelAngle(claimedPostAngle: AngleType): AngleType {
  const complementaryPairs: Record<AngleType, AngleType> = {
    "problem-vs-solution": "deep-dive-mechanism",
    "deep-dive-mechanism": "myth-buster-mistake",
    "myth-buster-mistake": "real-world-workflow",
    "real-world-workflow": "beginner-analogy",
    "future-trend-prediction": "founder-perspective",
    "beginner-analogy": "deep-dive-mechanism",
    "founder-perspective": "cost-time-roi",
    "cost-time-roi": "problem-vs-solution",
    "comparison-versus": "myth-buster-mistake",
    "how-to-practical": "beginner-analogy"
  };

  return complementaryPairs[claimedPostAngle] || "deep-dive-mechanism";
}
