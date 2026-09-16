import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	server: {
		host: "0.0.0.0",
		port: 3000,
	},
	plugins: [
		cloudflare({ viteEnvironment: { name: "ssr" }, remoteBindings: false }),
		tailwindcss(),
		reactRouter(),
		tsconfigPaths(),
	],
});
