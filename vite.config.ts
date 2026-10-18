import { defineConfig } from "vite";

// base "./" keeps asset paths relative so the build works on GitHub Pages
// project sites (https://user.github.io/repo/) as well as at a domain root.
export default defineConfig({
  base: "./",
  server: { host: true, port: 5173, allowedHosts: true },
});
