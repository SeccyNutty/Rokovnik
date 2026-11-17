"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { AddLinks } from "@/lib/calendar-links";
import { toggleSavedAction } from "@/app/account-actions";
import { IconCalendarPlus } from "./icons";
import { LoginPrompt } from "./LoginPrompt";
import { setSavedLocal, useMe } from "./me";

type External = keyof AddLinks;
type Choice = External | "rokovnik";

const OPTIONS: { key: External; label: string; short: string }[] = [
  { key: "google", label: "Google kalendar", short: "Google kalendar" },
  { key: "ics", label: "Apple i ostali (.ics)", short: "Apple kalendar" },
  { key: "outlook", label: "Outlook.com", short: "Outlook" },
  { key: "office", label: "Microsoft 365", short: "Microsoft 365" },
];

const STORAGE_KEY = "rokovnik:kalendar";

const CHANGE_EVENT = "rokovnik:kalendar-promjena";

function readChoice(): Choice | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "rokovnik" || OPTIONS.some((o) => o.key === v) ? (v as Choice) : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * "Dodaj u moj kalendar" za jedan događaj: u Moj kalendar u Rokovniku (traži račun; gost
 * dobiva poziv na prijavu putem Googlea) ili u vlastitu kalendarsku aplikaciju (bez računa). Prvi put se bira odredište (dva klika),
 * izbor se pamti pa je svako sljedeće dodavanje jedan klik.
 */
export function AddToCalendar({ links, itemId }: { links: AddLinks; itemId: string }) {
  const router = useRouter();
  // Zapamćeni izbor aplikacije čita se s uređaja; spremljene stavke pripadaju računu.
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const me = useMe();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const saved = me.spremljeno.includes(itemId.toLowerCase());

  const remember = (key: Choice) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* privatni način rada: bez pamćenja */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setOpen(false);
  };
  const toggleSaved = () => {
    if (!me.user) return setAsk(true);
    const id = itemId.toLowerCase();
    const next = !saved;
    setSavedLocal(id, next);
    if (next) remember("rokovnik");
    void toggleSavedAction(id, next).then((res) => {
      if (!res.ok || res.on !== next) setSavedLocal(id, !next);
      if (!res.ok && res.reason === "login") setAsk(true);
      // Na stranici "Moj kalendar" popis se slaže na poslužitelju, pa ga treba osvježiti.
      router.refresh();
    });
  };
  const linkProps = (key: External) =>
    key === "ics" ? { href: links.ics } : { href: links[key], target: "_blank", rel: "noopener noreferrer" };

  const preferred = OPTIONS.find((o) => o.key === choice);
  const inApp = (inList: boolean) => (
    <button type="button" className={saved || inList ? "btn btn--quiet" : "btn"} aria-pressed={saved} onClick={toggleSaved}>
      <IconCalendarPlus />
      {saved ? "U Mom kalendaru · ukloni" : inList ? "Moj kalendar u Rokovniku" : "Dodaj u Moj kalendar"}
    </button>
  );

  return (
    <div className="addcal">
      {(preferred || choice === "rokovnik" || saved) && !open ? (
        <div className="addcal__row">
          {preferred && !saved ? (
            <a className="btn" {...linkProps(preferred.key)}>
              <IconCalendarPlus />
              Dodaj u {preferred.short}
            </a>
          ) : (
            inApp(false)
          )}
          <button type="button" className="btn btn--quiet" onClick={() => setOpen(true)}>
            Drugi
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn--block" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <IconCalendarPlus />
          Dodaj u moj kalendar
        </button>
      )}
      {open ? (
        <div className="addcal__options">
          <div className="addcal__inapp">{inApp(true)}</div>
          {OPTIONS.map((o) => (
            <a key={o.key} className="btn btn--quiet" {...linkProps(o.key)} onClick={() => remember(o.key)}>
              {o.label}
            </a>
          ))}
        </div>
      ) : null}
      {saved ? (
        <p className="addcal__hint">
          Spremljeno u tvoj račun. <Link href="/moj">Otvori Moj kalendar</Link>
        </p>
      ) : open ? (
        <p className="addcal__hint">Moj kalendar je ovdje u Rokovniku i traži prijavu. Ostalo otvara tvoju kalendarsku aplikaciju, bez računa.</p>
      ) : null}
      <LoginPrompt
        open={ask}
        onClose={() => setAsk(false)}
        title="Za Moj kalendar trebaš račun"
        text="Prijavi se i ovaj događaj se sprema u tvoj Moj kalendar. Dostupan je na svim tvojim uređajima."
        action={`spremi:${itemId.toLowerCase()}`}
      />
    </div>
  );
}
