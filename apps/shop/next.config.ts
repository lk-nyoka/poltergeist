import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/**
 * Shop CSP (brief §6, REQ-12.1). 'unsafe-inline' is deliberate: C7 mutants must be detectable through
 * inline-handler payloads. NEVER add script nonces, hashes or 'strict-dynamic': they silently disable
 * 'unsafe-inline' and would make C7 mutants undetectable.
 */
export function buildCsp(seanceOrigin: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${seanceOrigin}`,
  ].join("; ");
}

export default function config(phase: string): NextConfig {
  const dev = phase === PHASE_DEVELOPMENT_SERVER;
  const seanceOrigin = process.env["SEANCE_ORIGIN"] ?? "http://localhost:3001";

  return {
    transpilePackages: ["@poltergeist/protocol"],
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Content-Security-Policy", value: buildCsp(seanceOrigin, dev) },
            { key: "X-Robots-Tag", value: "noindex" },
            // No X-Frame-Options: frame-ancestors above is the only framing control (the Séance Room embeds us).
          ],
        },
      ];
    },
    turbopack: {
      rules: {
        "*.css": {
          loaders: ["@tailwindcss/turbopack"],
          as: "*.css",
        },
      },
    },
  };
}
