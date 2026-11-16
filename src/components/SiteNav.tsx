"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBookmark, IconList, IconSend } from "./icons";

const LINKS = [
  { href: "/", label: "Sve", match: (p: string) => p === "/" || p.startsWith("/z/") || p.startsWith("/d/"), icon: <IconList /> },
  { href: "/moj", label: "Moj kalendar", match: (p: string) => p.startsWith("/moj"), icon: <IconBookmark /> },
  { href: "/objavi", label: "Objavi", match: (p: string) => p.startsWith("/objavi"), icon: <IconSend /> },
];

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Glavna navigacija">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.icon}
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
