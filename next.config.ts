import type { NextConfig } from "next";

/**
 * Sigurnosna zaglavlja. Politika sadržaja: resursi samo s vlastite adrese, bez dodataka i
 * ugrađenih objekata, obrasci se šalju samo ovoj stranici, a <base> se ne može podmetnuti.
 * Skripte u samoj stranici su dopuštene jer ih Next.js koristi za učitavanje.
 */
const dev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  // U razvoju Next.js treba eval i WebSocket za osvježavanje; u produkciji ne.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const COMMON = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // PGlite (lokalna baza za razvoj) i postgres ne smiju biti bundlani.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [
      {
        // Ugradnja kalendara na tuđe stranice dopuštena je samo za /ugradi/*.
        source: "/ugradi/:path*",
        headers: [{ key: "Content-Security-Policy", value: `${CSP}; frame-ancestors *` }, ...COMMON],
      },
      {
        // Skripta widgeta učitava se s tuđih stranica: kratka predmemorija, da izmjene brzo stignu svima.
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }],
      },
      {
        source: "/((?!ugradi).*)",
        headers: [{ key: "Content-Security-Policy", value: `${CSP}; frame-ancestors 'self'` }, { key: "X-Frame-Options", value: "SAMEORIGIN" }, ...COMMON],
      },
    ];
  },
};

export default nextConfig;
