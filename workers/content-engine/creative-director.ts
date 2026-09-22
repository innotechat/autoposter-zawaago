import type {
  AngleType,
  AspectRatio,
  BrandProfile,
  CreativeDirection,
  SceneCreativeDirection,
  VisualFamily
} from "./types";
import { getBrandProfile } from "./brand-brain";
import { selectDiverseVisualFamily, type PastVisualRecord } from "./visual-diversity";

export interface VisualFamilyArtDirection {
  family: VisualFamily;
  compositionStyle: string;
  cameraPerspective: string;
  lightingStyle: string;
  renderingEngineCue: string;
  characterAesthetic: string;
}

export const VISUAL_FAMILY_GUIDES: Record<VisualFamily, VisualFamilyArtDirection> = {
  "editorial-photo": {
    family: "editorial-photo",
    compositionStyle: "Clean rule-of-thirds, generous negative space, sophisticated focal hierarchy, natural editorial depth",
    cameraPerspective: "Eye-level 50mm or 85mm prime lens portraiture, shallow depth of field with creamy bokeh",
    lightingStyle: "Soft diffused daylight streaming through high architectural glass windows with gentle ambient bounce",
    renderingEngineCue: "Award-winning commercial editorial photography, Hasselblad medium format, natural skin textures",
    characterAesthetic: "Thoughtful modern professional in understated premium business attire, poised and engaged in genuine work"
  },
  "cinematic": {
    family: "cinematic",
    compositionStyle: "Anamorphic widescreen composition, dynamic leading lines, intentional contrast and atmosphere",
    cameraPerspective: "Low angle cinematic 35mm view, dramatic scale, atmospheric haze and volumetric depth",
    lightingStyle: "Chiaroscuro lighting, dual-tone atmospheric glow with subtle teal and amber rim illumination",
    renderingEngineCue: "35mm film still, ARRI Alexa cinematic look, high dynamic range, beautiful film grain",
    characterAesthetic: "Focused tech leader or visionary innovator in contemporary modern work attire"
  },
  "premium-business-photo": {
    family: "premium-business-photo",
    compositionStyle: "Architectural alignment, balanced symmetrical perspective, calm executive breathing room",
    cameraPerspective: "Slight low-to-eye level 50mm shot capturing both human presence and high-end environment",
    lightingStyle: "Even, warm architectural cove lighting combined with soft natural skylight",
    renderingEngineCue: "Monocle and Fast Company magazine aesthetic, clean color grading, pristine realism",
    characterAesthetic: "Diverse executive leaders in crisp, tailored modern professional wear, collaborative and poised"
  },
  "premium-illustration": {
    family: "premium-illustration",
    compositionStyle: "Balanced geometric framing, elegant visual metaphor, harmonious visual rhythm",
    cameraPerspective: "Isometric or subtle 3/4 axonometric perspective with clear planar separation",
    lightingStyle: "Subtle gradient shading, soft ambient occlusions, clean tonal transitions without harsh glare",
    renderingEngineCue: "The New Yorker and Stripe design aesthetic, refined vector illustration with rich tactile grain",
    characterAesthetic: "Stylized modern figures with elegant proportions and purposeful gestures"
  },
  "3d": {
    family: "3d",
    compositionStyle: "Central pedestal hero framing, meticulous spatial geometry, sculptural presence",
    cameraPerspective: "Studio product shot, 45-degree angle, macro focus on intricate mechanical or digital details",
    lightingStyle: "Studio three-point lighting, key light with soft softbox, crisp rim light highlighting edges",
    renderingEngineCue: "Cinema 4D and Octane Render, tactile materials like frosted glass, brushed titanium and ceramic",
    characterAesthetic: "Smooth geometric form with polished surfaces and high-refraction glass accents"
  },
  "3d-isometric": {
    family: "3d-isometric",
    compositionStyle: "Precision 30-degree isometric grid, micro-world diorama layout, multi-layered workflow stages",
    cameraPerspective: "Orthographic isometric camera angle overlooking a miniature architectural stage",
    lightingStyle: "Soft directional sunlight casting crisp clean shadows across pastel geometric planes",
    renderingEngineCue: "Stylized 3D architectural model, clean matte clay, glowing fiber-optic conduits",
    characterAesthetic: "Miniature stylized figures operating workstations, moving modular building blocks"
  },
  "stylized-3d-character": {
    family: "stylized-3d-character",
    compositionStyle: "Character-forward portrait, expressive body posture, clean uncluttered backdrop",
    cameraPerspective: "Medium close-up at eye level, warm and inviting perspective",
    lightingStyle: "Soft wrap-around rim lighting, luminous rim on silhouette, vibrant warm studio bounce",
    renderingEngineCue: "Pixar-inspired stylized 3D render, subsurface scattering on skin, rich cloth textures",
    characterAesthetic: "Relatable young tech creator or engineer with expressive eyes, approachable smile, and modern casual hoodie"
  },
  "cartoon-character": {
    family: "cartoon-character",
    compositionStyle: "Dynamic action pose, exaggerated gesture, bold clean silhouette",
    cameraPerspective: "Dynamic wide angle with subtle comic-strip foreshortening",
    lightingStyle: "Bright cel-shaded highlights with crisp graphic outline shadows",
    renderingEngineCue: "Modern clean 2D vector animation style, crisp curves, bold energetic color blocks",
    characterAesthetic: "Energetic and curious student or developer exploring an imaginative tech maze"
  },
  "futuristic-concept": {
    family: "futuristic-concept",
    compositionStyle: "Epic scale, converging horizon lines, grand architectural symmetry",
    cameraPerspective: "Sweeping wide-angle vista looking upward at towering autonomous data architectures",
    lightingStyle: "Deep bioluminescent cyan and violet glow, subtle lens flares, dark ambient background",
    renderingEngineCue: "Blade Runner 2049 aesthetic, sleek monoliths, floating optical holographic schematics",
    characterAesthetic: "Solitary architect surveying a vast glowing digital network from an observation deck"
  },
  "minimal-corporate": {
    family: "minimal-corporate",
    compositionStyle: "Extreme negative space, Bauhaus discipline, single focal anchor, quiet confidence",
    cameraPerspective: "Flat-lay or strict eye-level frontal perspective with zero clutter",
    lightingStyle: "Diffuse high-key studio light, minimal shadow, crisp pristine white and deep charcoal contrast",
    renderingEngineCue: "Swiss graphic design meets Apple product photography, pristine matte surfaces",
    characterAesthetic: "Minimalist executive workspace with a single clean notebook, coffee cup, and sleek device"
  },
  "bold-abstract": {
    family: "bold-abstract",
    compositionStyle: "Flowing organic topological contours, interlocking curvilinear ribbons, mathematical beauty",
    cameraPerspective: "Abstract macro perspective exploring the interior of a dynamic data sculpture",
    lightingStyle: "Internal translucent luminance, iridescence, light refracting through curved glass ribbons",
    renderingEngineCue: "Houdini generative art, undulating fluid dynamics, high-gloss enamel and glass",
    characterAesthetic: "Pure conceptual form representing data velocity, intelligence, and transformation"
  },
  "infographic-concept": {
    family: "infographic-concept",
    compositionStyle: "Stepwise visual flow, clear cause-and-effect pathways, hierarchical nodes",
    cameraPerspective: "Direct top-down or slight 2.5D angle showing connected modular system blocks",
    lightingStyle: "Bright, shadow-free, high-clarity technical illustration lighting",
    renderingEngineCue: "Scientific American technical illustration, clean iconography nodes, glowing pathways",
    characterAesthetic: "Modular system nodes, pipeline junctions, and data packets flowing smoothly"
  },
  "human-centric": {
    family: "human-centric",
    compositionStyle: "Emotion-led framing, authentic candid moment, genuine human interaction and connection",
    cameraPerspective: "Over-the-shoulder or close conversational distance, inviting and intimate",
    lightingStyle: "Golden hour window sunlight, warm natural ambient room light",
    renderingEngineCue: "Authentic documentary photography, Leica M11 look, zero artificial stock-photo stiffness",
    characterAesthetic: "Two engineers or founders laughing while collaborating over a whiteboard or screen"
  },
  "Indian-business": {
    family: "Indian-business",
    compositionStyle: "Vibrant contemporary Indian commercial context, authentic urban tech hubs",
    cameraPerspective: "Dynamic environmental portrait, 50mm prime, capturing rich authentic surroundings",
    lightingStyle: "Warm tropical ambient sunlight balanced with sleek indoor glass-office architectural LEDs",
    renderingEngineCue: "Forbes India cover aesthetic, crisp sharp detail, authentic modern South Asian professional atmosphere",
    characterAesthetic: "Confident modern Indian founders and tech professionals in Bangalore, Hyderabad or Gurgaon tech parks"
  },
  "technology-concept": {
    family: "technology-concept",
    compositionStyle: "Interlocking neural network nodes, fiber-optic light conduits, clean modular logic",
    cameraPerspective: "Three-quarters view of an intricate glowing silicon wafer or optical quantum chip",
    lightingStyle: "Micro-LED luminescence, precision laser lines, subtle deep navy backdrop",
    renderingEngineCue: "Nature Biotechnology and MIT Technology Review visual aesthetic, extreme precision",
    characterAesthetic: "Semiconductor cleanroom or advanced robotics lab with precision robotic arm assembly"
  },
  "cinematic-storytelling": {
    family: "cinematic-storytelling",
    compositionStyle: "Narrative tension, clear foreground-middleground-background depth, visual mystery",
    cameraPerspective: "Dutch angle or cinematic tracking perspective conveying momentum and discovery",
    lightingStyle: "Dramatic motivated lighting, spotlight slicing through quiet office darkness",
    renderingEngineCue: "Prestige television drama cinematography, Alexa 65 sensor, cinematic color grade",
    characterAesthetic: "A dedicated innovator having a breakthrough eureka moment late at night"
  }
};

/**
 * Builds a visual metaphor tailored to the topic and angle
 */
export function deriveVisualMetaphor(topic: string, angle: AngleType, family: VisualFamily): string {
  const lower = topic.toLowerCase();
  if (lower.includes("agent") || lower.includes("autonomous")) {
    return "A luminous geometric orchestrator node sending synchronized golden pulses of light to connected specialized modular units, symbolizing autonomous task delegation without human micro-management.";
  }
  if (lower.includes("database") || lower.includes("vector") || lower.includes("embedding")) {
    return "Multi-dimensional constellation of glowing knowledge points suspended in clean crystal-clear space, connected by thin luminous threads of similarity.";
  }
  if (lower.includes("workflow") || lower.includes("automation") || lower.includes("pipeline")) {
    return "A beautifully engineered modular assembly of polished glass and brushed metal chutes where complex raw components smoothly assemble into a pristine finished artifact.";
  }
  if (lower.includes("roi") || lower.includes("cost") || lower.includes("math") || lower.includes("time")) {
    return "An elegant hourglass where sand grains transform into illuminated golden geometric gears, representing the direct conversion of operational time into lasting enterprise momentum.";
  }
  if (lower.includes("myth") || lower.includes("mistake") || lower.includes("trap")) {
    return "A maze where a conventional tangled path leads to a dead end, while a clean direct architectural bridge arches gracefully overhead to the destination.";
  }
  if (lower.includes("developer") || lower.includes("coding") || lower.includes("api") || lower.includes("sdk")) {
    return "A clean developer workstation illuminated by ambient cyan backlighting, with glowing modular building blocks clicking together effortlessly.";
  }
  return "A clean, harmonious visual composition illustrating transformation from chaotic fragmented pieces into unified, elegant order.";
}

/**
 * AI Art Director generates the complete CreativeDirection for a Post
 */
export function formulatePostCreativeDirection(
  brandName: string,
  topic: string,
  angle: AngleType,
  history: PastVisualRecord[],
  aspectRatio: AspectRatio = "1:1",
  overrideFamily?: VisualFamily
): CreativeDirection {
  const profile = getBrandProfile(brandName);
  const family = selectDiverseVisualFamily(brandName, history, overrideFamily);
  const guide = VISUAL_FAMILY_GUIDES[family];
  const metaphor = deriveVisualMetaphor(topic, angle, family);

  const cleanBrandSafe = `Keep a clean, uncluttered ${profile.visualIdentity.logoPosition.toLowerCase()} corner safe area for the ${profile.name} logo watermark overlay.`;
  const strictNoText = "STRICT TEXT POLICY: DO NOT render any visible text, words, labels, letters, fake statistics, fake logos, or watermarks in the artwork. Rely 100% on visual storytelling, metaphor, and lighting.";

  const promptOutput = [
    `Create a ${family} commercial artwork for ${profile.name}.`,
    `Subject: ${topic}.`,
    `Angle & Narrative: ${angle}.`,
    `Visual Metaphor: ${metaphor}.`,
    `Composition: ${guide.compositionStyle}, ${aspectRatio} aspect ratio.`,
    `Camera & Lens: ${guide.cameraPerspective}.`,
    `Lighting & Atmosphere: ${guide.lightingStyle}.`,
    `Aesthetic & Textures: ${guide.renderingEngineCue}.`,
    `Color Mood: ${profile.visualIdentity.colorPalette.mood}.`,
    cleanBrandSafe,
    strictNoText
  ].join(" ");

  return {
    visualFamily: family,
    subject: topic,
    composition: guide.compositionStyle,
    cameraPerspective: guide.cameraPerspective,
    lighting: guide.lightingStyle,
    colorPalette: profile.visualIdentity.colorPalette.mood,
    environment: profile.visualIdentity.environmentPreference,
    characterStyling: guide.characterAesthetic,
    visualMetaphor: metaphor,
    aspectRatio,
    brandingTreatment: profile.visualIdentity.brandingDefault,
    noTextPolicy: true,
    promptOutput
  };
}

/**
 * AI Art Director generates the complete 5-scene Creative Direction for a Reel
 */
export function formulateReelCreativeDirection(
  brandName: string,
  title: string,
  topic: string,
  angle: AngleType,
  history: PastVisualRecord[],
  language: string = "English"
): SceneCreativeDirection[] {
  const profile = getBrandProfile(brandName);
  // Pick an overarching visual family for the Reel, but vary scene cameras and compositions
  const primaryFamily = selectDiverseVisualFamily(brandName, history);
  const guide = VISUAL_FAMILY_GUIDES[primaryFamily];

  // 5 scenes structured for maximum retention and cognitive clarity
  // Scene 1: Visual Hook (acute curiosity, problem, or unexpected contrast)
  // Scene 2: The Core Dilemma (why standard approaches fail)
  // Scene 3: The Turning Point / Mental Model (the intuitive visual breakthrough)
  // Scene 4: The Mechanism / Step-by-Step (how it actually works)
  // Scene 5: The Takeaway & Call to Action (clean resolution & forward momentum)

  const isHinglish = language === "Hinglish";

  const sceneTemplates = [
    {
      number: 1,
      duration: 8,
      hookCaption: isHinglish ? "Ye galti 90% teams karti hain" : "The #1 mistake teams make with this",
      narration: isHinglish
        ? `Agar aap bhi ${topic} ko traditional tarike se dekh rahe hain, to ruk jaaiye. Yahan 90% log ek costly mistake karte hain.`
        : `If your team is still approaching ${topic} the traditional way, stop. Most people make a critical mistake right here.`,
      cameraView: "Fast push-in camera movement, intense focal lock on a high-stakes turning point",
      metaphorCue: "A stark high-contrast visual showing an outdated manual bottleneck juxtaposed against a sleek autonomous gateway."
    },
    {
      number: 2,
      duration: 9,
      hookCaption: isHinglish ? "Purana tarika kyu fail hota hai" : "Why the old playbook fails",
      narration: isHinglish
        ? `Problem ye hai ki purane systems linear hote hain. Jaise hi scale badhta hai, errors aur delay exponential ho jaate hain.`
        : `The fundamental problem is linear fragility. As soon as workload doubles, manual coordination collapses under delay and human error.`,
      cameraView: "Wide environmental shot showing complex intertwined pathways reaching a gridlock",
      metaphorCue: "A mechanical system where tangled wires and overloaded conduits create an operational standstill."
    },
    {
      number: 3,
      duration: 10,
      hookCaption: isHinglish ? "Real Solution: Autonomous Architecture" : "The Breakthrough Mental Model",
      narration: isHinglish
        ? `Iska solution hai ek intelligent orchestration loop. Jahan tasks manually pass hone ke badle, autonomous agents unhe execute karte hain.`
        : `The breakthrough is an autonomous orchestration loop. Instead of manual handoffs, specialized agents handle execution with built-in validation.`,
      cameraView: "Slow 45-degree rotational orbit around a luminous central intelligence hub",
      metaphorCue: "A crystalline central core dispersing harmonious golden energy beams to self-operating modular stations."
    },
    {
      number: 4,
      duration: 10,
      hookCaption: isHinglish ? "Ye step-by-step kaise kaam karta hai" : "How it works step-by-step",
      narration: isHinglish
        ? `Step one: request aati hai. Step two: model usse verify karta hai. Aur step three: API calls execute hoke result deliver ho jaata hai.`
        : `First, inputs are triaged. Second, the agent verifies context and tool schemas. Third, tasks execute with self-healing recovery.`,
      cameraView: "Smooth top-down tracking shot across an illuminated data pipeline",
      metaphorCue: "A seamless high-speed track where modular components click together effortlessly in real time."
    },
    {
      number: 5,
      duration: 8,
      hookCaption: isHinglish ? "Abhi implement karein" : "Key takeaway for this week",
      narration: isHinglish
        ? `Yahi difference hai busy rehne me aur high leverage build karne me. Save karein ye Reel aur follow karein ${profile.name} ko!`
        : `This is the definitive difference between operational drag and exponential leverage. Save this Reel and follow ${profile.name} for more.`,
      cameraView: "Heroic low-angle establishing shot looking out toward a clear, bright horizon",
      metaphorCue: "An open architectural balcony overlooking a pristine, illuminated future tech city with clean morning sunlight."
    }
  ];

  return sceneTemplates.map((template) => {
    const prompt = [
      `Vertical 9:16 cinematic video still for an educational Reel for ${profile.name}.`,
      `Scene ${template.number} of 5.`,
      `Visual Theme: ${primaryFamily} style.`,
      `Scene Subject: ${template.metaphorCue}`,
      `Camera View: ${template.cameraView}.`,
      `Lighting: ${guide.lightingStyle}.`,
      `Environment: ${profile.visualIdentity.environmentPreference}.`,
      `Aspect Ratio: Portrait 9:16 vertical.`,
      `Clean artwork only. ZERO text, ZERO letters, ZERO captions, ZERO subtitles, ZERO watermarks.`
    ].join(" ");

    return {
      sceneNumber: template.number,
      durationSeconds: template.duration,
      narration: template.narration,
      captionOverlayText: template.hookCaption,
      visualFamily: primaryFamily,
      visualPrompt: prompt,
      cameraView: template.cameraView,
      subjectAction: template.metaphorCue,
      lightingAndMood: guide.lightingStyle
    };
  });
}
