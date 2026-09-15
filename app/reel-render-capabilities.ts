export type ReelRenderProfile = {
  renderer: "webcodecs" | "mediarecorder";
  mimeType: string;
  width: number;
  height: number;
  fps: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
};

const MP4_TYPES = [
  "video/mp4;codecs=avc1.424028,mp4a.40.2",
  "video/mp4;codecs=avc1.4d401f,mp4a.40.2",
  "video/mp4",
];

const WEBM_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function supportsMediaRecorder(type: string) {
  try {
    return typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type);
  } catch {
    return false;
  }
}

function supportsWebCodecs() {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

export function getReelRenderProfile(): ReelRenderProfile {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mp4 = MP4_TYPES.find(supportsMediaRecorder);
  const webm = WEBM_TYPES.find(supportsMediaRecorder);

  // Prefer WebCodecs when present, but keep MediaRecorder as the safe fallback.
  // The current Reel Lab renderer still uses MediaRecorder; this profile lets the UI
  // report the capability without pretending that WebCodecs is already the encoder.
  const renderer = supportsWebCodecs() ? "webcodecs" : "mediarecorder";
  const mimeType = mp4 ?? webm ?? "";

  return {
    renderer,
    mimeType,
    width: mobile ? 540 : 720,
    height: mobile ? 960 : 1280,
    fps: mobile ? 24 : 30,
    videoBitsPerSecond: mobile ? 2_000_000 : 3_500_000,
    audioBitsPerSecond: 128_000,
  };
}

export function getSupportedRecorderMimeTypes() {
  return [...MP4_TYPES, ...WEBM_TYPES].filter(supportsMediaRecorder);
}
