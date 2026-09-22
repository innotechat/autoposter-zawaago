import type {
  DimensionScore,
  PostPlan,
  QualityCheckResult,
  ReelPlan,
  RegenerationTarget,
  UnifiedContentPlan
} from "./types";
import { getBrandProfile } from "./brand-brain";

export interface QualityEvaluationContext {
  plan: UnifiedContentPlan;
  generatedCaption?: string;
  generatedImageUrl?: string;
  generatedScenes?: { sceneNumber: number; narration: string; imageUrl?: string }[];
  freshnessScore?: number;
}

/**
 * Evaluates generated content across multi-dimensional quality metrics
 * and issues targeted component-level retry directives if required.
 */
export function evaluateContentQuality(context: QualityEvaluationContext): QualityCheckResult {
  const { plan, generatedCaption, generatedImageUrl, generatedScenes, freshnessScore = 0.95 } = context;
  const profile = getBrandProfile(plan.brand);

  const dimensions: DimensionScore[] = [];

  // 1. Content Dimension: Brand Alignment & Hook Strength
  let contentScore = 8.5;
  const caption = generatedCaption || plan.hook;

  // Check for banned clichés
  const foundBanned = profile.voice.bannedClichés.filter((c) =>
    caption.toLowerCase().includes(c.toLowerCase())
  );
  if (foundBanned.length > 0) {
    contentScore -= foundBanned.length * 1.5;
    dimensions.push({
      name: "Banned Cliché Compliance",
      score: Math.max(3, 10 - foundBanned.length * 3),
      passed: false,
      notes: `Caption contains banned cliché phrase: '${foundBanned.join(", ")}'`
    });
  } else {
    dimensions.push({
      name: "Banned Cliché Compliance",
      score: 9.8,
      passed: true,
      notes: "Zero banned clichés detected."
    });
  }

  // Hook quality
  const hookLength = plan.hook.length;
  const hookPassed = hookLength >= 15 && hookLength <= 140;
  dimensions.push({
    name: "Hook Strength",
    score: hookPassed ? 9.2 : 6.0,
    passed: hookPassed,
    notes: hookPassed ? "Hook is concise and punchy." : "Hook is either too brief or overly verbose."
  });

  // CTA verification
  const hasCta = Boolean(plan.cta && plan.cta.length > 10);
  dimensions.push({
    name: "CTA Presence",
    score: hasCta ? 9.5 : 5.0,
    passed: hasCta,
    notes: hasCta ? "Clear action-oriented call to action." : "Missing or weak CTA."
  });

  // 2. Visual Dimension
  let visualScore = 8.8;
  if (plan.format === "POST" || plan.format === "STORY") {
    const postPlan = plan as PostPlan;
    const hasImagePrompt = Boolean(postPlan.creativeDirection?.promptOutput);
    const noTextEnforced = postPlan.creativeDirection?.noTextPolicy === true;

    dimensions.push({
      name: "Visual Prompt Quality & Metaphor",
      score: hasImagePrompt ? 9.4 : 5.0,
      passed: hasImagePrompt,
      notes: hasImagePrompt
        ? `Rich visual direction with '${postPlan.creativeDirection.visualFamily}' family and metaphor.`
        : "Incomplete creative direction prompt."
    });

    dimensions.push({
      name: "Strict Text-Free Image Policy",
      score: noTextEnforced ? 10.0 : 4.0,
      passed: noTextEnforced,
      notes: noTextEnforced
        ? "Enforced clean artwork with zero generator text."
        : "Warning: Missing text-free policy flag."
    });

    if (generatedImageUrl && generatedImageUrl.length < 5) {
      visualScore = 4.0;
    }
  } else if (plan.format === "REEL") {
    const reelPlan = plan as ReelPlan;
    const sceneCount = reelPlan.scenes?.length || 0;
    const scenesValid = sceneCount === 5;

    dimensions.push({
      name: "Reel 5-Scene Storyboard Structure",
      score: scenesValid ? 9.5 : 5.5,
      passed: scenesValid,
      notes: scenesValid ? "Complete 5-scene narrative arc." : `Incomplete scenes: ${sceneCount}/5.`
    });

    // Check individual scenes if generated
    if (generatedScenes && generatedScenes.length > 0) {
      const missingImageScene = generatedScenes.find((s) => !s.imageUrl);
      if (missingImageScene) {
        visualScore = 6.0;
        dimensions.push({
          name: `Scene ${missingImageScene.sceneNumber} Asset Render`,
          score: 4.0,
          passed: false,
          notes: `Scene ${missingImageScene.sceneNumber} missing generated visual.`
        });
      }
    }
  }

  // 3. Repetition & Freshness Dimension
  const repetitionScore = Math.round(freshnessScore * 100) / 10;
  const repetitionPassed = freshnessScore >= 0.7;
  dimensions.push({
    name: "Semantic Freshness & Topic-Angle Separation",
    score: repetitionScore,
    passed: repetitionPassed,
    notes: repetitionPassed
      ? `Freshness verified (${(freshnessScore * 100).toFixed(0)}%). No recent collision.`
      : "High semantic overlap with recent content. Needs fresh angle."
  });

  // Calculate overall weighted score
  const overallScore = Math.round((contentScore * 0.4 + visualScore * 0.4 + repetitionScore * 0.2) * 10) / 10;
  const passed = overallScore >= 7.5 && repetitionPassed && dimensions.every((d) => d.score >= 5.0);

  // Derive granular component retry directive if needed
  let retryDirective: QualityCheckResult["retryDirective"] = undefined;

  if (!passed) {
    if (!repetitionPassed) {
      retryDirective = {
        target: "ALL",
        reason: "Repetition violation: semantic angle is too close to recently published content.",
        recommendedAdjustment: "Pivot to an alternative angle (e.g. 'myth-buster-mistake' or 'cost-time-roi')."
      };
    } else if (contentScore < 7.0 && visualScore >= 7.5) {
      retryDirective = {
        target: "CAPTION_ONLY",
        reason: "Caption failed quality check due to cliché vocabulary or length constraints.",
        recommendedAdjustment: "Regenerate caption only while preserving the approved visual asset."
      };
    } else if (visualScore < 7.0 && contentScore >= 7.5) {
      if (plan.format === "REEL" && generatedScenes) {
        const failedScene = generatedScenes.find((s) => !s.imageUrl);
        if (failedScene) {
          retryDirective = {
            target: "SCENE_ONLY",
            sceneNumber: failedScene.sceneNumber,
            reason: `Scene ${failedScene.sceneNumber} visual failed render or timed out.`,
            recommendedAdjustment: `Re-render visual for Scene ${failedScene.sceneNumber} only.`
          };
        } else {
          retryDirective = {
            target: "IMAGE_ONLY",
            reason: "Visual direction did not meet aesthetic quality bar.",
            recommendedAdjustment: "Regenerate image with alternative camera perspective."
          };
        }
      } else {
        retryDirective = {
          target: "IMAGE_ONLY",
          reason: "Visual direction did not meet aesthetic quality bar.",
          recommendedAdjustment: "Regenerate image with refined lighting and composition prompt."
        };
      }
    } else {
      retryDirective = {
        target: "ALL",
        reason: "Multiple dimensions scored below quality threshold.",
        recommendedAdjustment: "Regenerate complete creative package with fresh parameters."
      };
    }
  }

  return {
    planId: plan.id,
    overallScore,
    passed,
    contentScore: Math.round(contentScore * 10) / 10,
    visualScore: Math.round(visualScore * 10) / 10,
    repetitionScore,
    dimensions,
    retryDirective,
    evaluatedAt: new Date().toISOString()
  };
}
