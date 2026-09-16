import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;
const outlookHosts = new Set([
  "outlook.office365.com",
  "outlook.office.com",
  "outlook.live.com",
]);

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    react(),
    {
      name: "outlook-feed-development-proxy",
      configureServer(server) {
        server.middlewares.use("/__outlook_feed", async (request, response) => {
          try {
            const value = new URL(request.url ?? "", "http://localhost").searchParams.get("url");
            const target = new URL(value ?? "");
            if (
              request.method !== "GET"
              || target.protocol !== "https:"
              || !outlookHosts.has(target.hostname.toLowerCase())
              || !target.pathname.toLowerCase().endsWith(".ics")
              || target.username
              || target.password
            ) {
              response.statusCode = 400;
              return response.end("Invalid Outlook calendar URL.");
            }

            const upstream = await fetch(target, {
              redirect: "error",
              headers: { Accept: "text/calendar" },
              signal: AbortSignal.timeout(30_000),
            });
            const contents = new Uint8Array(await upstream.arrayBuffer());
            if (contents.byteLength > 5 * 1024 * 1024) {
              response.statusCode = 413;
              return response.end("Calendar feeds are limited to 5 MB.");
            }
            response.statusCode = upstream.status;
            response.setHeader("Content-Type", upstream.headers.get("Content-Type") ?? "text/calendar");
            response.end(contents);
          } catch (cause) {
            response.statusCode = 502;
            response.end(cause instanceof Error ? cause.message : "Outlook calendar request failed.");
          }
        });
      },
    },
    {
      name: "jira-api-development-proxy",
      configureServer(server) {
        server.middlewares.use("/__jira_api", async (request, response) => {
          try {
            const value = new URL(request.url ?? "", "http://localhost").searchParams.get("url");
            const target = new URL(value ?? "");
            if (
              !["GET", "POST"].includes(request.method ?? "")
              || target.protocol !== "https:"
              || !target.hostname.toLowerCase().endsWith(".atlassian.net")
              || !target.pathname.startsWith("/rest/api/3/")
              || target.username
              || target.password
            ) {
              response.statusCode = 400;
              return response.end("Invalid Jira API request.");
            }

            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            const body = Buffer.concat(chunks);
            const upstream = await fetch(target, {
              method: request.method,
              redirect: "error",
              headers: {
                Accept: "application/json",
                ...(request.headers.authorization ? { Authorization: request.headers.authorization } : {}),
                ...(request.headers["content-type"] ? { "Content-Type": request.headers["content-type"] } : {}),
              },
              body: body.length ? body : undefined,
              signal: AbortSignal.timeout(30_000),
            });
            const contents = new Uint8Array(await upstream.arrayBuffer());
            if (contents.byteLength > 10 * 1024 * 1024) {
              response.statusCode = 413;
              return response.end("Jira responses are limited to 10 MB.");
            }
            response.statusCode = upstream.status;
            response.setHeader("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
            response.end(contents);
          } catch (cause) {
            response.statusCode = 502;
            response.end(cause instanceof Error ? cause.message : "Jira API request failed.");
          }
        });
      },
    },
  ],

  // Ships its own WASM binary, which Vite's dependency pre-bundling mangles.
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm"],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
