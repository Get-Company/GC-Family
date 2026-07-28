import type { NextConfig } from "next";

// Django-Backend. Im Dev standardmäßig lokal, im Docker/Server per Env gesetzt.
const API_BASE = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Schlankes, eigenständiges Server-Bundle für das Docker-Image.
  output: "standalone",
  async rewrites() {
    // /api/* wird transparent ans Django-Backend weitergereicht,
    // damit das Frontend same-origin gegen /api sprechen kann.
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`,
      },
      {
        source: "/media/:path*",
        destination: `${API_BASE}/media/:path*`,
      },
      // Der ausschließlich für Florian sichtbare Django-Admin bleibt über
      // dieselbe öffentliche Adresse erreichbar; das Backend selbst hat
      // keinen offenen Host-Port.
      {
        source: "/admin/:path*",
        destination: `${API_BASE}/admin/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${API_BASE}/static/:path*`,
      },
    ];
  },
};

export default nextConfig;
