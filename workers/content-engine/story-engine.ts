import type {
  AngleType,
  BrandProfile,
  CreativeDirection,
  StoryPlan
} from "./types";
import { getBrandProfile } from "./brand-brain";
import { formulatePostCreativeDirection } from "./creative-director";
import type { PastVisualRecord } from "./visual-diversity";

export interface StoryGenerationOptions {
  brandName: string;
  topic: string;
  angle: AngleType;
  hook: string;
  pillar: string;
  scheduledFor: string;
  relatedPostOrReelId?: string;
  history?: PastVisualRecord[];
}

/**
 * Story Engine: Formulates first-class 9:16 ephemeral content architecture
 */
export function formulateStoryPlan(options: StoryGenerationOptions): StoryPlan {
  const profile = getBrandProfile(options.brandName);
  const isHinglish = profile.voice.primaryLanguage === "Hinglish";

  // Formulate 9:16 vertical visual direction
  const creativeDirection: CreativeDirection = formulatePostCreativeDirection(
    options.brandName,
    options.topic,
    options.angle,
    options.history || [],
    "9:16"
  );

  // Overlay text concept for UI/Canvas rendering
  const overlayText = isHinglish
    ? `💡 QUICK INSIGHT\n\n${options.hook}\n\n👉 Tap profile link for full system blueprint`
    : `💡 QUICK INSIGHT\n\n${options.hook}\n\n👉 Tap link in bio for the complete workflow`;

  const cta = isHinglish
    ? "Aaj ka full post check karein feed par!"
    : "Check today's feed post for the complete breakdown!";

  return {
    id: `story-${crypto.randomUUID()}`,
    brand: options.brandName,
    format: "STORY",
    pillar: options.pillar,
    topic: options.topic,
    angle: options.angle,
    hook: options.hook,
    visualConcept: creativeDirection.visualMetaphor,
    overlayText,
    cta,
    scheduledFor: options.scheduledFor,
    creativeDirection,
    relatedPostOrReelId: options.relatedPostOrReelId,
    status: "PLANNED",
    // Guard: Facebook Graph API requires specific Page permissions / Instagram Graph API for Story publishing.
    // Kept as false for safe simulation & export until verified live token capabilities exist.
    canPublishLive: false
  };
}

/**
 * Checks whether live Story publishing is supported on the target platform
 */
export function checkStoryPublishingCapability(env: any): { supported: boolean; reason: string } {
  // Graph API v25.0 for Facebook Page feed & photos is supported; Page Stories requires Instagram business account linkage or Graph Stories whitelist
  return {
    supported: false,
    reason: "Facebook Graph API Stories endpoint requires linked Instagram Business Graph API or specialized media container publishing permissions. Story plans are generated and downloadable for manual upload or scheduled through supported partner tools."
  };
}
