"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import type { AddLinks } from "@/lib/calendar-links";
import { parseSaved, SAVED_COOKIE, serializeSaved } from "@/lib/saved";
import { IconCalendarPlus } from "./icons";

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

/** Sirova vrijednost kolačića sa spremljenim stavkama (tekst, da usporedba ostane stabilna). */
function readSavedRaw(): string {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${SAVED_COOKIE}=`));
  return hit ? hit.slice(SAVED_COOKIE.length + 1) : "";
}

function writeSaved(ids: string[]) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = ids.length
    ? `${SAVED_COOKIE}=${serializeSaved(ids)}; Path=/; Max-Age=${400 * 24 * 3600}; SameSite=Lax${secure}`
    : `${SAVED_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGE_EVENT));
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
 * "Dodaj u moj kalendar" za jedan događaj: u Moj kalendar u Rokovniku (pamti se na uređaju,
 * bez prijave) ili u vlastitu kalendarsku aplikaciju. Prvi put se bira odredište (dva klika),
 * izbor se pamti pa je svako sljedeće dodavanje jedan klik.
 */
export function AddToCalendar({ links, itemId }: { links: AddLinks; itemId: string }) {
  const router = useRouter();
  // Zapamćeni izbor i spremljene stavke čitaju se s uređaja; na poslužitelju ih nema.
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const savedRaw = useSyncExternalStore(subscribe, readSavedRaw, () => "");
  const [open, setOpen] = useState(false);
  const saved = parseSaved(savedRaw).includes(itemId.toLowerCase());

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
    const id = itemId.toLowerCase();
    const rest = parseSaved(readSavedRaw()).filter((x) => x !== id);
    writeSaved(saved ? rest : [...rest, id]);
    if (!saved) remember("rokovnik");
    // Na stranici "Moj kalendar" popis se slaže na poslužitelju, pa ga treba osvježiti.
    router.refresh();
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
          Spremljeno na ovom uređaju. <Link href="/moj">Otvori Moj kalendar</Link>
        </p>
      ) : open ? (
        <p className="addcal__hint">Moj kalendar je ovdje u Rokovniku, bez prijave. Ostalo otvara tvoju kalendarsku aplikaciju.</p>
      ) : null}
    </div>
  );
}
