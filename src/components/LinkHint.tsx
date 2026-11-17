"use client";

import { useLinkStatus } from "next/link";

/**
 * Stavlja se unutar <Link>. Dok navigacija traje, na vrhu ekrana pokaže tanku traku napretka,
 * pa je odmah vidljivo da je klik primljen i kad odgovor poslužitelja kasni.
 */
export function LinkHint() {
  const { pending } = useLinkStatus();
  return pending ? <span className="navprogress" aria-hidden /> : null;
}
