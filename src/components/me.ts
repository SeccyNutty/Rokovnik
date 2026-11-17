"use client";

import { useSyncExternalStore } from "react";

/**
 * Stanje prijavljenog korisnika u pregledniku: tko je, što prati i što je spremio.
 * Dohvaća se jednom po učitavanju stranice, i to samo ako postoji oznaka prijave,
 * pa gosti ne šalju nijedan dodatni zahtjev.
 */
export type Me = {
  loaded: boolean;
  user: { name: string; email: string; vrsta: "admin" | "organizacija" | "korisnik" } | null;
  prati: string[];
  spremljeno: string[];
};

const GUEST: Me = { loaded: true, user: null, prati: [], spremljeno: [] };
const SERVER: Me = { loaded: false, user: null, prati: [], spremljeno: [] };

let state: Me = SERVER;
let started = false;
const listeners = new Set<() => void>();

function set(next: Me) {
  state = next;
  listeners.forEach((l) => l());
}

async function load() {
  if (!document.cookie.split("; ").some((c) => c.startsWith("rokovnik_prijavljen="))) return set(GUEST);
  try {
    const res = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
    const data = (await res.json()) as { user: Me["user"]; prati?: string[]; spremljeno?: string[] };
    set(data.user ? { loaded: true, user: data.user, prati: data.prati ?? [], spremljeno: data.spremljeno ?? [] } : GUEST);
  } catch {
    set(GUEST);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!started) {
    started = true;
    void load();
  }
  return () => listeners.delete(listener);
}

export function useMe(): Me {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}

export function setSavedLocal(itemId: string, on: boolean) {
  const rest = state.spremljeno.filter((x) => x !== itemId);
  set({ ...state, spremljeno: on ? [...rest, itemId] : rest });
}

export function setFollowLocal(slug: string, on: boolean) {
  const rest = state.prati.filter((x) => x !== slug);
  set({ ...state, prati: on ? [...rest, slug] : rest });
}
