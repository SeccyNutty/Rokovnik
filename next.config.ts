import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (lokalna baza za razvoj) i postgres ne smiju biti bundlani.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [
      {
        // Ugradnja kalendara na tuđe stranice dopuštena je samo za /ugradi/*.
        source: "/ugradi/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Skripta widgeta učitava se s tuđih stranica: kratka predmemorija, da izmjene brzo stignu svima.
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/((?!ugradi).*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
