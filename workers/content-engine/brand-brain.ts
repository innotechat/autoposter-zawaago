import type { BrandProfile } from "./types";

const ZAWAAGO_PROFILE: BrandProfile = {
  id: "brand-zawaago",
  name: "Zawaago",
  handle: "AI • Automation • Innovation",
  tagline: "Building Autonomous Systems for Tomorrow's Enterprises",
  mission:
    "Empowering business leaders, founders, and enterprises with practical AI agents, intelligent workflow automation, and consultant-grade strategic clarity.",
  targetAudiences: [
    {
      id: "zawaago-biz-owners",
      label: "Business Owners & SMB Leaders",
      description: "Entrepreneurs managing 10-100 person companies looking to streamline operations without hiring massive headcount.",
      painPoints: ["Manual ops bottlenecks", "High labor costs", "Lack of clear ROI from AI hype", "Fragmented software tools"],
      aspirations: ["Self-operating business workflows", "Predictable operational scale", "Freeing up founder time for high-value strategy"]
    },
    {
      id: "zawaago-founders",
      label: "Tech & Startup Founders",
      description: "Early and growth stage founders seeking to scale AI agent architectures and achieve 10x leverage.",
      painPoints: ["Speed to market", "Engineering bandwidth bottlenecks", "Choosing between LLM stacks", "Workflow reliability"],
      aspirations: ["Building autonomous product features", "Lean team operations", "Industry thought leadership"]
    },
    {
      id: "zawaago-execs",
      label: "Enterprise & Operations Executives",
      description: "VPs and Directors tasked with AI transformation, governance, and quantifiable process enhancement.",
      painPoints: ["Data security & compliance", "Team adoption inertia", "Vendor lock-in", "Legacy infrastructure"],
      aspirations: ["Clean enterprise AI integration", "Measurable cost reductions", "Executive board recognition"]
    }
  ],
  pillars: [
    {
      id: "pillar-agents",
      name: "AI Agents & Autonomous Systems",
      weight: 0.35,
      description: "How autonomous multi-agent swarms, LLM orchestration, and reasoning loops execute complex real-world workflows.",
      subPillars: [
        {
          id: "sub-agent-orchestration",
          name: "Agent Orchestration & Tool Calling",
          description: "Connecting LLMs to APIs, databases, and enterprise backends for end-to-end task completion.",
          sampleTopics: [
            "Why tool-calling separates toys from enterprise AI agents",
            "Multi-agent supervisor architectures explained simply",
            "Autonomous customer triage agents: from ticket to resolved issue",
            "How agents recover from API failures with self-healing retries"
          ]
        },
        {
          id: "sub-human-in-the-loop",
          name: "Human-in-the-Loop Safeguards",
          description: "Balancing agent autonomy with governance, approval gates, and compliance.",
          sampleTopics: [
            "The 95/5 rule: When an agent acts and when it must ask a human",
            "Audit trails and idempotency in enterprise agent deployment",
            "How to prevent hallucination cascades in autonomous financial systems"
          ]
        }
      ]
    },
    {
      id: "pillar-automation-roi",
      name: "Business Automation & ROI Case Studies",
      weight: 0.25,
      description: "Concrete business workflows that save hundreds of hours, reduce errors, and demonstrate undeniable monetary return.",
      subPillars: [
        {
          id: "sub-workflow-blueprints",
          name: "Workflow Blueprints & Playbooks",
          description: "Step-by-step deconstruction of high-leverage business processes.",
          sampleTopics: [
            "Automating client onboarding from contract signature to Slack channel in 30 seconds",
            "How automated invoice reconciliation cuts 40 hours of monthly accounting drag",
            "Lead scoring agents that enrich CRM data before the first sales call"
          ]
        },
        {
          id: "sub-roi-math",
          name: "The Economics of Automation",
          description: "Calculating hard financial savings, opportunity cost, and break-even timelines.",
          sampleTopics: [
            "The real cost of a 15-minute manual task repeated across a 20-person team",
            "Build vs buy vs orchestrate: Where business owners waste money on AI",
            "Calculating payback period for a custom automation agent"
          ]
        }
      ]
    },
    {
      id: "pillar-founder-productivity",
      name: "Founder & Executive Leverage",
      weight: 0.20,
      description: "High-leverage cognitive systems, executive decision frameworks, and eliminating operational friction.",
      subPillars: [
        {
          id: "sub-executive-systems",
          name: "Cognitive Leverage & Focus Systems",
          description: "Using AI to summarize board meetings, distill research, and accelerate executive throughput.",
          sampleTopics: [
            "How founders use automated daily briefing dashboards to replace status meetings",
            "AI-powered market intelligence pipelines that monitor competitors silently",
            "The zero-inbox architecture for founders receiving 500 emails a day"
          ]
        }
      ]
    },
    {
      id: "pillar-emerging-ai",
      name: "Strategic AI Frontier & Future Outlook",
      weight: 0.20,
      description: "High-altitude analysis of where foundation models, edge compute, and autonomous software are heading.",
      subPillars: [
        {
          id: "sub-ai-strategy",
          name: "Strategic Technology Forecasting",
          description: "Separating long-term paradigm shifts from short-term promotional hype.",
          sampleTopics: [
            "Why context windows are replacing vector databases for mid-sized enterprise workflows",
            "Edge AI vs Cloud AI: Where privacy and latency dictate the future",
            "The death of point-solution SaaS in the era of self-assembling workflows"
          ]
        }
      ]
    }
  ],
  voice: {
    primaryLanguage: "English",
    allowedLanguages: ["English", "Hinglish"],
    toneDescriptors: [
      "Authoritative yet accessible",
      "Consultant-grade clarity",
      "Actionable and commercially grounded",
      "Visionary without empty hyperbole",
      "Direct, crisp, and high-signal"
    ],
    vocabularyDo: [
      "High leverage",
      "Systemic workflow",
      "Autonomous agent",
      "Measurable ROI",
      "First principles",
      "Idempotency",
      "Architecture",
      "Operational velocity"
    ],
    vocabularyDont: [
      "Supercharge",
      "Revolutionize",
      "Game-changer",
      "Magic button",
      "Skyrocket your profits",
      "Mind-blowing"
    ],
    bannedClichés: [
      "In today's fast-paced digital world",
      "Buckle up",
      "Let's dive right in",
      "The possibilities are truly endless"
    ],
    hinglishMixRatio: 0.15
  },
  visualIdentity: {
    preferredFamilies: [
      "editorial-photo",
      "cinematic",
      "premium-business-photo",
      "minimal-corporate",
      "3d-isometric",
      "technology-concept",
      "futuristic-concept",
      "Indian-business"
    ],
    restrictedFamilies: [
      "cartoon-character",
      "bold-abstract"
    ],
    colorPalette: {
      primary: "#0F172A", // Deep obsidian navy
      secondary: "#2563EB", // Electric royal cobalt
      accents: ["#10B981", "#6366F1", "#F8FAFC"],
      mood: "Polished, high-contrast, premium architectural lighting with calculated negative space."
    },
    lightingPreference: "Directional soft studio rim lighting, cinematic diffused sunlight, or subtle cybernetic ambient luminance.",
    environmentPreference: "Modern minimalist executive suites, sleek engineering labs, architectural glass atriums, and premium boardroom settings.",
    logoPosition: "Bottom Right",
    brandingDefault: "Subtle watermark"
  },
  safetyRules: [
    { id: "zaw-rule-1", rule: "Never promise guaranteed financial returns or specific fake profit percentages.", category: "claim" },
    { id: "zaw-rule-2", rule: "Never render visible text, words, letterings, or fake logos inside generated images.", category: "visual" },
    { id: "zaw-rule-3", rule: "Always maintain an executive, consultant-grade tone; avoid informal slang or meme culture.", category: "tone" },
    { id: "zaw-rule-4", rule: "Do not disparage specific competing software vendors by name.", category: "claim" }
  ],
  ctaStrategies: [
    {
      objective: "problem-solution",
      primaryCta: "Save this blueprint for your next automation sprint, or drop a comment with your biggest operational bottleneck.",
      placement: "end-of-caption"
    },
    {
      objective: "education",
      primaryCta: "Which of these systems would give your team the most leverage this quarter? Share your perspective below.",
      placement: "end-of-caption"
    },
    {
      objective: "thought-leadership",
      primaryCta: "Follow Zawaago for daily, no-fluff breakdowns of autonomous business systems.",
      placement: "end-of-caption"
    }
  ],
  formatPreferences: {
    postAspectRatio: "1:1",
    reelDurationSeconds: 45,
    reelSceneCount: 5,
    preferredStoryRatio: "9:16"
  },
  schedulePolicy: {
    postTimeLocal: "12:30",
    reelTimeLocal: "18:30",
    timezone: "Asia/Kolkata"
  }
};

const INNOTECH_PROFILE: BrandProfile = {
  id: "brand-innotech",
  name: "InnoTech",
  handle: "Technology • Education",
  tagline: "Demystifying Code, AI, and Future Tech for Everyone",
  mission:
    "Empowering developers, students, and tech creators with hands-on AI tutorials, architectural mental models, and career-accelerating engineering skills.",
  targetAudiences: [
    {
      id: "innotech-students",
      label: "CS & Engineering Students",
      description: "College students looking to master modern AI engineering, land top internships, and build real-world projects beyond textbook theory.",
      painPoints: ["Outdated university curricula", "Tutorial hell", "Fear of AI replacing developers", "Confusing technical jargon"],
      aspirations: ["Building full-stack AI apps", "Passing technical interviews", "Gaining real-world practical confidence"]
    },
    {
      id: "innotech-developers",
      label: "Junior & Mid Software Engineers",
      description: "Engineers transitioning into AI/ML, learning LLM tooling, prompt engineering, and cloud deployment architectures.",
      painPoints: ["Staying up to date with rapid AI releases", "Debugging complex LLM pipelines", "Writing production-grade code"],
      aspirations: ["Becoming an AI-augmented 10x engineer", "Transitioning to AI engineer roles", "Contributing to open source"]
    },
    {
      id: "innotech-creators",
      label: "Tech Enthusiasts & Solopreneurs",
      description: "Curious builders seeking to prototype apps quickly using no-code/low-code AI tools and modern APIs.",
      painPoints: ["Overwhelmed by API options", "Lack of step-by-step guidance", "Deployment headaches"],
      aspirations: ["Launching micro-SaaS products", "Automating side projects", "Understanding the code beneath the hood"]
    }
  ],
  pillars: [
    {
      id: "pillar-ai-tools-dev",
      name: "AI Apps, APIs & Modern Tooling",
      weight: 0.30,
      description: "Hands-on breakdowns of developer tools, AI SDKs, vector databases, and modern deployment platforms.",
      subPillars: [
        {
          id: "sub-practical-sdks",
          name: "Practical API & SDK Deep Dives",
          description: "How to use modern AI libraries with clear, working code concepts and architecture mental models.",
          sampleTopics: [
            "Building your first RAG pipeline with Cloudflare Vectorize in 20 lines of code",
            "Streaming responses like ChatGPT: Understanding Server-Sent Events (SSE) simply",
            "Comparing JSON mode vs structured outputs across major LLM APIs",
            "Why function calling is the superpower every modern developer must master"
          ]
        },
        {
          id: "sub-developer-tooling",
          name: "AI-Augmented Developer Workflows",
          description: "Supercharging coding velocity with AI IDEs, code review agents, and automated test generators.",
          sampleTopics: [
            "How top engineers prompt Claude and Cursor without getting bad code",
            "Automated unit test generation: Best practices to prevent false green tests",
            "Building custom CLI dev tools powered by local LLMs via Ollama"
          ]
        }
      ]
    },
    {
      id: "pillar-core-concepts",
      name: "Core Tech Concepts Made Dead Simple",
      weight: 0.30,
      description: "Demystifying complex computer science and AI concepts with intuitive visual analogies and step-by-step clarity.",
      subPillars: [
        {
          id: "sub-mental-models",
          name: "Intuitive Mental Models",
          description: "Explaining difficult topics like embeddings, attention mechanisms, and tokenization without math intimidation.",
          sampleTopics: [
            "Embeddings explained in 60 seconds using a supermarket aisle analogy",
            "Why LLMs cannot do math reliably: Understanding token-level prediction",
            "WebSockets vs HTTP vs WebRTC: Which one should your project use?",
            "What happens under the hood when you hit 'Generate' on an AI model"
          ]
        },
        {
          id: "sub-system-design-basics",
          name: "Practical System Design",
          description: "Fundamental architecture patterns for building scalable, reliable web applications.",
          sampleTopics: [
            "Rate limiting explained: How to protect your API from crashing",
            "Database indexing: Why a single index can speed up queries 100x",
            "Stateful vs Stateless servers: The mental shift to Cloudflare Workers"
          ]
        }
      ]
    },
    {
      id: "pillar-career-skills",
      name: "Developer Career & Learning Roadmaps",
      weight: 0.20,
      description: "Actionable roadmaps, portfolio project ideas, and interview preparation for aspiring tech talent.",
      subPillars: [
        {
          id: "sub-roadmap-guides",
          name: "The 2026 AI Developer Roadmap",
          description: "Curated learning paths that cut through tutorial noise and focus on high-market-value engineering skills.",
          sampleTopics: [
            "3 real-world AI projects that will actually get your resume noticed in 2026",
            "Stop doing basic tutorial clones: Build this multi-modal agent instead",
            "The 5 fundamental skills every junior developer needs to become indispensable"
          ]
        }
      ]
    },
    {
      id: "pillar-myths-bugs",
      name: "Tech Mythbusters & Debugging Tales",
      weight: 0.20,
      description: "Busting common developer misconceptions, fixing beginner pitfalls, and sharing real debugging wisdom.",
      subPillars: [
        {
          id: "sub-mythbusters",
          name: "Common Pitfalls & Mistakes",
          description: "Relatable coding habits that secretly break production apps.",
          sampleTopics: [
            "Why junior devs use useEffect for everything (and why you should stop)",
            "The top 3 security mistakes developers make with API keys",
            "Async/Await traps: Why Promise.all can save your server from crawling"
          ]
        }
      ]
    }
  ],
  voice: {
    primaryLanguage: "Hinglish",
    allowedLanguages: ["Hinglish", "English", "Hindi"],
    toneDescriptors: [
      "Friendly and encouraging",
      "Teacher who treats you like an equal",
      "Clear, engaging, and high energy",
      "Relatable with authentic Indian tech ecosystem context",
      "Focused on 'how things actually work' rather than dry theory"
    ],
    vocabularyDo: [
      "Chalo samajhte hain",
      "Under the hood",
      "Mental model",
      "Real-world breakdown",
      "Simple analogy",
      "Step-by-step",
      "Practical project",
      "Quick tip"
    ],
    vocabularyDont: [
      "Needless academic jargon",
      "Condescending corrections",
      "Dry textbook definitions",
      "Unverified rumors"
    ],
    bannedClichés: [
      "Coding is easy if you just try",
      "Become a 10x engineer overnight",
      "AI will take all our jobs tomorrow"
    ],
    hinglishMixRatio: 0.40
  },
  visualIdentity: {
    preferredFamilies: [
      "3d",
      "3d-isometric",
      "stylized-3d-character",
      "premium-illustration",
      "human-centric",
      "infographic-concept",
      "Indian-business",
      "technology-concept"
    ],
    restrictedFamilies: [
      "bold-abstract",
      "minimal-corporate"
    ],
    colorPalette: {
      primary: "#4338CA", // Indigo violet
      secondary: "#06B6D4", // Electric cyan
      accents: ["#F59E0B", "#10B981", "#EC4899"],
      mood: "Vibrant, educational, clean, visually engaging with warm studio lighting and high-contrast focal objects."
    },
    lightingPreference: "Warm diffuse key light with colorful secondary rim lighting (cyan and amber) for a contemporary tech feel.",
    environmentPreference: "Modern co-working spaces, clean student tech labs, vibrant isometric creator desks, and friendly collaborative coding studios.",
    logoPosition: "Bottom Right",
    brandingDefault: "Subtle watermark"
  },
  safetyRules: [
    { id: "inno-rule-1", rule: "Never share dangerous code snippets (e.g. vulnerable SQL injections without warning).", category: "text" },
    { id: "inno-rule-2", rule: "Never include text, letters, code snippets or watermarks directly inside the raw generated visual.", category: "visual" },
    { id: "inno-rule-3", rule: "Maintain an inclusive, encouraging tone; never mock beginners or students for basic questions.", category: "tone" },
    { id: "inno-rule-4", rule: "Always ensure technical claims are verified and accurate.", category: "claim" }
  ],
  ctaStrategies: [
    {
      objective: "education",
      primaryCta: "Save this post for your next coding session! Tag a fellow dev who needs to see this.",
      placement: "end-of-caption"
    },
    {
      objective: "problem-solution",
      primaryCta: "Have you faced this issue before in your code? Comment your experience below!",
      placement: "end-of-caption"
    },
    {
      objective: "thought-leadership",
      primaryCta: "Follow InnoTech for daily, bite-sized tech breakdowns and practical AI roadmaps.",
      placement: "end-of-caption"
    }
  ],
  formatPreferences: {
    postAspectRatio: "1:1",
    reelDurationSeconds: 45,
    reelSceneCount: 5,
    preferredStoryRatio: "9:16"
  },
  schedulePolicy: {
    postTimeLocal: "13:00",
    reelTimeLocal: "19:00",
    timezone: "Asia/Kolkata"
  }
};

// Extensible brand registry with in-memory storage + D1 synchronization
const BRAND_REGISTRY = new Map<string, BrandProfile>();

BRAND_REGISTRY.set("Zawaago", ZAWAAGO_PROFILE);
BRAND_REGISTRY.set("zawaago", ZAWAAGO_PROFILE);
BRAND_REGISTRY.set("InnoTech", INNOTECH_PROFILE);
BRAND_REGISTRY.set("innotech", INNOTECH_PROFILE);

export function getBrandProfile(brandName: string): BrandProfile {
  const normalized = brandName.trim();
  const profile = BRAND_REGISTRY.get(normalized) || BRAND_REGISTRY.get(normalized.toLowerCase());
  if (profile) return profile;
  // Fallback to Zawaago if unknown
  return ZAWAAGO_PROFILE;
}

export function listRegisteredBrands(): BrandProfile[] {
  const unique = new Map<string, BrandProfile>();
  for (const profile of BRAND_REGISTRY.values()) {
    unique.set(profile.name, profile);
  }
  return Array.from(unique.values());
}

export function registerBrand(profile: BrandProfile): void {
  BRAND_REGISTRY.set(profile.name, profile);
  BRAND_REGISTRY.set(profile.name.toLowerCase(), profile);
}

export function updateBrandProfile(brandName: string, updates: Partial<BrandProfile>): BrandProfile {
  const current = getBrandProfile(brandName);
  const updated: BrandProfile = {
    ...current,
    ...updates,
    pillars: updates.pillars || current.pillars,
    voice: updates.voice ? { ...current.voice, ...updates.voice } : current.voice,
    visualIdentity: updates.visualIdentity ? { ...current.visualIdentity, ...updates.visualIdentity } : current.visualIdentity
  };
  registerBrand(updated);
  return updated;
}
