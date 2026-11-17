"use client";

import { useState } from "react";
import { subscribeLinks } from "@/lib/calendar-links";
import { CopyButton } from "./CopyButton";
import { IconBell } from "./icons";
import { Sheet } from "./Sheet";

/**
 * Pretplata na cijeli kalendar: korisnik ga jednim klikom dodaje u svoju
 * aplikaciju, a ona ga sama osvježava kad zajednica objavi nešto novo.
 */
export function Subscribe(props: { baseUrl: string; feedPath: string; name: string; label?: string; block?: boolean }) {
  const [open, setOpen] = useState(false);
  const [onlyDeadlines, setOnlyDeadlines] = useState(false);
  const sep = props.feedPath.includes("?") ? "&" : "?";
  const path = onlyDeadlines ? `${props.feedPath}${sep}vrsta=rokovi` : props.feedPath;
  const links = subscribeLinks(props.baseUrl, path, onlyDeadlines ? `${props.name} (rokovi)` : props.name);

  return (
    <>
      <button type="button" className={props.block ? "btn btn--block" : "btn"} onClick={() => setOpen(true)} data-feed={`${props.baseUrl}${props.feedPath}`}>
        <IconBell />
        {props.label ?? "Prati u svom kalendaru"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Prati kalendar">
        <h2 style={{ paddingRight: 40 }}>Prati „{props.name}” u svom kalendaru</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Kalendar se dodaje u tvoju aplikaciju jednom, a novi događaji i rokovi pojavljuju se sami.
        </p>
        <label className="check paper" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={onlyDeadlines} onChange={(e) => setOnlyDeadlines(e.target.checked)} />
          <span>Samo rokovi, bez događaja</span>
        </label>
        <div className="addcal__options" style={{ marginTop: 14 }}>
          <a className="btn" href={links.google} target="_blank" rel="noopener noreferrer">Google kalendar</a>
          <a className="btn" href={links.webcal}>Apple kalendar</a>
          <a className="btn btn--quiet" href={links.outlook} target="_blank" rel="noopener noreferrer">Outlook.com</a>
          <a className="btn btn--quiet" href={links.office} target="_blank" rel="noopener noreferrer">Microsoft 365</a>
        </div>
        <p className="addcal__hint">Druga aplikacija? Kopiraj adresu kalendara i dodaj je kao „kalendar s interneta”.</p>
        <div className="linkrow" style={{ marginBottom: 18 }}>
          <input readOnly value={links.feed} aria-label="Adresa kalendara" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={links.feed} />
        </div>
      </Sheet>
    </>
  );
}
