import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Same-origin API: the browser always talks to /api, Next proxies to
      // the HTTP backend. Keeps the auth cookie valid on any host (localhost,
      // LAN IP, EC2 domain) — cross-site cookies (SameSite=Lax) would be
      // dropped otherwise.
      { source: "/api/:path*", destination: "http://localhost:3001/:path*" },
      // WebSocket upgrade proxy for the same reason (production uses nginx
      // for this; this covers dev and LAN testing). Next proxies the HTTP
      // destination and forwards WebSocket upgrades.
      { source: "/ws", destination: "http://localhost:8080" },
    ];
  },
};

export default nextConfig;
