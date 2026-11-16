"use client";

import { useState, useSyncExternalStore } from "react";
import type { AddLinks } from "@/lib/calendar-links";
import { IconCalendarPlus } from "./icons";

type Choice = keyof AddLinks;

const OPTIONS: { key: Choice; label: string; short: string }[] = [
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
    return OPTIONS.some((o) => o.key === v) ? (v as Choice) : null;
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
 * "Dodaj u moj kalendar" za jedan događaj. Prvi put se bira aplikacija (dva klika),
 * izbor se pamti na uređaju pa je svako sljedeće dodavanje jedan klik.
 */
export function AddToCalendar({ links }: { links: AddLinks }) {
  // Zapamćeni izbor čita se s uređaja; na poslužitelju ga nema.
  const choice = useSyncExternalStore(subscribe, readChoice, () => null);
  const [open, setOpen] = useState(false);

  const remember = (key: Choice) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* privatni način rada: bez pamćenja */
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
    setOpen(false);
  };
  const linkProps = (key: Choice) =>
    key === "ics" ? { href: links.ics } : { href: links[key], target: "_blank", rel: "noopener noreferrer" };

  const preferred = OPTIONS.find((o) => o.key === choice);

  return (
    <div className="addcal">
      {preferred && !open ? (
        <div className="addcal__row">
          <a className="btn" {...linkProps(preferred.key)}>
            <IconCalendarPlus />
            Dodaj u {preferred.short}
          </a>
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
          {OPTIONS.map((o) => (
            <a key={o.key} className="btn btn--quiet" {...linkProps(o.key)} onClick={() => remember(o.key)}>
              {o.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
