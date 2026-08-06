import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const r2PublicUrl = process.env.R2_PUBLIC_URL;
const r2Endpoint = process.env.R2_ENDPOINT;
const r2AccountId = process.env.R2_ACCOUNT_ID;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://maps.googleapis.com https://maps.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://maps.gstatic.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
].join("; ");

function remoteImagePatternFromUrl(value?: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return null;
    }

    return {
      protocol: "https" as const,
      hostname: url.hostname,
    };
  } catch {
    return null;
  }
}

const r2RemotePatterns = [
  {
    protocol: "https" as const,
    hostname: "**.r2.dev",
  },
  {
    protocol: "https" as const,
    hostname: "**.r2.cloudflarestorage.com",
  },
  remoteImagePatternFromUrl(r2PublicUrl),
  remoteImagePatternFromUrl(r2Endpoint),
  r2AccountId
    ? {
        protocol: "https" as const,
        hostname: `${r2AccountId}.r2.cloudflarestorage.com`,
      }
    : null,
].filter((pattern): pattern is { protocol: "https"; hostname: string } => Boolean(pattern));

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy,
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      ...r2RemotePatterns,
    ],
  },
};

export default nextConfig;
