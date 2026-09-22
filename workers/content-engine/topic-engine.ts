import type { AngleType, BrandProfile, ContentObjective, ContentPillar, TopicAngle, TopicEntity } from "./types";
import { getBrandProfile } from "./brand-brain";

export const ANGLE_CONFIGS: Record<
  AngleType,
  { label: string; description: string; defaultObjective: ContentObjective; hookTemplate: (topic: string) => string }
> = {
  "problem-vs-solution": {
    label: "Problem vs. Solution",
    description: "Framing an acute industry friction point, showing why old approaches fail, and presenting the modern solution.",
    defaultObjective: "problem-solution",
    hookTemplate: (topic) => `Most teams struggle with ${topic.toLowerCase()}. Here is the exact fix that actually works.`
  },
  "deep-dive-mechanism": {
    label: "Under-the-Hood Mechanism",
    description: "Deconstructing the core architecture, data flow, or engineering loop step-by-step.",
    defaultObjective: "education",
    hookTemplate: (topic) => `What actually happens under the hood with ${topic.toLowerCase()}? Let's break down the mechanics.`
  },
  "myth-buster-mistake": {
    label: "Myth Buster & Costly Mistakes",
    description: "Calling out conventional misconceptions and showing the hidden traps everyone falls into.",
    defaultObjective: "thought-leadership",
    hookTemplate: (topic) => `Stop doing this with ${topic.toLowerCase()}. Here is the hidden mistake costing you hours.`
  },
  "real-world-workflow": {
    label: "Real-World Workflow Blueprint",
    description: "Actionable, end-to-end breakdown of how this is implemented in day-to-day operations.",
    defaultObjective: "practical-productivity",
    hookTemplate: (topic) => `A real-world blueprint for ${topic.toLowerCase()} you can deploy this week.`
  },
  "future-trend-prediction": {
    label: "Future Trend & Strategic Outlook",
    description: "High-level strategic forecasting of how this capability evolves over the next 12-24 months.",
    defaultObjective: "industry-perspective",
    hookTemplate: (topic) => `Where is ${topic.toLowerCase()} heading in the next 18 months? 3 shifts you need to prepare for.`
  },
  "beginner-analogy": {
    label: "Intuitive Mental Model & Analogy",
    description: "Translating a complex technical concept into an unforgettable everyday analogy.",
    defaultObjective: "education",
    hookTemplate: (topic) => `Think of ${topic.toLowerCase()} like this everyday system. Suddenly, it all clicks.`
  },
  "founder-perspective": {
    label: "Founder & Executive Perspective",
    description: "High-leverage decision framework focused on resource allocation, trade-offs, and speed.",
    defaultObjective: "founder-insight",
    hookTemplate: (topic) => `How top founders think about ${topic.toLowerCase()}: The 3 decisions that matter.`
  },
  "cost-time-roi": {
    label: "Hard ROI & Time Economics",
    description: "Measuring the hard financial payback, time saved, and error reduction numbers.",
    defaultObjective: "case-breakdown",
    hookTemplate: (topic) => `The real math behind ${topic.toLowerCase()}: Hours saved, error rates, and break-even ROI.`
  },
  "comparison-versus": {
    label: "Head-to-Head Comparison (A vs. B)",
    description: "Direct side-by-side contrast between two technologies, paradigms, or workflow choices.",
    defaultObjective: "education",
    hookTemplate: (topic) => `${topic}: Which approach makes sense for your team? A side-by-side breakdown.`
  },
  "how-to-practical": {
    label: "Actionable How-To & Step-by-Step",
    description: "Tactical tutorial guiding the audience through concrete implementation steps.",
    defaultObjective: "tool-breakdown",
    hookTemplate: (topic) => `How to implement ${topic.toLowerCase()} in 4 clear, tested steps.`
  }
};

/**
 * Normalize text to extract a clean semantic topic key
 */
export function extractTopicStem(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["with", "this", "that", "from", "your", "what", "here", "when", "does"].includes(w))
    .sort()
    .slice(0, 4)
    .join("-");
}

export function computeSemanticFingerprint(brand: string, topic: string, angle: AngleType): string {
  const stem = extractTopicStem(topic);
  return `${brand.toLowerCase()}:${stem}:${angle}`;
}

export interface PastMemoryQueryItem {
  topic: string;
  angle: AngleType;
  publishedAt?: string;
  createdAt?: string;
}

/**
 * Evaluates whether a proposed topic and angle combination violates repetition rules
 */
export function evaluateTopicAngleRepetition(
  brand: string,
  proposedTopic: string,
  proposedAngle: AngleType,
  history: PastMemoryQueryItem[],
  repetitionWindowDays = 21
): { allowed: boolean; freshnessScore: number; rationale: string } {
  const now = Date.now();
  const cutoff = now - repetitionWindowDays * 24 * 60 * 60 * 1000;
  const proposedStem = extractTopicStem(proposedTopic);

  // Check past history within window
  let recentSameTopicSameAngle = false;
  let recentSameTopicDifferentAngle = false;
  let daysSinceLastUse: number | null = null;

  for (const item of history) {
    const itemDate = new Date(item.publishedAt || item.createdAt || 0).getTime();
    if (itemDate < cutoff) continue;

    const itemStem = extractTopicStem(item.topic);
    const stemMatch = itemStem.length > 0 && proposedStem.length > 0 && (itemStem === proposedStem || proposedStem.includes(itemStem) || itemStem.includes(proposedStem));

    if (stemMatch) {
      const daysAgo = Math.max(1, Math.round((now - itemDate) / (24 * 60 * 60 * 1000)));
      if (daysSinceLastUse === null || daysAgo < daysSinceLastUse) {
        daysSinceLastUse = daysAgo;
      }

      if (item.angle === proposedAngle) {
        recentSameTopicSameAngle = true;
      } else {
        recentSameTopicDifferentAngle = true;
      }
    }
  }

  // Rule 1: Same Topic + Same Angle + Recent (< 21 days) => AVOID
  if (recentSameTopicSameAngle) {
    return {
      allowed: false,
      freshnessScore: 0.1,
      rationale: `Repetition violation: '${proposedTopic}' was already covered using the '${proposedAngle}' angle within the last ${daysSinceLastUse} days. Choose a different angle or fresh topic.`
    };
  }

  // Rule 2: Same Topic + New Angle => ALLOWED (topic revisited from a fresh narrative perspective)
  if (recentSameTopicDifferentAngle) {
    return {
      allowed: true,
      freshnessScore: 0.82,
      rationale: `Allowed: '${proposedTopic}' was previously touched, but the proposed angle '${proposedAngle}' offers a fresh, complementary perspective.`
    };
  }

  // Rule 3: Completely fresh topic and angle
  return {
    allowed: true,
    freshnessScore: 1.0,
    rationale: `Optimal freshness: New topic and angle combination for ${brand}.`
  };
}

/**
 * Builds candidate topics from a brand's pillars and sub-pillars
 */
export function buildBrandTopicCatalog(brandName: string): TopicEntity[] {
  const profile = getBrandProfile(brandName);
  const entities: TopicEntity[] = [];

  for (const pillar of profile.pillars) {
    for (const sub of pillar.subPillars) {
      for (const sample of sub.sampleTopics) {
        entities.push({
          id: `topic-${pillar.id}-${sub.id}-${extractTopicStem(sample)}`,
          pillarId: pillar.id,
          subPillarId: sub.id,
          title: sample,
          coreConcept: `${pillar.name} · ${sub.name}: ${sample}`,
          keywords: sample.toLowerCase().split(/\s+/).filter((w) => w.length > 4),
          targetAudienceId: profile.targetAudiences[0]?.id || "general",
          suggestedAngles: [
            "problem-vs-solution",
            "deep-dive-mechanism",
            "real-world-workflow",
            "myth-buster-mistake",
            "cost-time-roi",
            "how-to-practical"
          ]
        });
      }
    }
  }

  return entities;
}

/**
 * Selects an optimal topic and angle for a given content format, balancing pillars and past history
 */
export function selectOptimalTopicAngle(
  brandName: string,
  preferredPillarId: string | undefined,
  history: PastMemoryQueryItem[],
  format: "POST" | "REEL" | "STORY"
): TopicAngle {
  const profile = getBrandProfile(brandName);
  const catalog = buildBrandTopicCatalog(brandName);

  // Filter or prioritize by preferred pillar
  let candidates = preferredPillarId ? catalog.filter((c) => c.pillarId === preferredPillarId) : catalog;
  if (candidates.length === 0) candidates = catalog;

  // Potential angles based on format
  const formatPreferredAngles: AngleType[] =
    format === "REEL"
      ? ["deep-dive-mechanism", "myth-buster-mistake", "beginner-analogy", "problem-vs-solution", "comparison-versus"]
      : format === "STORY"
      ? ["beginner-analogy", "myth-buster-mistake", "founder-perspective"]
      : ["problem-vs-solution", "real-world-workflow", "cost-time-roi", "how-to-practical", "future-trend-prediction"];

  // Search candidate topics and angles to find the highest freshness score
  let bestCandidate: { topic: TopicEntity; angle: AngleType; freshness: number; rationale: string } | null = null;

  for (const topic of candidates) {
    for (const angle of formatPreferredAngles) {
      const evaluation = evaluateTopicAngleRepetition(brandName, topic.title, angle, history);
      if (evaluation.allowed) {
        if (!bestCandidate || evaluation.freshnessScore > bestCandidate.freshness) {
          bestCandidate = {
            topic,
            angle,
            freshness: evaluation.freshnessScore,
            rationale: evaluation.rationale
          };
          if (bestCandidate.freshness >= 0.95) break;
        }
      }
    }
    if (bestCandidate && bestCandidate.freshness >= 0.95) break;
  }

  // Fallback if all strictly matched
  if (!bestCandidate) {
    const fallbackTopic = candidates[0] || catalog[0];
    const fallbackAngle = formatPreferredAngles[0];
    bestCandidate = {
      topic: fallbackTopic,
      angle: fallbackAngle,
      freshness: 0.7,
      rationale: "Selected with alternative rotational angle to maintain posting frequency."
    };
  }

  const angleConfig = ANGLE_CONFIGS[bestCandidate.angle];
  const hook = angleConfig.hookTemplate(bestCandidate.topic.title);

  return {
    topic: bestCandidate.topic,
    angle: bestCandidate.angle,
    narrativeHook: hook,
    objective: angleConfig.defaultObjective,
    freshnessScore: bestCandidate.freshness,
    repetitionCheckRationale: bestCandidate.rationale
  };
}
