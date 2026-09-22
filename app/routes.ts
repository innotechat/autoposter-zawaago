import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/autoposter-branded.tsx"),
  route("content-engine", "routes/content-engine.tsx"),
  route("reel-lab", "routes/reel-lab.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("history", "routes/history.tsx"),
  route("schedule", "routes/schedule.tsx"),
] satisfies RouteConfig;
