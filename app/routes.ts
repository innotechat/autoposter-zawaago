import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/autoposter-branded.tsx"),
  route("gallery", "routes/gallery.tsx"),
  route("history", "routes/history.tsx"),
] satisfies RouteConfig;
