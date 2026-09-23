/**
 * Core type definitions for the Autonomous AI Content Operating System
 */

export type ContentFormat = "POST" | "REEL" | "STORY";

export type ContentObjective =
  | "education"
  | "problem-solution"
  | "thought-leadership"
  | "founder-insight"
  | "practical-productivity"
  | "industry-perspective"
  | "case-breakdown"
  | "tool-breakdown";

export type AngleType =
  | "problem-vs-solution"
  | "deep-dive-mechanism"
  | "myth-buster-mistake"
  | "real-world-workflow"
  | "future-trend-prediction"
  | "beginner-analogy"
  | "founder-perspective"
  | "cost-time-roi"
  | "comparison-versus"
  | "how-to-practical";

export type VisualFamily =
  | "editorial-photo"
  | "cinematic"
  | "premium-business-photo"
  | "premium-illustration"
  | "3d"
  | "3d-isometric"
  | "stylized-3d-character"
  | "cartoon-character"
  | "futuristic-concept"
  | "minimal-corporate"
  | "bold-abstract"
  | "infographic-concept"
  | "human-centric"
  | "Indian-business"
  | "technology-concept"
  | "cinematic-storytelling";

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type JobStatus =
  | "PLANNED"
  | "GENERATING"
  | "GENERATED"
  | "QUALITY_CHECK"
  | "APPROVED"
  | "READY"
  | "RETRYING"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "CANCELLED";

export type RegenerationTarget = "ALL" | "CAPTION_ONLY" | "IMAGE_ONLY" | "SCENE_ONLY";

export interface BrandSafetyRule {
  id: string;
  rule: string;
  category: "text" | "visual" | "claim" | "tone";
}

export interface CtaStrategy {
  objective: ContentObjective;
  primaryCta: string;
  secondaryCta?: string;
  placement: "end-of-caption" | "last-scene" | "story-sticker";
}

export interface AudienceSegment {
  id: string;
  label: string;
  description: string;
  painPoints: string[];
  aspirations: string[];
}

export interface SubPillar {
  id: string;
  name: string;
  description: string;
  sampleTopics: string[];
}

export interface ContentPillar {
  id: string;
  name: string;
  weight: number; // e.g. 0.35 = 35% of output
  description: string;
  subPillars: SubPillar[];
}

export interface VoiceProfile {
  primaryLanguage: "English" | "Hinglish" | "Hindi";
  allowedLanguages: ("English" | "Hinglish" | "Hindi")[];
  toneDescriptors: string[];
  vocabularyDo: string[];
  vocabularyDont: string[];
  bannedClichés: string[];
  hinglishMixRatio?: number; // e.g. 0.25 (25% natural conversational Hindi idioms)
}

export interface VisualIdentityConfig {
  preferredFamilies: VisualFamily[];
  restrictedFamilies: VisualFamily[];
  colorPalette: {
    primary: string;
    secondary: string;
    accents: string[];
    mood: string;
  };
  lightingPreference: string;
  environmentPreference: string;
  logoPosition: "Top Left" | "Top Right" | "Bottom Left" | "Bottom Right";
  brandingDefault: "No branding" | "Subtle watermark" | "Branded creative";
}

export interface BrandProfile {
  id: string;
  name: "Zawaago" | "InnoTech" | string;
  handle: string;
  tagline: string;
  mission: string;
  targetAudiences: AudienceSegment[];
  pillars: ContentPillar[];
  voice: VoiceProfile;
  visualIdentity: VisualIdentityConfig;
  safetyRules: BrandSafetyRule[];
  ctaStrategies: CtaStrategy[];
  formatPreferences: {
    postAspectRatio: AspectRatio;
    reelDurationSeconds: number;
    reelSceneCount: number;
    preferredStoryRatio: AspectRatio;
  };
  schedulePolicy: {
    postTimeLocal: string; // e.g. "12:30"
    reelTimeLocal: string; // e.g. "18:30"
    timezone: string;
  };
}

export interface TopicEntity {
  id: string;
  pillarId: string;
  subPillarId: string;
  title: string;
  coreConcept: string;
  keywords: string[];
  targetAudienceId: string;
  suggestedAngles: AngleType[];
}

export interface TopicAngle {
  topic: TopicEntity;
  angle: AngleType;
  narrativeHook: string;
  objective: ContentObjective;
  freshnessScore: number; // 0.0 - 1.0 (1.0 = completely fresh)
  repetitionCheckRationale: string;
}

export interface CreativeDirection {
  visualFamily: VisualFamily;
  subject: string;
  composition: string;
  cameraPerspective: string;
  lighting: string;
  colorPalette: string;
  environment: string;
  characterStyling?: string;
  visualMetaphor: string;
  aspectRatio: AspectRatio;
  brandingTreatment: "No branding" | "Subtle watermark" | "Branded creative";
  noTextPolicy: boolean; // Always true for AI-generated images
  promptOutput: string;
}

export interface SceneCreativeDirection {
  sceneNumber: number;
  durationSeconds: number;
  narration: string;
  captionOverlayText: string;
  visualFamily: VisualFamily;
  visualPrompt: string;
  cameraView: string;
  subjectAction: string;
  lightingAndMood: string;
  imageUrl?: string;
}

export interface PostPlan {
  id: string;
  brand: string;
  format: "POST";
  pillar: string;
  subPillar: string;
  objective: ContentObjective;
  topic: string;
  angle: AngleType;
  hook: string;
  captionBrief: string;
  cta: string;
  targetAudience: string;
  language: string;
  scheduledFor: string;
  creativeDirection: CreativeDirection;
  status: JobStatus;
  qualityScore?: number;
  generatedCaption?: string;
  generatedImageUrl?: string;
  facebookPostId?: string;
  publishedAt?: string;
  dayIndex?: number;
  planBatchId?: string;
  updatedAt?: string;
}

export interface ReelPlan {
  id: string;
  brand: string;
  format: "REEL";
  pillar: string;
  subPillar: string;
  objective: ContentObjective;
  title: string;
  topic: string;
  angle: AngleType;
  hook: string;
  totalDurationSeconds: number;
  scenes: SceneCreativeDirection[];
  cta: string;
  targetAudience: string;
  language: string;
  scheduledFor: string;
  status: JobStatus;
  qualityScore?: number;
  generatedVideoUrl?: string;
  facebookVideoId?: string;
  facebookPostId?: string;
  publishedAt?: string;
  dayIndex?: number;
  planBatchId?: string;
  updatedAt?: string;
}

export interface StoryPlan {
  id: string;
  brand: string;
  format: "STORY";
  pillar: string;
  topic: string;
  angle: AngleType;
  hook: string;
  visualConcept: string;
  overlayText: string;
  cta: string;
  scheduledFor: string;
  creativeDirection: CreativeDirection;
  relatedPostOrReelId?: string;
  status: JobStatus;
  canPublishLive: boolean; // false until Facebook Graph Stories API access is active
  facebookPostId?: string;
  publishedAt?: string;
  dayIndex?: number;
  planBatchId?: string;
  updatedAt?: string;
}

export type UnifiedContentPlan = PostPlan | ReelPlan | StoryPlan;

export interface ContentMemoryRecord {
  id: string;
  brand: string;
  planId?: string;
  format: ContentFormat;
  pillar: string;
  topic: string;
  angle: AngleType;
  hook: string;
  visualFamily: VisualFamily;
  visualConcept: string;
  fingerprint: string;
  publishedAt?: string;
  status: "planned" | "published" | "archived";
  performanceScore?: number;
  createdAt: string;
}

export interface DimensionScore {
  name: string;
  score: number; // 0 to 10
  passed: boolean;
  notes: string;
}

export interface QualityCheckResult {
  planId: string;
  overallScore: number; // 0 to 10
  passed: boolean;
  contentScore: number;
  visualScore: number;
  repetitionScore: number;
  dimensions: DimensionScore[];
  retryDirective?: {
    target: RegenerationTarget;
    sceneNumber?: number;
    reason: string;
    recommendedAdjustment: string;
  };
  evaluatedAt: string;
}

export interface ContentJob {
  id: string;
  planId: string;
  brand: string;
  format: ContentFormat;
  state: JobStatus;
  retryCount: number;
  maxRetries: number;
  currentStep: string;
  assetUrl?: string;
  videoUrl?: string;
  caption?: string;
  facebookPostId?: string;
  publishedAt?: string;
  errorMessage?: string;
  logs: { timestamp: string; step: string; message: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyStrategyPlan {
  date: string; // YYYY-MM-DD
  plans: UnifiedContentPlan[];
  rationale: string;
  pillarDistribution: Record<string, number>;
  visualDiversityScore: number; // 0.0 - 1.0
  repetitionChecksPassed: boolean;
}

export interface PerformanceFeedbackMetric {
  planId?: string;
  brand: string;
  format: ContentFormat;
  topic: string;
  angle: AngleType;
  visualFamily: VisualFamily;
  engagementRate: number;
  retentionRate?: number;
  recordedAt: string;
}

export interface StrategyRecommendation {
  brand: string;
  suggestedAction: "DOUBLE_DOWN_ANGLE" | "EXPLORE_NEW_ANGLE" | "REST_TOPIC" | "TRY_VISUAL_FAMILY";
  topic: string;
  angle?: AngleType;
  recommendedVisualFamily?: VisualFamily;
  confidenceScore: number;
  reasoning: string;
}
