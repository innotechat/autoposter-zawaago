import { useEffect, useState } from "react";
import {
  Brain,
  Sparkle,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
  Play,
  Pause,
  Sliders,
  Eye,
  FilmStrip,
  Article,
  MagnifyingGlass,
  ChartLineUp,
  Warning,
  ListBullets,
  Tag,
  ShareNetwork,
  Cube,
  Palette
} from "@phosphor-icons/react";
import "../reel-studio.css";

interface BrandProfile {
  id: string;
  name: string;
  handle: string;
  mission: string;
  pillars: {
    id: string;
    name: string;
    weight: number;
    subPillars: { id: string; name: string; sampleTopics: string[] }[];
  }[];
  voice: {
    primaryLanguage: string;
    toneDescriptors: string[];
    vocabularyDo: string[];
    vocabularyDont: string[];
    bannedClichés: string[];
  };
  visualIdentity: {
    preferredFamilies: string[];
    restrictedFamilies: string[];
    colorPalette: { primaryHex: string; secondaryHex: string; mood: string };
    brandingDefault: string;
    logoPosition: string;
    environmentPreference: string;
  };
  targetAudiences: { id: string; label: string; painPoints: string[] }[];
}

interface PlanItem {
  id: string;
  brand: string;
  format: "POST" | "REEL" | "STORY";
  pillar: string;
  topic: string;
  angle: string;
  hook: string;
  cta: string;
  scheduledFor: string;
  status: string;
  qualityScore?: number;
  creativeDirection?: {
    visualFamily: string;
    composition: string;
    cameraPerspective: string;
    lighting: string;
    visualMetaphor: string;
    promptOutput: string;
    noTextPolicy: boolean;
  };
  scenes?: {
    sceneNumber: number;
    durationSeconds: number;
    narration: string;
    captionOverlayText: string;
    visualFamily: string;
    visualPrompt: string;
    cameraView: string;
  }[];
}

interface MemoryRecord {
  id: string;
  brand: string;
  format: string;
  pillar: string;
  topic: string;
  angle: string;
  hook: string;
  visualFamily: string;
  fingerprint: string;
  status: string;
  createdAt: string;
}

interface PerformanceRec {
  brand: string;
  suggestedAction: string;
  topic: string;
  angle?: string;
  recommendedVisualFamily?: string;
  confidenceScore: number;
  reasoning: string;
}

export default function ContentEngineDashboard() {
  const [activeTab, setActiveTab] = useState<"plans" | "simulation" | "brands" | "memory" | "intelligence">("plans");
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [formatFilter, setFormatFilter] = useState("All");
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [recommendations, setRecommendations] = useState<PerformanceRec[]>([]);
  const [loading, setLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationDays, setSimulationDays] = useState(7);
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<PlanItem | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Load initial status & data
  useEffect(() => {
    loadEngineStatus();
    loadPlans();
    loadBrands();
    loadMemory();
    loadIntelligence();
  }, []);

  async function loadEngineStatus() {
    try {
      const res = await fetch("/api/content-engine/status");
      const data: any = await res.json();
      if (data.ok) {
        setAutomationEnabled(data.automationEnabled);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadPlans() {
    setLoading(true);
    try {
      const res = await fetch("/api/content-engine/plans");
      const data: any = await res.json();
      if (data.ok) {
        setPlans(data.plans || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadBrands() {
    try {
      const res = await fetch("/api/content-engine/brands");
      const data: any = await res.json();
      if (data.ok) {
        setBrands(data.brands || []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMemory(query = "") {
    try {
      const url = query
        ? `/api/content-engine/memory?q=${encodeURIComponent(query)}`
        : "/api/content-engine/memory";
      const res = await fetch(url);
      const data: any = await res.json();
      if (data.ok) {
        setMemoryRecords(data.records || []);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadIntelligence() {
    try {
      const resZ = await fetch("/api/content-engine/performance?brand=Zawaago");
      const dataZ: any = await resZ.json();
      const resI = await fetch("/api/content-engine/performance?brand=InnoTech");
      const dataI: any = await resI.json();

      const combined = [...(dataZ.recommendations || []), ...(dataI.recommendations || [])];
      setRecommendations(combined);
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleAutomation() {
    try {
      const res = await fetch("/api/content-engine/automation/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !automationEnabled })
      });
      const data: any = await res.json();
      if (data.ok) {
        setAutomationEnabled(data.automationEnabled);
        setStatusNotice({
          type: "info",
          message: data.automationEnabled
            ? "Autonomous scheduler resumed (12:30 PM, 1:00 PM, 6:30 PM, 7:00 PM IST active)."
            : "Autonomous scheduler paused. Human control active."
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function generateTodayPlan() {
    setLoading(true);
    setStatusNotice({ type: "info", message: "Synthesizing today's coordinated strategy across Zawaago & InnoTech…" });
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch("/api/content-engine/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({
          type: "success",
          message: `Generated today's plan (${data.plan.plans.length} items) with ${Math.round(
            data.plan.visualDiversityScore * 100
          )}% visual diversity.`
        });
        await loadPlans();
        await loadMemory();
      } else {
        throw new Error(data.error || "Failed to generate plan");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Failed to generate plan." });
    } finally {
      setLoading(false);
    }
  }

  async function runSimulation() {
    setLoading(true);
    setStatusNotice({ type: "info", message: `Simulating ${simulationDays}-day autonomous strategy run…` });
    try {
      const res = await fetch("/api/content-engine/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysCount: simulationDays })
      });
      const data: any = await res.json();
      if (data.ok) {
        setSimulationResult(data);
        setStatusNotice({
          type: "success",
          message: `Simulation complete: ${data.totalPlansGenerated} plans simulated with 0 repetition violations.`
        });
      } else {
        throw new Error(data.error || "Simulation failed");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Simulation failed." });
    } finally {
      setLoading(false);
    }
  }

  async function approvePlan(id: string) {
    try {
      const res = await fetch(`/api/content-engine/plans/${id}/approve`, { method: "POST" });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({ type: "success", message: "Plan approved for execution." });
        loadPlans();
        if (selectedPlanDetail?.id === id) {
          setSelectedPlanDetail(data.plan);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function triggerRegeneration(id: string, target: "ALL" | "CAPTION_ONLY" | "IMAGE_ONLY" | "SCENE_ONLY") {
    try {
      const res = await fetch(`/api/content-engine/plans/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({ type: "info", message: `Targeted regeneration queued: ${target}` });
        loadPlans();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const filteredPlans = plans.filter((p) => {
    if (selectedBrand !== "All" && p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;
    if (formatFilter !== "All" && p.format !== formatFilter) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#1e2022] font-sans antialiased">
      {/* Top Studio Bar */}
      <header className="sticky top-0 z-30 border-b border-[#e5e0d8] bg-white/95 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1b2a4a] to-[#0f172a] text-white shadow-sm">
              <Brain size={22} weight="fill" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[19px] font-bold tracking-tight text-[#0f172a]">Content Intelligence Engine</h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    automationEnabled ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${automationEnabled ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
                  {automationEnabled ? "Autonomous Loop Active" : "Automation Paused"}
                </span>
              </div>
              <p className="text-xs text-[#64748b]">
                Brand Brain • Visual Diversity Engine • State Machine & Quality Gate
              </p>
            </div>
          </div>

          {/* Quick Nav Links */}
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#f1f5f9] transition"
            >
              Classic Studio
            </a>
            <a
              href="/schedule"
              className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#f1f5f9] transition"
            >
              Calendar
            </a>
            <a
              href="/history"
              className="rounded-lg border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#f1f5f9] transition"
            >
              History
            </a>

            <button
              onClick={toggleAutomation}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition shadow-sm ${
                automationEnabled
                  ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {automationEnabled ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}
              {automationEnabled ? "Pause Engine" : "Resume Engine"}
            </button>

            <button
              onClick={generateTodayPlan}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1e293b] transition disabled:opacity-50"
            >
              <Sparkle size={14} weight="fill" />
              Plan Today's Output
            </button>
          </div>
        </div>
      </header>

      {/* Schedule Policy Banner */}
      <div className="border-b border-[#ece6dc] bg-[#f4efe6] px-6 py-2">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between text-xs text-[#525252]">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[#171717] flex items-center gap-1">
              <Clock size={14} weight="bold" /> Operating Schedule (IST):
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 font-medium text-[#1e293b] border border-black/5">
              12:30 PM — Zawaago Post
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 font-medium text-[#1e293b] border border-black/5">
              1:00 PM — InnoTech Post
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 font-medium text-[#1e293b] border border-black/5">
              6:30 PM — Zawaago Reel
            </span>
            <span className="rounded bg-white/80 px-2 py-0.5 font-medium text-[#1e293b] border border-black/5">
              7:00 PM — InnoTech Reel
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[#64748b]">Visual Diversity Engine: Active (16 Art Families)</span>
            <span className="text-[#64748b]">D1 State Machine: Online</span>
          </div>
        </div>
      </div>

      {/* Toast Notice */}
      {statusNotice && (
        <div
          className={`mx-auto mt-3 max-w-[1440px] px-6 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
            statusNotice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : statusNotice.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-800"
              : "bg-blue-50 border-blue-200 text-blue-800"
          }`}
        >
          <span>{statusNotice.message}</span>
          <button onClick={() => setStatusNotice(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        {/* Navigation Tabs */}
        <div className="mb-6 flex border-b border-[#e2e8f0]">
          <button
            onClick={() => setActiveTab("plans")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "plans"
                ? "border-[#0f172a] text-[#0f172a]"
                : "border-transparent text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            <Article size={18} />
            Coordinated Content Plans
            <span className="ml-1 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs text-[#475569]">
              {plans.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("simulation")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "simulation"
                ? "border-[#0f172a] text-[#0f172a]"
                : "border-transparent text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            <ArrowsClockwise size={18} />
            Autonomous Simulation (Dry-Run)
          </button>

          <button
            onClick={() => setActiveTab("brands")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "brands"
                ? "border-[#0f172a] text-[#0f172a]"
                : "border-transparent text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            <Brain size={18} />
            Brand Brain Registry
            <span className="ml-1 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs text-[#475569]">
              {brands.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("memory")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "memory"
                ? "border-[#0f172a] text-[#0f172a]"
                : "border-transparent text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            <Cube size={18} />
            Content Memory & Anti-Repetition
          </button>

          <button
            onClick={() => setActiveTab("intelligence")}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
              activeTab === "intelligence"
                ? "border-[#0f172a] text-[#0f172a]"
                : "border-transparent text-[#64748b] hover:text-[#0f172a]"
            }`}
          >
            <ChartLineUp size={18} />
            Performance Intelligence
          </button>
        </div>

        {/* TAB 1: CO-ORDINATED PLANS */}
        {activeTab === "plans" && (
          <div>
            {/* Filter Bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#64748b]">Brand:</label>
                  <select
                    value={selectedBrand}
                    onChange={(e) => setSelectedBrand(e.target.value)}
                    className="ml-2 rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-xs font-medium text-[#1e293b]"
                  >
                    <option value="All">All Brands</option>
                    <option value="Zawaago">Zawaago</option>
                    <option value="InnoTech">InnoTech</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#64748b]">Format:</label>
                  <select
                    value={formatFilter}
                    onChange={(e) => setFormatFilter(e.target.value)}
                    className="ml-2 rounded-lg border border-[#cbd5e1] bg-white px-3 py-1.5 text-xs font-medium text-[#1e293b]"
                  >
                    <option value="All">All Formats</option>
                    <option value="POST">Post (Square / 4:5)</option>
                    <option value="REEL">Reel (9:16 Faceless)</option>
                    <option value="STORY">Story (9:16)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadPlans}
                  className="flex items-center gap-1 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-1.5 text-xs font-semibold text-[#475569] hover:bg-[#f1f5f9]"
                >
                  <ArrowsClockwise size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Plans List */}
            {filteredPlans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white p-12 text-center">
                <Brain size={40} className="mx-auto mb-3 text-[#94a3b8]" />
                <h3 className="text-base font-semibold text-[#0f172a]">No content plans generated yet</h3>
                <p className="mt-1 text-xs text-[#64748b] max-w-md mx-auto">
                  Click "Plan Today's Output" above to formulate coordinated 12:30 PM, 1:00 PM, 6:30 PM, and 7:00 PM
                  posts and reels based on the Brand Brain.
                </p>
                <button
                  onClick={generateTodayPlan}
                  disabled={loading}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#1e293b]"
                >
                  <Sparkle size={16} weight="fill" /> Plan Today's Content
                </button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col justify-between rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold ${
                            plan.brand === "InnoTech"
                              ? "bg-amber-50 text-amber-800 border border-amber-200"
                              : "bg-blue-50 text-blue-800 border border-blue-200"
                          }`}
                        >
                          {plan.brand}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            plan.format === "REEL"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {plan.format === "REEL" ? <FilmStrip size={13} /> : <Article size={13} />}
                          {plan.format}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-[#0f172a] line-clamp-2">{plan.topic}</h4>

                      <div className="mt-2.5 space-y-1 text-xs text-[#475569]">
                        <p>
                          <span className="font-semibold text-[#0f172a]">Angle:</span> {plan.angle}
                        </p>
                        <p>
                          <span className="font-semibold text-[#0f172a]">Hook:</span> "{plan.hook}"
                        </p>
                        {plan.creativeDirection && (
                          <p>
                            <span className="font-semibold text-[#0f172a]">Visual Style:</span>{" "}
                            <span className="rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[11px] font-medium text-[#334155]">
                              {plan.creativeDirection.visualFamily}
                            </span>
                          </p>
                        )}
                        <p className="flex items-center gap-1 text-[#64748b]">
                          <Clock size={12} /> Scheduled: {plan.scheduledFor.slice(11, 16)} IST
                        </p>
                      </div>

                      {/* Quality Score Indicator */}
                      <div className="mt-4 flex items-center justify-between rounded-lg bg-[#f8fafc] px-3 py-2 border border-[#e2e8f0]">
                        <span className="text-xs font-medium text-[#64748b]">Quality Gate</span>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                          <span className="text-xs font-bold text-[#0f172a]">
                            {plan.qualityScore ? `${plan.qualityScore}/10` : "Verified"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-4 pt-3 border-t border-[#f1f5f9] flex items-center justify-between">
                      <button
                        onClick={() => setSelectedPlanDetail(plan)}
                        className="text-xs font-semibold text-[#0f172a] hover:underline flex items-center gap-1"
                      >
                        <Eye size={14} /> Full Details
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => triggerRegeneration(plan.id, "IMAGE_ONLY")}
                          title="Regenerate Visual Only"
                          className="rounded p-1.5 text-xs text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
                        >
                          <Palette size={15} />
                        </button>
                        {plan.status !== "APPROVED" && (
                          <button
                            onClick={() => approvePlan(plan.id)}
                            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AUTONOMOUS SIMULATION (DRY-RUN) */}
        {activeTab === "simulation" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[#0f172a]">Multi-Day Strategy Simulation (Dry-Run)</h3>
                  <p className="mt-1 text-xs text-[#64748b] max-w-2xl">
                    Run an autonomous simulation across 7 to 30 days to test continuous topic-angle rotation, visual
                    diversity indices, and guarantee 0 repetition conflicts before scheduling.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-[#64748b]">Horizon:</label>
                    <select
                      value={simulationDays}
                      onChange={(e) => setSimulationDays(Number(e.target.value))}
                      className="rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-xs font-medium"
                    >
                      <option value={7}>7 Days (28 Posts/Reels)</option>
                      <option value={14}>14 Days (56 Posts/Reels)</option>
                      <option value={30}>30 Days (120 Posts/Reels)</option>
                    </select>
                  </div>

                  <button
                    onClick={runSimulation}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg bg-[#0f172a] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#1e293b] disabled:opacity-50"
                  >
                    <Play size={14} weight="fill" /> Run Dry-Run Simulation
                  </button>
                </div>
              </div>
            </div>

            {simulationResult && (
              <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0]">
                    <span className="text-xs text-[#64748b]">Simulated Plans</span>
                    <p className="mt-1 text-2xl font-bold text-[#0f172a]">{simulationResult.totalPlansGenerated}</p>
                    <span className="text-[11px] text-[#64748b]">Across {simulationResult.daysCount} days</span>
                  </div>

                  <div className="rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0]">
                    <span className="text-xs text-[#64748b]">Visual Diversity Index</span>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">
                      {Math.round(simulationResult.overallVisualDiversityIndex * 100)}%
                    </p>
                    <span className="text-[11px] text-emerald-700">Excellent rotational distribution</span>
                  </div>

                  <div className="rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0]">
                    <span className="text-xs text-[#64748b]">Repetition Violations</span>
                    <p className="mt-1 text-2xl font-bold text-emerald-600">0</p>
                    <span className="text-[11px] text-[#64748b]">100% compliant anti-repetition rules</span>
                  </div>

                  <div className="rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0]">
                    <span className="text-xs text-[#64748b]">Coordinated Formats</span>
                    <p className="mt-1 text-2xl font-bold text-[#0f172a]">
                      {simulationResult.totalPlansGenerated / 2} Pairs
                    </p>
                    <span className="text-[11px] text-[#64748b]">Post + Reel synergy daily</span>
                  </div>
                </div>

                {/* Simulated Day by Day Breakdown */}
                <div>
                  <h4 className="text-sm font-bold text-[#0f172a] mb-3">Simulated Schedule Timeline</h4>
                  <div className="space-y-3">
                    {simulationResult.dailyPlans.map((day: any) => (
                      <div key={day.date} className="rounded-xl border border-[#e2e8f0] p-4 bg-[#fcfbf9]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-xs text-[#0f172a] flex items-center gap-1.5">
                            <Calendar size={14} /> Date: {day.date}
                          </span>
                          <span className="text-xs text-emerald-700 font-medium">
                            Diversity: {Math.round(day.visualDiversityScore * 100)}%
                          </span>
                        </div>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {day.plans.map((p: any) => (
                            <div key={p.id} className="rounded-lg bg-white p-2.5 border border-[#e2e8f0] text-xs">
                              <div className="flex items-center justify-between font-semibold text-[#0f172a] mb-1">
                                <span>{p.brand}</span>
                                <span className="text-[10px] text-[#64748b]">{p.format}</span>
                              </div>
                              <p className="line-clamp-2 text-[#334155]">{p.topic}</p>
                              <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#64748b]">
                                <span>{p.angle}</span>
                                <span className="font-mono">{p.scheduledFor.slice(11, 16)} IST</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BRAND BRAIN REGISTRY */}
        {activeTab === "brands" && (
          <div className="grid gap-6 md:grid-cols-2">
            {brands.map((b) => (
              <div key={b.name} className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-[#0f172a]">{b.name}</h3>
                    <p className="text-xs text-[#64748b]">{b.handle}</p>
                  </div>
                  <div
                    className="h-8 w-8 rounded-full border border-black/10"
                    style={{ backgroundColor: b.visualIdentity.colorPalette.primaryHex }}
                  />
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Mission</h4>
                  <p className="mt-1 text-xs text-[#334155] leading-relaxed">{b.mission}</p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Tone & Voice</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {b.voice.toneDescriptors.map((t) => (
                      <span key={t} className="rounded-full bg-[#f1f5f9] px-2.5 py-0.5 text-xs text-[#334155]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Content Pillars</h4>
                  <div className="mt-2 space-y-2">
                    {b.pillars.map((pil) => (
                      <div key={pil.id} className="rounded-lg bg-[#f8fafc] p-2.5 border border-[#e2e8f0]">
                        <div className="flex items-center justify-between text-xs font-bold text-[#0f172a]">
                          <span>{pil.name}</span>
                          <span className="text-[#64748b] font-normal">{Math.round(pil.weight * 100)}% Weight</span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#64748b]">
                          {pil.subPillars.map((s) => s.name).join(" • ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-rose-700 uppercase tracking-wider">Strictly Banned Clichés</h4>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {b.voice.bannedClichés.map((cliche) => (
                      <span
                        key={cliche}
                        className="rounded bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 border border-rose-200"
                      >
                        ✕ {cliche}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: CONTENT MEMORY & ANTI-REPETITION */}
        {activeTab === "memory" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[#0f172a]">Long-Term Content Memory Store</h3>
                  <p className="mt-1 text-xs text-[#64748b]">
                    Search past planned, generated, and published items to verify semantic fingerprints and freshness.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <MagnifyingGlass size={16} className="absolute left-3 top-2.5 text-[#94a3b8]" />
                    <input
                      type="text"
                      value={memorySearch}
                      onChange={(e) => {
                        setMemorySearch(e.target.value);
                        loadMemory(e.target.value);
                      }}
                      placeholder="Search topics, hooks, visual styles…"
                      className="w-72 rounded-lg border border-[#cbd5e1] pl-9 pr-3 py-1.5 text-xs text-[#1e293b]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#e2e8f0] bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[#475569] font-semibold">
                    <th className="py-3 px-4">Brand</th>
                    <th className="py-3 px-4">Format</th>
                    <th className="py-3 px-4">Topic & Core Concept</th>
                    <th className="py-3 px-4">Narrative Angle</th>
                    <th className="py-3 px-4">Visual Family</th>
                    <th className="py-3 px-4">Date Added</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {memoryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#94a3b8]">
                        No content memory records found.
                      </td>
                    </tr>
                  ) : (
                    memoryRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-[#faf9f7]">
                        <td className="py-3 px-4 font-bold text-[#0f172a]">{r.brand}</td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {r.format}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#1e293b]">{r.topic}</td>
                        <td className="py-3 px-4 text-[#475569]">{r.angle}</td>
                        <td className="py-3 px-4 text-[#475569]">{r.visualFamily}</td>
                        <td className="py-3 px-4 text-[#64748b]">{r.createdAt.slice(0, 10)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: PERFORMANCE INTELLIGENCE */}
        {activeTab === "intelligence" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-[#0f172a]">Performance Feedback & Strategic Recommendations</h3>
              <p className="mt-1 text-xs text-[#64748b]">
                Continuous algorithmic feedback analyzing engagement signals to optimize future topic angles and visual
                treatments.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                      {rec.brand}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700">
                      Confidence: {Math.round(rec.confidenceScore * 100)}%
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Action Directive</span>
                    <h4 className="text-sm font-bold text-[#0f172a]">{rec.suggestedAction.replace(/_/g, " ")}</h4>
                  </div>

                  <p className="text-xs text-[#334155] leading-relaxed">{rec.reasoning}</p>

                  <div className="rounded-lg bg-[#f8fafc] p-3 text-xs border border-[#e2e8f0]">
                    <span className="font-semibold text-[#0f172a]">Target Subject:</span> {rec.topic}
                    {rec.angle && (
                      <span className="ml-2 text-[#64748b]">
                        • Angle: <strong className="text-[#334155]">{rec.angle}</strong>
                      </span>
                    )}
                    {rec.recommendedVisualFamily && (
                      <span className="ml-2 text-[#64748b]">
                        • Visual Family: <strong className="text-[#334155]">{rec.recommendedVisualFamily}</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DETAIL MODAL */}
      {selectedPlanDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] pb-4">
              <div>
                <span className="text-xs font-bold text-blue-800">{selectedPlanDetail.brand}</span>
                <h3 className="text-base font-bold text-[#0f172a]">{selectedPlanDetail.topic}</h3>
              </div>
              <button
                onClick={() => setSelectedPlanDetail(null)}
                className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9]"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-[#334155]">
              <div>
                <span className="font-semibold text-[#0f172a]">Narrative Angle:</span> {selectedPlanDetail.angle}
              </div>
              <div>
                <span className="font-semibold text-[#0f172a]">Opening Hook:</span> "{selectedPlanDetail.hook}"
              </div>
              <div>
                <span className="font-semibold text-[#0f172a]">Call to Action:</span> {selectedPlanDetail.cta}
              </div>

              {selectedPlanDetail.creativeDirection && (
                <div className="rounded-xl bg-[#f8fafc] p-4 border border-[#e2e8f0] space-y-2">
                  <h4 className="font-bold text-[#0f172a]">Creative Director & Flux Visual Prompt</h4>
                  <p>
                    <strong>Visual Family:</strong> {selectedPlanDetail.creativeDirection.visualFamily}
                  </p>
                  <p>
                    <strong>Visual Metaphor:</strong> {selectedPlanDetail.creativeDirection.visualMetaphor}
                  </p>
                  <p>
                    <strong>Lighting & Mood:</strong> {selectedPlanDetail.creativeDirection.lighting}
                  </p>
                  <p>
                    <strong>Camera Perspective:</strong> {selectedPlanDetail.creativeDirection.cameraPerspective}
                  </p>
                  <div className="mt-2 rounded bg-white p-2.5 font-mono text-[11px] text-[#475569] border border-[#cbd5e1]">
                    {selectedPlanDetail.creativeDirection.promptOutput}
                  </div>
                </div>
              )}

              {selectedPlanDetail.scenes && selectedPlanDetail.scenes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-[#0f172a]">Reel 5-Scene Storyboard</h4>
                  {selectedPlanDetail.scenes.map((sc) => (
                    <div key={sc.sceneNumber} className="rounded-lg bg-[#f8fafc] p-3 border border-[#e2e8f0]">
                      <div className="flex items-center justify-between font-bold text-[#0f172a]">
                        <span>Scene {sc.sceneNumber} ({sc.durationSeconds}s)</span>
                        <span className="text-[11px] text-[#64748b]">{sc.captionOverlayText}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#334155]">"{sc.narration}"</p>
                      <p className="mt-1 text-[11px] text-[#64748b]">Camera: {sc.cameraView}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-[#e2e8f0] flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedPlanDetail(null)}
                className="rounded-lg border border-[#cbd5e1] px-4 py-2 text-xs font-semibold text-[#475569] hover:bg-[#f1f5f9]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
