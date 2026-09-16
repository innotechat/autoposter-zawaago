export type ReelBrand = "Zawaago" | "InnoTech";
export type ReelLanguage = "English" | "Hinglish" | "Hindi" | "Bengali" | "Tamil" | "Telugu" | "Kannada" | "Malayalam" | "Marathi" | "Gujarati" | "Punjabi" | "Odia";
export type ReelDuration = 15 | 30 | 45 | 60 | "custom";
export type ReelBranding = "none" | "subtle" | "branded";
export type ReelVisualSourceType = "ai" | "gallery" | "upload" | "reuse";
export type ReelSourceType = "post" | "prompt" | "gallery" | "upload";
export type ReelJobStage = "idle" | "storyboard" | "visuals" | "voice" | "rendering" | "uploading" | "validating" | "ready" | "publishing" | "scheduling" | "failed";

export interface ReelSource {
  type: ReelSourceType;
  postImageUrl?: string;
  postCaption?: string;
  prompt?: string;
  assetKeys?: string[];
}

export interface ReelRequest {
  source: ReelSource;
  brand?: ReelBrand;
  branding: ReelBranding;
  language: ReelLanguage;
  duration: ReelDuration;
  customDurationSeconds?: number;
  audience?: string;
  tone?: string;
  visualStyle?: string;
  hook?: string;
  cta?: string;
  keywords?: string[];
  avoidTopics?: string[];
  customNarration?: string;
}

export interface ReelAsset {
  id: string;
  source: ReelVisualSourceType;
  url: string;
  r2Key?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  createdAt?: string;
}

export interface ReelScene {
  scene: number;
  durationSeconds: number;
  narration: string;
  caption: string;
  visualPrompt: string;
  visualSource: ReelVisualSourceType;
  asset?: ReelAsset;
}

export interface ReelStoryboard {
  title: string;
  hook: string;
  totalSeconds: number;
  scenes: ReelScene[];
  brand?: ReelBrand;
  language: ReelLanguage;
  audience?: string;
}

export interface ReelVoice {
  language: ReelLanguage;
  provider: "sarvam" | "melotts";
  speaker?: string;
  audioUrl?: string;
  durationSeconds?: number;
}

export interface ReelRenderManifest {
  version: 1;
  width: 1080 | 540;
  height: 1920 | 960;
  fps: 30;
  videoCodec: "h264";
  audioCodec: "aac";
  container: "mp4";
  branding: ReelBranding;
  logoUrl?: string;
  scenes: ReelScene[];
  voice?: ReelVoice;
}

export interface ReelRenderJob {
  id: string;
  stage: ReelJobStage;
  progress?: number;
  manifest: ReelRenderManifest;
  outputUrl?: string;
  outputR2Key?: string;
  error?: string;
  updatedAt: string;
}

export interface ReelPublishResult {
  ok: boolean;
  platform: "facebook";
  videoId?: string;
  error?: string;
}
