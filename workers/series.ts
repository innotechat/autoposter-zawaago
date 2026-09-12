import { Hono } from "hono";

type Env = { AI: Ai };

type SeriesBrief = {
  topic: string;
  pageName: string;
  contentType: string;
  tone: string;
  language: string;
  audience: string;
  visualStyle: string;
  aspectRatio: string;
  branding: string;
  logoPosition: string;
  cta: string;
  customPrompt: string;
  seriesLength: number;
  intervalHours: number;
};

export const seriesRoutes = new Hono<{ Bindings: Env }>();

function brandProfile(pageName: string) {
  if (pageName.toLowerCase().includes("zawaago")) {
    return { name: "Zawaago", description: "AI Agents, AI Apps, business automation and innovation consulting", hashtags: "#Zawaago #AIAgents #BusinessInnovation" };
  }
  return { name: "InnoTech", description: "technology education, practical AI and modern digital tools", hashtags: "#InnoTech #AI #TechEducation" };
}

function numberInRange(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

function parseSeriesPayload(result: any, expected: number) {
  const raw = result?.response ?? result?.result ?? result?.choices?.[0]?.message?.content ?? "";
  let parsed: any = raw;
  if (typeof raw === "string") {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    parsed = JSON.parse(cleaned);
  }
  const posts = Array.isArray(parsed) ? parsed : parsed?.posts;
  if (!Array.isArray(posts)) throw new Error("AI did not return a posts array.");
  return posts.slice(0, expected).map((post: any, index: number) => ({
    episode: index + 1,
    title: String(post.title || `Lesson ${index + 1}`).trim(),
    hook: String(post.hook || "").trim(),
    caption: String(post.caption || "").trim(),
    visualPrompt: String(post.visualPrompt || "").trim(),
  })).filter((post: any) => post.caption.length > 20 && post.visualPrompt.length > 10);
}

seriesRoutes.post("/autoposter/generate-series", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const brief: SeriesBrief = {
      topic: String(body.topic || "AI for business beginners").trim(),
      pageName: String(body.pageName || "Zawaago").trim(),
      contentType: String(body.contentType || "Educational").trim(),
      tone: String(body.tone || "Professional Hinglish").trim(),
      language: String(body.language || "English").trim(),
      audience: String(body.audience || "Business Owners").trim(),
      visualStyle: String(body.visualStyle || "Premium Editorial").trim(),
      aspectRatio: String(body.aspectRatio || "Square 1:1").trim(),
      branding: String(body.branding || "Subtle watermark").trim(),
      logoPosition: String(body.logoPosition || "Bottom Right").trim(),
      cta: String(body.cta || "Follow for More").trim(),
      customPrompt: String(body.customPrompt || "").trim(),
      seriesLength: numberInRange(body.seriesLength, 5, 3, 10),
      intervalHours: numberInRange(body.intervalHours, 24, 1, 168),
    };
    const brand = brandProfile(brief.pageName);
    const prompt = `You are the senior education-content strategist for ${brand.name}. Create a coherent ${brief.seriesLength}-part educational social-media series about: ${brief.topic}.

Brand: ${brand.name} — ${brand.description}
Content direction: ${brief.contentType}
Voice and tone: ${brief.tone}
Language: ${brief.language}
Audience: ${brief.audience}
Visual style: ${brief.visualStyle}
Aspect ratio: ${brief.aspectRatio}
Branding: ${brief.branding}; logo position: ${brief.logoPosition}
CTA: ${brief.cta}
Additional creative direction: ${brief.customPrompt || "none"}
Suggested posting interval: every ${brief.intervalHours} hours.

Series rules:
- Build a real learning progression: foundation → explanation → example → application → practical takeaway.
- Every episode must stand alone but clearly connect to the previous and next episode.
- Give each episode one useful lesson, not filler or generic motivation.
- Match the selected language exactly; Hindi must use Devanagari, Hinglish may mix naturally.
- Keep each caption social-ready, credible and concise (roughly 100-180 words).
- Start with a strong non-clickbait hook.
- No invented statistics, fake case studies, exaggerated promises or unsupported claims.
- Use 3-5 relevant hashtags and include the brand's core hashtags: ${brand.hashtags}.
- The visualPrompt must describe the image only; do not ask the image model to render the real logo or long text. Keep clean negative space for later logo overlay.
- Return exactly ${brief.seriesLength} posts.`;

    const models = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fp8"];
    const schema = {
      type: "json_schema",
      json_schema: {
        name: "education_series",
        schema: {
          type: "object",
          properties: {
            posts: {
              type: "array",
              minItems: brief.seriesLength,
              maxItems: brief.seriesLength,
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  hook: { type: "string" },
                  caption: { type: "string" },
                  visualPrompt: { type: "string" },
                },
                required: ["title", "hook", "caption", "visualPrompt"],
              },
            },
          },
          required: ["posts"],
        },
      },
    };

    let lastError = "";
    for (const model of models) {
      try {
        const result: any = await c.env.AI.run(model as any, {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3200,
          temperature: 0.55,
          response_format: schema,
        });
        const posts = parseSeriesPayload(result, brief.seriesLength);
        if (posts.length === brief.seriesLength) {
          return c.json({
            series: posts,
            seriesLength: brief.seriesLength,
            intervalHours: brief.intervalHours,
            pageName: brief.pageName,
            settings: {
              contentType: brief.contentType,
              tone: brief.tone,
              language: brief.language,
              audience: brief.audience,
              visualStyle: brief.visualStyle,
              aspectRatio: brief.aspectRatio,
              branding: brief.branding,
              logoPosition: brief.logoPosition,
              cta: brief.cta,
            },
          });
        }
        lastError = `AI returned ${posts.length} valid episodes instead of ${brief.seriesLength}.`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    return c.json({ error: "Series generation failed", details: lastError || "AI could not create the requested series." }, 503);
  } catch (error) {
    return c.json({ error: "Series generation failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});
