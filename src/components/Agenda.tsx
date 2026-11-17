"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { ItemView } from "@/lib/queries";
import { MONTHS_SHORT, WEEKDAYS_SHORT, weekdayOfKey } from "@/lib/time";
import { AddToCalendar } from "./AddToCalendar";
import { CopyButton } from "./CopyButton";
import { ItemDetail } from "./ItemDetail";
import { Sheet } from "./Sheet";

/**
 * Popis po danima. Klik na stavku otvara opis, a na dnu opisa je
 * "Dodaj u moj kalendar".
 */
export function Agenda(props: {
  items: ItemView[];
  todayKey: string;
  showCommunity: boolean;
  empty: ReactNode;
  /** Ugrađeni kalendar (widget): stavka se otvara kao stranica u novoj kartici umjesto prozora s opisom. */
  external?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const days = useMemo(() => {
    const map = new Map<string, ItemView[]>();
    for (const item of props.items) {
      const list = map.get(item.dayKey);
      if (list) list.push(item);
      else map.set(item.dayKey, [item]);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [props.items]);
  const open = openId ? (props.items.find((i) => i.id === openId) ?? null) : null;

  if (!days.length) return <div className="agenda">{props.empty}</div>;

  return (
    <>
      <div className="agenda">
        {days.map(([key, list]) => {
          const [, month, day] = key.split("-").map(Number);
          return (
            <section key={key} className={key === props.todayKey ? "day day--today" : "day"}>
              <div className="day__date">
                <span className="day__num">{day}</span>
                <span className="day__wd">{key === props.todayKey ? "danas" : WEEKDAYS_SHORT[weekdayOfKey(key)]}</span>
                <span className="day__mo">{MONTHS_SHORT[month - 1]}</span>
              </div>
              <ul className="day__list">
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={item.kind === "deadline" ? "entry entry--rok" : "entry"}
                      onClick={() => (props.external ? window.open(item.pageUrl, "_blank", "noopener") : setOpenId(item.id))}
                    >
                      <span className="entry__time">
                        {item.kind === "deadline" ? (
                          <>
                            <span className="rok">rok</span>
                            {item.timeLabel ? <small>{item.timeLabel}</small> : null}
                          </>
                        ) : /^\d/.test(item.timeLabel) ? (
                          item.timeLabel
                        ) : (
                          <small>{item.timeLabel}</small>
                        )}
                      </span>
                      <span>
                        <span className="entry__title">{item.title}</span>
                        <span className="entry__meta">
                          {props.showCommunity ? <b>{item.communityName}</b> : null}
                          {props.showCommunity && (item.location || item.categoryLabel) ? " · " : null}
                          {item.location ?? item.categoryLabel}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <Sheet
        open={!!open}
        onClose={() => setOpenId(null)}
        label={open?.title ?? "Opis"}
        footer={open ? <AddToCalendar key={open.id} links={open.links} itemId={open.id} /> : null}
      >
        {open ? (
          <>
            <ItemDetail item={open} />
            <p className="small muted" style={{ marginTop: 16 }}>
              <Link href={`/d/${open.id}`}>Otvori kao stranicu</Link>
              {" · "}
              <CopyButton text={open.pageUrl} label="Kopiraj poveznicu" className="linklike" />
            </p>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
