import { useEffect, useMemo, useState } from "react";
import {
  ArrowClockwise,
  ArrowRight,
  Article,
  Brain,
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  Cube,
  Eye,
  FacebookLogo,
  FilmStrip,
  GearSix,
  ListBullets,
  MagnifyingGlass,
  Palette,
  Pause,
  Play,
  ShareNetwork,
  Sliders,
  Sparkle,
  SpinnerGap,
  Tag,
  WarningCircle,
  X
} from "@phosphor-icons/react";
import "../app.css";

interface PlanItem {
  id: string;
  brand: string;
  format: "POST" | "REEL" | "STORY";
  pillar: string;
  subPillar?: string;
  topic: string;
  angle: string;
  hook: string;
  captionBrief?: string;
  cta: string;
  targetAudience?: string;
  language?: string;
  scheduledFor: string;
  status: string;
  qualityScore?: number;
  generatedCaption?: string;
  generatedImageUrl?: string;
  generatedVideoUrl?: string;
  facebookPostId?: string;
  facebookVideoId?: string;
  publishedAt?: string;
  dayIndex?: number;
  planBatchId?: string;
  creativeDirection?: {
    visualFamily: string;
    composition: string;
    cameraPerspective?: string;
    lighting?: string;
    visualMetaphor: string;
    promptOutput: string;
    noTextPolicy?: boolean;
  };
  scenes?: {
    sceneNumber: number;
    durationSeconds: number;
    narration: string;
    captionOverlayText: string;
    visualFamily: string;
    visualPrompt: string;
    imageUrl?: string;
  }[];
}

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
  };
  visualIdentity: {
    preferredFamilies: string[];
    restrictedFamilies: string[];
    brandingDefault: string;
    logoPosition: string;
  };
  targetAudiences: { id: string; label: string; painPoints: string[] }[];
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

interface ContentJobItem {
  id: string;
  planId: string;
  brand: string;
  format: string;
  state: string;
  retryCount: number;
  maxRetries: number;
  currentStep: string;
  facebookPostId?: string;
  errorMessage?: string;
  updatedAt: string;
}

export default function ContentEngineDashboard() {
  const [activeTab, setActiveTab] = useState<"calendar" | "jobs" | "brands" | "memory" | "simulation">("calendar");
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [jobs, setJobs] = useState<ContentJobItem[]>([]);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<"All" | "Zawaago" | "InnoTech">("All");
  const [formatFilter, setFormatFilter] = useState<"All" | "POST" | "REEL">("All");
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | "All">("All");
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulationDays, setSimulationDays] = useState(30);
  const [selectedPlanDetail, setSelectedPlanDetail] = useState<PlanItem | null>(null);
  const [statusNotice, setStatusNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  useEffect(() => {
    loadEngineStatus();
    loadPlans();
    loadJobs();
    loadBrands();
    loadMemory();
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

  async function loadJobs() {
    try {
      const res = await fetch("/api/content-engine/jobs");
      const data: any = await res.json();
      if (data.ok) {
        setJobs(data.jobs || []);
      }
    } catch (e) {
      console.error(e);
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
            ? "Autonomous scheduler resumed (Zawaago & InnoTech daily posting schedule active)."
            : "Autonomous scheduler paused. Manual human control active."
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function generate10DayCalendar() {
    setActionInProgress("planning-10-days");
    setStatusNotice({
      type: "info",
      message: "Generating 10-day intelligent strategy across Zawaago & InnoTech with anti-repetition memory…"
    });
    try {
      const res = await fetch("/api/content-engine/plan-10-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brands: ["Zawaago", "InnoTech"] })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({
          type: "success",
          message: `Generated 10-Day Plan (${data.totalPlans} items) with ${(
            data.overallVisualDiversityIndex * 100
          ).toFixed(0)}% visual diversity. Persisted in D1 database.`
        });
        await loadPlans();
        await loadJobs();
        await loadMemory();
      } else {
        throw new Error(data.error || "Failed to generate 10-day plan");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Failed to generate 10-day plan." });
    } finally {
      setActionInProgress(null);
    }
  }

  async function executeTodayQueue(publishNow = true) {
    setActionInProgress("executing-today");
    const today = new Date().toISOString().slice(0, 10);
    setStatusNotice({
      type: "info",
      message: `Running autonomous daily pipeline for ${today} (Generate → Quality Gate → Ready → Facebook Publish)…`
    });
    try {
      const res = await fetch("/api/content-engine/execute-daily-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: today, publishNow })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({
          type: "success",
          message: `Daily queue executed: ${data.successful} processed, ${data.skipped} skipped (already published), ${data.failed} failed.`
        });
        await loadPlans();
        await loadJobs();
      } else {
        throw new Error(data.error || "Daily queue execution failed");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Execution failed." });
    } finally {
      setActionInProgress(null);
    }
  }

  async function executeSingleItem(id: string, publishNow = true) {
    setActionInProgress(`exec-${id}`);
    setStatusNotice({
      type: "info",
      message: "Executing item pipeline (Generate Media → Quality Gate → Ready → Facebook Publish)…"
    });
    try {
      const res = await fetch(`/api/content-engine/execute-item/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishNow })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({
          type: "success",
          message: data.message || `Item pipeline completed: ${data.status}`
        });
        await loadPlans();
        await loadJobs();
        if (selectedPlanDetail?.id === id) {
          const updated = plans.find((p) => p.id === id);
          if (updated) setSelectedPlanDetail(updated);
        }
      } else {
        throw new Error(data.error || "Execution failed");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Item execution failed." });
    } finally {
      setActionInProgress(null);
    }
  }

  async function retryJob(id: string) {
    setActionInProgress(`retry-${id}`);
    setStatusNotice({
      type: "info",
      message: "Safely retrying job from uncompleted stage without duplicate publishing…"
    });
    try {
      const res = await fetch(`/api/content-engine/retry-job/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publishNow: true })
      });
      const data: any = await res.json();
      if (data.ok) {
        setStatusNotice({
          type: "success",
          message: data.message || "Job retry completed successfully."
        });
        await loadPlans();
        await loadJobs();
      } else {
        throw new Error(data.error || "Retry failed");
      }
    } catch (e: any) {
      setStatusNotice({ type: "error", message: e.message || "Retry failed." });
    } finally {
      setActionInProgress(null);
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
          message: `Simulation complete: ${data.totalPlansGenerated} plans simulated across 30 days with 0 repetition violations.`
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

  // Filter plans
  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (selectedBrand !== "All" && p.brand.toLowerCase() !== selectedBrand.toLowerCase()) return false;
      if (formatFilter !== "All" && p.format !== formatFilter) return false;
      if (selectedDayFilter !== "All" && p.dayIndex !== selectedDayFilter) return false;
      return true;
    });
  }, [plans, selectedBrand, formatFilter, selectedDayFilter]);

  // Statistics
  const stats = useMemo(() => {
    const published = plans.filter((p) => p.status === "PUBLISHED").length;
    const scheduled = plans.filter((p) => p.status === "SCHEDULED").length;
    const ready = plans.filter((p) => p.status === "READY" || p.status === "APPROVED").length;
    const failed = plans.filter((p) => p.status === "FAILED").length;
    const total = plans.length;
    return { published, scheduled, ready, failed, total };
  }, [plans]);

  return (
    <div className="autoposter-shell min-h-screen text-[#171717]">
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        {/* Studio Header */}
        <header className="studio-header">
          <div className="flex items-center gap-3">
            <div className="brand-mark bg-[#171717]">🧠</div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px] tracking-tight text-[#171717]">Content Brain OS</span>
                <span className="status-pill">
                  <span className={`live-dot ${automationEnabled ? "bg-[#1b9b6d]" : "bg-[#a09f9a]"}`} />
                  {automationEnabled ? "Autonomous Active" : "Paused (Human Mode)"}
                </span>
              </div>
              <p className="m-0 text-[11px] text-[#888782]">
                10-Day Intelligent Content Strategy & Autonomous Daily Execution
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a href="/autoposter" className="icon-button text-[11px] font-semibold no-underline">
              <span>Main Studio</span>
            </a>
            <a href="/reels" className="icon-button text-[11px] font-semibold no-underline">
              <span>Reel Studio</span>
            </a>
            <a href="/schedule" className="icon-button text-[11px] font-semibold no-underline">
              <span>Schedules</span>
            </a>
            <button
              onClick={toggleAutomation}
              className="icon-button text-[11px] font-semibold"
              title="Toggle Autonomous Engine"
            >
              {automationEnabled ? <Pause size={14} weight="bold" /> : <Play size={14} weight="bold" />}
              <span>{automationEnabled ? "Pause Engine" : "Resume Engine"}</span>
            </button>
          </div>
        </header>

        {/* Hero Strip */}
        <section className="hero-strip my-4">
          <div>
            <div className="eyebrow">
              <Sparkle size={12} weight="fill" />
              <span>PREMIUM AI CONTENT OPERATING SYSTEM</span>
            </div>
            <h2>10-Day Strategy & Daily Autonomous Execution</h2>
            <p>
              Coordinated cross-brand calendar for Zawaago & InnoTech: 12:30 PM & 1:00 PM Posts, 6:30 PM & 7:00 PM Reels.
              Media generation, Quality Gate verification, R2 asset storage, and safe Facebook publishing.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-8 pr-4">
            <div className="hero-stat flex items-center">
              <span>{stats.total}</span>
              <small>Total<br />Plans</small>
            </div>
            <div className="hero-stat flex items-center">
              <span>{stats.published}</span>
              <small>Live on<br />Facebook</small>
            </div>
            <div className="hero-stat flex items-center">
              <span>{stats.ready}</span>
              <small>Ready<br />Queue</small>
            </div>
          </div>
        </section>

        {/* Status Notice */}
        {statusNotice && (
          <div
            className={`status-banner mb-4 ${
              statusNotice.type === "success"
                ? "success"
                : statusNotice.type === "error"
                ? "error"
                : "bg-white border-[#d9d8d4] text-[#333]"
            }`}
          >
            {statusNotice.type === "success" ? (
              <CheckCircle size={16} weight="fill" />
            ) : statusNotice.type === "error" ? (
              <WarningCircle size={16} weight="fill" />
            ) : (
              <Sparkle size={16} weight="fill" />
            )}
            <span className="font-medium">{statusNotice.message}</span>
            <button
              onClick={() => setStatusNotice(null)}
              className="ml-auto border-0 bg-transparent text-current opacity-60 hover:opacity-100 p-1"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e4df] pb-3 mb-5">
          <div className="preview-tabs m-0">
            <button
              className={activeTab === "calendar" ? "active" : ""}
              onClick={() => setActiveTab("calendar")}
            >
              <Calendar size={14} />
              <span>10-Day Calendar & Queue</span>
            </button>
            <button
              className={activeTab === "jobs" ? "active" : ""}
              onClick={() => setActiveTab("jobs")}
            >
              <Clock size={14} />
              <span>State Machine Jobs ({jobs.length})</span>
            </button>
            <button
              className={activeTab === "brands" ? "active" : ""}
              onClick={() => setActiveTab("brands")}
            >
              <Sliders size={14} />
              <span>Brand Brain</span>
            </button>
            <button
              className={activeTab === "memory" ? "active" : ""}
              onClick={() => setActiveTab("memory")}
            >
              <Brain size={14} />
              <span>Content Memory ({memoryRecords.length})</span>
            </button>
            <button
              className={activeTab === "simulation" ? "active" : ""}
              onClick={() => setActiveTab("simulation")}
            >
              <Sparkle size={14} />
              <span>30-Day Simulation</span>
            </button>
          </div>

          {/* Primary Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={generate10DayCalendar}
              disabled={actionInProgress !== null}
              className="publish-primary !min-h-[38px] px-4 text-[11px] font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              {actionInProgress === "planning-10-days" ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <Calendar size={14} />
              )}
              <span>Generate 10-Day Plan</span>
            </button>

            <button
              onClick={() => executeTodayQueue(true)}
              disabled={actionInProgress !== null}
              className="publish-secondary !min-h-[38px] px-4 text-[11px] font-bold inline-flex items-center gap-2 cursor-pointer"
            >
              {actionInProgress === "executing-today" ? (
                <SpinnerGap size={14} className="animate-spin" />
              ) : (
                <Play size={14} weight="fill" />
              )}
              <span>Execute Today's Queue</span>
            </button>
          </div>
        </div>

        {/* TAB 1: 10-Day Calendar & Queue */}
        {activeTab === "calendar" && (
          <div className="space-y-4">
            {/* Autonomous Workflow Pipeline Bar */}
            <div className="panel p-4 bg-white/80 border border-[#deddd9] rounded-xl">
              <div className="text-[11px] font-bold text-[#666] mb-2 uppercase tracking-wider">
                Autonomous Execution Pipeline
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-[10px]">
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">1. 10-Day Strategy</span>
                  <span className="text-[#888]">Brand Brain & Topics</span>
                </div>
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">2. Today's Queue</span>
                  <span className="text-[#888]">Day-by-Day Fetch</span>
                </div>
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">3. AI Generation</span>
                  <span className="text-[#888]">Caption & Flux Visuals</span>
                </div>
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">4. Quality Gate</span>
                  <span className="text-[#888]">Hook & Narrative Score</span>
                </div>
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">5. R2 Storage</span>
                  <span className="text-[#888]">Immutable Assets</span>
                </div>
                <div className="p-2 rounded-lg bg-[#f0efec] border border-[#deddd9] font-medium">
                  <span className="block font-bold text-[#171717]">6. Scheduled Time</span>
                  <span className="text-[#888]">12:30 / 1:00 / 6:30 / 7:00</span>
                </div>
                <div className="p-2 rounded-lg bg-[#edf8f3] border border-[#bce2d0] text-[#1b7a54] font-medium">
                  <span className="block font-bold">7. Facebook Publish</span>
                  <span className="text-[#2b8a64]">Feed & Reels API</span>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white/70 p-3 rounded-xl border border-[#deddd9]">
              {/* Day Filter Pills */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-bold text-[#666] mr-1">Day:</span>
                <button
                  onClick={() => setSelectedDayFilter("All")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition ${
                    selectedDayFilter === "All"
                      ? "bg-[#171717] text-white border-[#171717]"
                      : "bg-white text-[#555] border-[#deddd9] hover:bg-[#f6f5f2]"
                  }`}
                >
                  All (10 Days)
                </button>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDayFilter(d)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition ${
                      selectedDayFilter === d
                        ? "bg-[#171717] text-white border-[#171717]"
                        : "bg-white text-[#555] border-[#deddd9] hover:bg-[#f6f5f2]"
                    }`}
                  >
                    Day {d}
                  </button>
                ))}
              </div>

              {/* Brand & Format Filters */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value as any)}
                  className="min-h-[32px] px-2.5 text-[11px] rounded-lg border border-[#deddd9] bg-white font-medium text-[#333]"
                >
                  <option value="All">All Brands</option>
                  <option value="Zawaago">Zawaago</option>
                  <option value="InnoTech">InnoTech</option>
                </select>

                <select
                  value={formatFilter}
                  onChange={(e) => setFormatFilter(e.target.value as any)}
                  className="min-h-[32px] px-2.5 text-[11px] rounded-lg border border-[#deddd9] bg-white font-medium text-[#333]"
                >
                  <option value="All">All Formats</option>
                  <option value="POST">Posts (12:30 / 1:00 PM IST)</option>
                  <option value="REEL">Reels (6:30 / 7:00 PM IST)</option>
                </select>

                <button
                  onClick={loadPlans}
                  className="icon-button !min-h-[32px] text-[11px] font-semibold"
                  title="Refresh plans from D1"
                >
                  <ArrowClockwise size={13} className={loading ? "animate-spin" : ""} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Plans List Grid */}
            {filteredPlans.length === 0 ? (
              <div className="panel p-12 text-center">
                <Calendar size={36} className="mx-auto text-[#aaa8a1] mb-2" />
                <h4 className="text-[15px] font-bold text-[#333] m-0 mb-1">No Content Plans Found</h4>
                <p className="text-[12px] text-[#888] max-w-[460px] mx-auto mb-4">
                  Click "Generate 10-Day Plan" above to create 40 coordinated daily releases for Zawaago & InnoTech,
                  persisted in your D1 database.
                </p>
                <button
                  onClick={generate10DayCalendar}
                  disabled={actionInProgress !== null}
                  className="publish-primary !min-h-[38px] px-5 text-[12px] font-bold inline-flex items-center gap-2 cursor-pointer mx-auto"
                >
                  <Calendar size={14} />
                  <span>Generate 10-Day Intelligent Plan Now</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPlans.map((plan) => {
                  const isZawaago = plan.brand.toLowerCase().includes("zawaago");
                  const isPost = plan.format === "POST";
                  const scheduleTimeStr = plan.scheduledFor
                    ? new Date(plan.scheduledFor).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                    : "";
                  const scheduleDateStr = plan.scheduledFor ? plan.scheduledFor.slice(0, 10) : "";

                  return (
                    <div
                      key={plan.id}
                      className="panel p-4 bg-white border border-[#deddd9] rounded-xl flex flex-col justify-between hover:border-[#bdbbb5] transition shadow-sm"
                    >
                      <div>
                        {/* Card Header */}
                        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#f0efec]">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-[12px] text-white ${
                                isZawaago ? "bg-[#171717]" : "bg-[#2563eb]"
                              }`}
                            >
                              {isZawaago ? "Z" : "I"}
                            </div>
                            <div>
                              <div className="font-bold text-[12px] text-[#171717]">{plan.brand}</div>
                              <div className="text-[10px] text-[#888] flex items-center gap-1.5">
                                <span>{isPost ? "Feed Post" : "Video Reel"}</span>
                                <span>•</span>
                                <span className="font-medium text-[#444]">{scheduleTimeStr} IST</span>
                                {plan.dayIndex && (
                                  <>
                                    <span>•</span>
                                    <span className="font-semibold text-[#171717]">Day {plan.dayIndex}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Status Pill */}
                          <div className="flex items-center gap-1.5">
                            {plan.status === "PUBLISHED" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#edf8f3] text-[#1b7a54] border border-[#bce2d0] inline-flex items-center gap-1">
                                <FacebookLogo size={11} weight="fill" />
                                Published
                              </span>
                            ) : plan.status === "READY" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
                                Ready
                              </span>
                            ) : plan.status === "SCHEDULED" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#faf5ff] text-[#7e22ce] border border-[#e9d5ff]">
                                Scheduled
                              </span>
                            ) : plan.status === "FAILED" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#fff2f0] text-[#b42318] border border-[#fecdca]">
                                Failed
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f5f5f4] text-[#78716c] border border-[#e7e5e4]">
                                Planned
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Topic & Hook */}
                        <div className="pt-3">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-[#888] bg-[#f5f5f4] px-1.5 py-0.5 rounded">
                              {plan.pillar}
                            </span>
                            <span className="text-[9px] text-[#666] bg-[#fafaf9] px-1.5 py-0.5 rounded border border-[#deddd9]">
                              {plan.angle}
                            </span>
                            {plan.qualityScore && (
                              <span className="text-[9px] font-semibold text-[#1b7a54] ml-auto">
                                Quality: {plan.qualityScore.toFixed(1)}/10
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-[13px] text-[#171717] m-0 mb-1 leading-snug">
                            {plan.topic}
                          </h4>

                          <p className="text-[11px] text-[#555] m-0 mb-2 italic line-clamp-2">
                            "{plan.hook}"
                          </p>

                          {/* Generated Media Preview / Badges */}
                          {plan.generatedCaption && (
                            <div className="p-2 rounded-lg bg-[#fafaf9] border border-[#deddd9] text-[10px] text-[#444] line-clamp-2 mb-2">
                              <span className="font-bold text-[#222]">Generated Caption: </span>
                              {plan.generatedCaption}
                            </div>
                          )}

                          {plan.generatedImageUrl && (
                            <div className="flex items-center gap-2 text-[10px] text-[#1b7a54] font-semibold mb-2">
                              <CheckCircle size={12} weight="fill" />
                              <span>Flux Visual Stored in R2</span>
                            </div>
                          )}

                          {plan.facebookPostId && (
                            <div className="p-1.5 rounded bg-[#edf8f3] text-[10px] font-bold text-[#1b7a54] inline-flex items-center gap-1.5 border border-[#bce2d0]">
                              <FacebookLogo size={12} weight="fill" />
                              <span>Facebook ID: {plan.facebookPostId}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-3 mt-3 border-t border-[#f0efec] flex items-center justify-between gap-2">
                        <span className="text-[10px] text-[#888]">
                          {scheduleDateStr} • {scheduleTimeStr} IST
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedPlanDetail(plan)}
                            className="small-action text-[10px] font-semibold cursor-pointer"
                          >
                            <Eye size={12} />
                            <span>Inspect</span>
                          </button>

                          {plan.status === "FAILED" ? (
                            <button
                              onClick={() => retryJob(plan.id)}
                              disabled={actionInProgress !== null}
                              className="small-action text-[10px] font-bold text-[#b42318] hover:bg-[#fff2f0] cursor-pointer"
                            >
                              <ArrowClockwise size={12} />
                              <span>Retry</span>
                            </button>
                          ) : plan.status !== "PUBLISHED" ? (
                            <button
                              onClick={() => executeSingleItem(plan.id, true)}
                              disabled={actionInProgress !== null}
                              className="small-action text-[10px] font-bold text-[#171717] bg-[#f5f5f4] hover:bg-[#e7e5e4] cursor-pointer"
                              title="Run full pipeline and publish now"
                            >
                              {actionInProgress === `exec-${plan.id}` ? (
                                <SpinnerGap size={12} className="animate-spin" />
                              ) : (
                                <Play size={12} weight="fill" />
                              )}
                              <span>Execute Now</span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: State Machine Jobs */}
        {activeTab === "jobs" && (
          <div className="panel p-6 bg-white border border-[#deddd9] rounded-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#f0efec] mb-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#171717] m-0">Content Job State Machine</h3>
                <p className="text-[11px] text-[#888] m-0">
                  Resilient background state transitions with idempotency guards and retry tracking
                </p>
              </div>
              <button onClick={loadJobs} className="icon-button text-[11px] font-semibold">
                <ArrowClockwise size={13} />
                <span>Refresh Jobs</span>
              </button>
            </div>

            {jobs.length === 0 ? (
              <div className="p-8 text-center text-[#888] text-[12px]">
                No jobs currently in queue. Generate a 10-day plan to initiate background job orchestrations.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#deddd9] text-[#777] font-bold uppercase text-[9px] tracking-wider">
                      <th className="py-2.5 px-3">Job ID</th>
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3">Format</th>
                      <th className="py-2.5 px-3">State</th>
                      <th className="py-2.5 px-3">Step</th>
                      <th className="py-2.5 px-3">Retries</th>
                      <th className="py-2.5 px-3">FB Post ID</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0efec]">
                    {jobs.map((j) => (
                      <tr key={j.id} className="hover:bg-[#fafaf9]">
                        <td className="py-2 px-3 font-mono text-[10px] text-[#555]">{j.id.slice(0, 16)}…</td>
                        <td className="py-2 px-3 font-semibold">{j.brand}</td>
                        <td className="py-2 px-3 text-[#666]">{j.format}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              j.state === "PUBLISHED"
                                ? "bg-[#edf8f3] text-[#1b7a54]"
                                : j.state === "FAILED"
                                ? "bg-[#fff2f0] text-[#b42318]"
                                : j.state === "READY"
                                ? "bg-[#eff6ff] text-[#1d4ed8]"
                                : "bg-[#f5f5f4] text-[#666]"
                            }`}
                          >
                            {j.state}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[#777]">{j.currentStep || "-"}</td>
                        <td className="py-2 px-3 text-[#777]">
                          {j.retryCount} / {j.maxRetries}
                        </td>
                        <td className="py-2 px-3 font-mono text-[10px] text-[#222]">
                          {j.facebookPostId || "-"}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {j.state === "FAILED" ? (
                            <button
                              onClick={() => retryJob(j.id)}
                              className="small-action text-[10px] font-bold text-[#b42318] cursor-pointer"
                            >
                              Retry
                            </button>
                          ) : j.state !== "PUBLISHED" ? (
                            <button
                              onClick={() => executeSingleItem(j.planId, true)}
                              className="small-action text-[10px] font-bold text-[#171717] cursor-pointer"
                            >
                              Execute
                            </button>
                          ) : (
                            <span className="text-[10px] text-[#1b7a54] font-semibold">Complete</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Brand Brain */}
        {activeTab === "brands" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {brands.map((b) => (
              <div key={b.id} className="panel p-5 bg-white border border-[#deddd9] rounded-xl">
                <div className="flex items-center gap-3 pb-3 border-b border-[#f0efec] mb-3">
                  <div className="brand-mark bg-[#171717]">{b.name[0]}</div>
                  <div>
                    <h3 className="text-[15px] font-bold text-[#171717] m-0">{b.name}</h3>
                    <p className="text-[11px] text-[#888] m-0">{b.handle}</p>
                  </div>
                </div>

                <p className="text-[12px] text-[#555] mb-3">{b.mission}</p>

                <div className="space-y-3 text-[11px]">
                  <div>
                    <span className="font-bold text-[#222] block mb-1">Content Pillars:</span>
                    <div className="flex flex-wrap gap-1">
                      {b.pillars.map((p) => (
                        <span key={p.id} className="px-2 py-0.5 rounded bg-[#f5f5f4] text-[#555] border border-[#deddd9]">
                          {p.name} ({Math.round(p.weight * 100)}%)
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-[#222] block mb-1">Target Audiences:</span>
                    <div className="flex flex-wrap gap-1">
                      {b.targetAudiences.map((a) => (
                        <span key={a.id} className="px-2 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]">
                          {a.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-[#222] block mb-1">Preferred Visual Families:</span>
                    <div className="flex flex-wrap gap-1">
                      {b.visualIdentity.preferredFamilies.map((v) => (
                        <span key={v} className="px-2 py-0.5 rounded bg-[#faf5ff] text-[#7e22ce] border border-[#e9d5ff]">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: Content Memory */}
        {activeTab === "memory" && (
          <div className="panel p-6 bg-white border border-[#deddd9] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#f0efec] mb-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#171717] m-0">Content Memory Ledger</h3>
                <p className="text-[11px] text-[#888] m-0">
                  Anti-repetition database tracking topics, angles, and visual families over the past 30 days
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search memory topics or hooks…"
                  value={memorySearch}
                  onChange={(e) => {
                    setMemorySearch(e.target.value);
                    loadMemory(e.target.value);
                  }}
                  className="min-h-[34px] px-3 text-[11px] rounded-lg border border-[#deddd9] bg-[#fafaf9] outline-none w-[240px]"
                />
              </div>
            </div>

            {memoryRecords.length === 0 ? (
              <div className="p-8 text-center text-[#888] text-[12px]">
                No memory records found. Generate plans to start accumulating anti-repetition memory.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-[#deddd9] text-[#777] font-bold uppercase text-[9px] tracking-wider">
                      <th className="py-2.5 px-3">Brand</th>
                      <th className="py-2.5 px-3">Format</th>
                      <th className="py-2.5 px-3">Pillar</th>
                      <th className="py-2.5 px-3">Topic</th>
                      <th className="py-2.5 px-3">Angle</th>
                      <th className="py-2.5 px-3">Visual Family</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0efec]">
                    {memoryRecords.map((m) => (
                      <tr key={m.id} className="hover:bg-[#fafaf9]">
                        <td className="py-2 px-3 font-semibold">{m.brand}</td>
                        <td className="py-2 px-3 text-[#666]">{m.format}</td>
                        <td className="py-2 px-3 text-[#666]">{m.pillar}</td>
                        <td className="py-2 px-3 font-medium text-[#171717]">{m.topic}</td>
                        <td className="py-2 px-3 text-[#777]">{m.angle}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#fafaf9] border border-[#deddd9] text-[#555]">
                            {m.visualFamily}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[10px] font-semibold text-[#1b7a54]">{m.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: 30-Day Strategy Simulation */}
        {activeTab === "simulation" && (
          <div className="panel p-6 bg-white border border-[#deddd9] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#f0efec] mb-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#171717] m-0">30-Day Content Strategy Simulator</h3>
                <p className="text-[11px] text-[#888] m-0">
                  Dry-run verification engine to prove zero repetition loops and continuous visual diversity
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={simulationDays}
                  onChange={(e) => setSimulationDays(Number(e.target.value))}
                  className="min-h-[34px] px-3 text-[11px] rounded-lg border border-[#deddd9] bg-[#fafaf9] font-medium"
                >
                  <option value={7}>7 Days Simulation</option>
                  <option value={14}>14 Days Simulation</option>
                  <option value={30}>30 Days Simulation</option>
                </select>

                <button
                  onClick={runSimulation}
                  disabled={loading}
                  className="publish-primary !min-h-[34px] px-4 text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {loading ? <SpinnerGap size={13} className="animate-spin" /> : <Sparkle size={13} />}
                  <span>Run Simulation</span>
                </button>
              </div>
            </div>

            {simulationResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-[#fafaf9] border border-[#deddd9]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#777]">Total Simulated Plans</div>
                    <div className="text-[26px] font-extrabold text-[#171717]">{simulationResult.totalPlansGenerated}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#edf8f3] border border-[#bce2d0]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#1b7a54]">Repetition Violations</div>
                    <div className="text-[26px] font-extrabold text-[#1b7a54]">{simulationResult.repetitionViolationsCount}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#eff6ff] border border-[#bfdbfe]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#1d4ed8]">Visual Diversity Index</div>
                    <div className="text-[26px] font-extrabold text-[#1d4ed8]">
                      {(simulationResult.overallVisualDiversityIndex * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#fafaf9] border border-[#deddd9] text-[12px] text-[#444]">
                  <strong>Simulation Summary: </strong>
                  {simulationResult.summaryRationale}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-[#888] text-[12px]">
                Click "Run Simulation" above to dry-run 30 consecutive days of autonomous content strategy.
              </div>
            )}
          </div>
        )}

        {/* Plan Detail Modal */}
        {selectedPlanDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="panel max-w-[700px] w-full max-h-[90vh] overflow-y-auto bg-white p-6 rounded-2xl shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-[#f0efec] mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[14px] text-[#171717]">{selectedPlanDetail.brand}</span>
                  <span className="text-[11px] text-[#888]">({selectedPlanDetail.format})</span>
                  <span className="text-[10px] font-bold text-[#1b7a54] bg-[#edf8f3] px-2 py-0.5 rounded">
                    Day {selectedPlanDetail.dayIndex || 1}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedPlanDetail(null)}
                  className="icon-button !min-h-[30px] p-1 text-[#888] hover:text-[#171717]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3 text-[12px]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Core Topic & Angle</span>
                  <div className="font-bold text-[14px] text-[#171717] mt-0.5">{selectedPlanDetail.topic}</div>
                  <div className="text-[11px] text-[#666]">Angle: {selectedPlanDetail.angle} • Pillar: {selectedPlanDetail.pillar}</div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Narrative Hook</span>
                  <div className="p-2.5 rounded-lg bg-[#fafaf9] border border-[#deddd9] italic text-[#333]">
                    "{selectedPlanDetail.hook}"
                  </div>
                </div>

                {selectedPlanDetail.captionBrief && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Caption Brief</span>
                    <div className="p-2.5 rounded-lg bg-[#fafaf9] border border-[#deddd9] text-[#444]">
                      {selectedPlanDetail.captionBrief}
                    </div>
                  </div>
                )}

                {selectedPlanDetail.creativeDirection && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Creative Direction</span>
                    <div className="p-2.5 rounded-lg bg-[#fafaf9] border border-[#deddd9] space-y-1 text-[11px]">
                      <div>
                        <strong>Visual Family: </strong>
                        {selectedPlanDetail.creativeDirection.visualFamily}
                      </div>
                      <div>
                        <strong>Composition: </strong>
                        {selectedPlanDetail.creativeDirection.composition}
                      </div>
                      <div>
                        <strong>Metaphor: </strong>
                        {selectedPlanDetail.creativeDirection.visualMetaphor}
                      </div>
                      {selectedPlanDetail.creativeDirection.promptOutput && (
                        <div className="pt-1 mt-1 border-t border-[#eee]">
                          <strong>Prompt: </strong>
                          <span className="text-[#666]">{selectedPlanDetail.creativeDirection.promptOutput}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedPlanDetail.scenes && selectedPlanDetail.scenes.length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#888]">Reel Storyboard Scenes (5)</span>
                    <div className="space-y-2 mt-1">
                      {selectedPlanDetail.scenes.map((s) => (
                        <div key={s.sceneNumber} className="p-2.5 rounded-lg bg-[#fafaf9] border border-[#deddd9] text-[11px]">
                          <div className="font-bold text-[#171717]">
                            Scene {s.sceneNumber} ({s.durationSeconds}s) • {s.visualFamily}
                          </div>
                          <div className="text-[#333] mt-0.5">
                            <strong>Narration: </strong>"{s.narration}"
                          </div>
                          <div className="text-[#666] text-[10px] mt-0.5">
                            <strong>Overlay: </strong>"{s.captionOverlayText}"
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-[#f0efec] flex items-center justify-between">
                  <span className="text-[11px] text-[#888]">Scheduled For: {selectedPlanDetail.scheduledFor}</span>
                  {selectedPlanDetail.status !== "PUBLISHED" && (
                    <button
                      onClick={() => {
                        executeSingleItem(selectedPlanDetail.id, true);
                        setSelectedPlanDetail(null);
                      }}
                      className="publish-primary !min-h-[36px] px-4 text-[11px] font-bold inline-flex items-center gap-1.5"
                    >
                      <Play size={13} weight="fill" />
                      <span>Execute Item Now</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
