import type {
  BrandProfile,
  ContentFormat,
  CreativeDirection,
  PostPlan,
  ReelPlan,
  SceneCreativeDirection
} from "./types";
import { getBrandProfile } from "./brand-brain";
import { ANGLE_CONFIGS } from "./topic-engine";

/**
 * Builds the comprehensive prompt for generating high-signal, brand-aligned captions
 */
export function buildCaptionPrompt(plan: PostPlan): string {
  const profile = getBrandProfile(plan.brand);
  const angleDetails = ANGLE_CONFIGS[plan.angle];

  const bannedWordsList = profile.voice.vocabularyDont.concat(profile.voice.bannedClichés).join(", ");
  const preferredWordsList = profile.voice.vocabularyDo.join(", ");

  const isHinglish = plan.language.toLowerCase().includes("hinglish");

  return [
    `You are the executive lead content strategist for ${profile.name}.`,
    `MISSION: ${profile.mission}`,
    `AUDIENCE: ${plan.targetAudience}`,
    `CORE TOPIC: ${plan.topic}`,
    `PILLAR: ${plan.pillar} (${plan.subPillar})`,
    `NARRATIVE ANGLE: ${angleDetails.label} — ${angleDetails.description}`,
    `OPENING HOOK DIRECTION: ${plan.hook}`,
    `COMMERCIAL OBJECTIVE: ${plan.objective}`,
    `LANGUAGE STYLE: ${plan.language} (${profile.voice.toneDescriptors.join("; ")})`,
    isHinglish
      ? "USE NATURAL, MODERN HINGLISH as spoken by Indian tech founders and engineers in Bangalore/Gurgaon (e.g. 'Chalo samajhte hain', 'under the hood', 'actual reality ye hai'). Keep technical terms in clean English."
      : "USE CRISP, POLISHED, CONSULTANT-GRADE ENGLISH with high signal-to-noise ratio.",
    `CALL TO ACTION: ${plan.cta}`,
    `STRICT NEGATIVE CONSTRAINTS:`,
    `- DO NOT use empty promotional fluff or generic clichés: ${bannedWordsList}.`,
    `- DO NOT make ungrounded financial promises or invent fake statistics.`,
    `- PREFER high-leverage vocabulary: ${preferredWordsList}.`,
    `- Format with clean, scannable line breaks, short paragraphs (1-3 sentences max), and strategic bullet points.`,
    `- Keep character count between 500 and 1,800 characters for optimal Facebook engagement.`
  ].join("\n");
}

/**
 * Builds the prompt for Flux 1-schnell image generation from a CreativeDirection
 */
export function buildImagePrompt(creative: CreativeDirection, brandName: string): string {
  const profile = getBrandProfile(brandName);

  return [
    creative.promptOutput,
    `Visual Family: ${creative.visualFamily}.`,
    `Subject: ${creative.subject}.`,
    `Composition: ${creative.composition}.`,
    `Camera Perspective: ${creative.cameraPerspective}.`,
    `Lighting: ${creative.lighting}.`,
    `Color Palette & Mood: ${creative.colorPalette}.`,
    `Environment: ${creative.environment}.`,
    `Atmosphere: Pristine commercial quality, high dynamic range, sharp focus.`,
    `STRICT NEGATIVE PROMPT: text, letters, words, typos, watermark, signature, blurry, low resolution, amateur, fake UI, floating numbers, cut off edges.`
  ].join(" ");
}

/**
 * Builds the narration and storyboard generation prompt for a Reel
 */
export function buildReelStoryboardPrompt(plan: ReelPlan): string {
  const profile = getBrandProfile(plan.brand);
  const isHinglish = plan.language.toLowerCase().includes("hinglish");

  return [
    `You are the creative director for ${profile.name}'s vertical educational Reels studio.`,
    `TARGET TOPIC: ${plan.topic}`,
    `NARRATIVE ANGLE: ${plan.angle}`,
    `AUDIENCE: ${plan.targetAudience}`,
    `TOTAL DURATION: ${plan.totalDurationSeconds} seconds across 5 sequential scenes.`,
    `LANGUAGE: ${plan.language}`,
    isHinglish
      ? "Narration must sound like a friendly, high-energy Indian tech educator explaining a breakthrough concept over coffee. Conversational, authentic Hinglish."
      : "Narration must be clear, crisp, rhythmic, and perfectly timed for spoken delivery (approx 20-25 words per scene).",
    `OUTPUT REQUIREMENT: Return a strictly structured 5-scene storyboard where each scene has a visual hook, clear narration line, overlay caption (under 6 words), and visual art direction.`
  ].join("\n");
}
