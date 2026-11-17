import Link from "next/link";
import type { CommunityWithCount } from "@/lib/queries";
import { LinkHint } from "./LinkHint";

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

export function countLabel(n: number): string {
  if (n === 0) return "trenutno bez objava";
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} nadolazeća objava`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} nadolazeće objave`;
  return `${n} nadolazećih objava`;
}

export function CommunityList({ communities, row = false }: { communities: CommunityWithCount[]; row?: boolean }) {
  return (
    <ul className={row ? "clist clist--row" : "clist"}>
      {communities.map((c) => (
        <li key={c.id}>
          <Link href={`/z/${c.slug}`}>
            <span className="clist__badge" aria-hidden>
              {initials(c.name)}
            </span>
            <span>
              <span className="clist__name">{c.name}</span>
              <span className="clist__count">{countLabel(c.upcoming)}</span>
              <LinkHint />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
