import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/autoposter-branded.tsx"),
  route("autoposter", "routes/autoposter-branded.tsx", { id: "autoposter-route" }),
  route("content-engine", "routes/content-engine.tsx"),
  route("reel-lab", "routes/reel-lab.tsx"),
  route("reels", "routes/reel-lab.tsx", { id: "reels-route" }),
  route("gallery", "routes/gallery.tsx"),
  route("history", "routes/history.tsx"),
  route("schedule", "routes/schedule.tsx"),
  route("*", "routes/autoposter-branded.tsx", { id: "splat-fallback" }),
] satisfies RouteConfig;
