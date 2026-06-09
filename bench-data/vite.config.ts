import { defineConfig } from "vite";
import { resolve } from "path";
import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";

export default defineConfig({
  server: {
    port: 5175,
    fs: {
      allow: [".."],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  plugins: [
    {
      name: "serve-sibling-projects",
      configureServer(server: any) {
        server.middlewares.use(
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const url = req.url || "";
            if (
              url.startsWith("/journey-bench/") ||
              url.startsWith("/tinyts-bench/")
            ) {
              const cleanUrl = url.split("?")[0];
              let filePath = resolve(__dirname, "..", cleanUrl.substring(1));
              if (cleanUrl === "/tinyts-bench/index.html") {
                filePath = resolve(
                  __dirname,
                  "../tinyts-bench/dist/index.html",
                );
              } else if (cleanUrl.startsWith("/tinyts-bench/assets/")) {
                filePath = resolve(
                  __dirname,
                  "../tinyts-bench/dist",
                  cleanUrl.replace("/tinyts-bench/", ""),
                );
              } else if (cleanUrl.startsWith("/tinyts-bench/")) {
                filePath = resolve(
                  __dirname,
                  "../tinyts-bench/dist",
                  cleanUrl.replace("/tinyts-bench/", ""),
                );
              }
              if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = filePath.split(".").pop() || "";
                const mimeType =
                  (
                    {
                      html: "text/html",
                      js: "application/javascript",
                      wasm: "application/wasm",
                      css: "text/css",
                      json: "application/json",
                      png: "image/png",
                      woff2: "font/woff2",
                    } as Record<string, string>
                  )[ext] || "application/octet-stream";
                res.setHeader("Content-Type", mimeType);
                res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
                res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
                if (ext === "html") {
                  res.setHeader("Cache-Control", "no-store");
                  const html = fs
                    .readFileSync(filePath, "utf8")
                    .replaceAll('src="/assets/', 'src="/tinyts-bench/assets/')
                    .replaceAll(
                      'href="/assets/',
                      'href="/tinyts-bench/assets/',
                    );
                  res.end(html);
                  return;
                }
                res.end(fs.readFileSync(filePath));
                return;
              }
            }
            next();
          },
        );
      },
    },
  ],
});
