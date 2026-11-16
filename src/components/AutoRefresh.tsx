"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Dok se mailovi obrađuju u pozadini, stranica se sama osvježava dok obrada ne završi. */
export function AutoRefresh({ active, everyMs = 2500 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), everyMs);
    const stop = setTimeout(() => clearInterval(t), 90_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [active, everyMs, router]);
  return null;
}
