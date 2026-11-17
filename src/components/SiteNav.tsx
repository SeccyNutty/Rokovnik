"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkHint } from "./LinkHint";
import { IconBookmark, IconList, IconSend, IconUser } from "./icons";
import { useMe } from "./me";

const LINKS = [
  { href: "/", label: "Sve", match: (p: string) => p === "/" || p.startsWith("/z/") || p.startsWith("/d/"), icon: <IconList /> },
  { href: "/moj", label: "Moj kalendar", match: (p: string) => p.startsWith("/moj"), icon: <IconBookmark /> },
  { href: "/objavi", label: "Objavi", match: (p: string) => p.startsWith("/objavi"), icon: <IconSend /> },
];

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const me = useMe();
  return (
    <nav className="nav" aria-label="Glavna navigacija">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.icon}
          {l.label}
          <LinkHint />
        </Link>
      ))}
      {me.user ? (
        <Link href="/racun" aria-current={pathname.startsWith("/racun") || pathname.startsWith("/organizacija") ? "page" : undefined}>
          <IconUser />
          {me.user.name.split(" ")[0] || "Račun"}
          <LinkHint />
        </Link>
      ) : (
        <Link href="/prijava" prefetch={false} aria-current={pathname.startsWith("/prijava") ? "page" : undefined}>
          <IconUser />
          Prijava
          <LinkHint />
        </Link>
      )}
    </nav>
  );
}
