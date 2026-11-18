import Link from "next/link";
import type { ReactNode } from "react";
import { baseUrl } from "@/lib/base-url";
import { listItems, listTagCounts, listUpcoming, toView } from "@/lib/queries";
import { isTag, tagLabel } from "@/lib/tags";
import { addDays, dateKey, formatDateLong, isValidDateKey, MONTHS_NOMINATIVE, WEEKDAYS_SHORT, weekdayOfKey, zonedToUtc } from "@/lib/time";
import { Agenda } from "./Agenda";
import { IconNext, IconPrev } from "./icons";
import { LinkHint } from "./LinkHint";

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function hrefWith(basePath: string, params: SearchParams, changes: Record<string, string | null>, hash = ""): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || k in changes) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  for (const [k, v] of Object.entries(changes)) if (v) q.set(k, v);
  const s = q.toString();
  return `${basePath}${s ? `?${s}` : ""}${hash}`;
}

/**
 * Kalendar zajednice (ili više njih): popis po danima ili mjesec, s filtrom
 * "sve / događaji / rokovi". Stanje je u adresi, pa radi i bez JavaScripta.
 */
export async function CalendarView(props: {
  basePath: string;
  params: SearchParams;
  communityIds?: string[];
  /** Oznake tematskih zajednica: stavke s barem jednom od njih. */
  anyTags?: string[];
  /** Pojedinačno spremljene stavke, uz stavke odabranih zajednica. */
  itemIds?: string[];
  showCommunity: boolean;
  empty: ReactNode;
  /** Najviše stavki u popisu (zadano 150). */
  limit?: number;
  /** Ugrađeni kalendar: stavke se otvaraju u novoj kartici. */
  external?: boolean;
  /** Sakrij filtre i izbor prikaza (ugrađeni kalendar s fiksnim postavkama). */
  hideControls?: boolean;
}) {
  const { basePath, params } = props;
  const vrsta = one(params.vrsta);
  const kind = vrsta === "rokovi" ? "deadline" : vrsta === "dogadaji" ? "event" : undefined;
  const month = one(params.prikaz) === "mjesec";
  const temaParam = one(params.tema);
  const tag = isTag(temaParam) ? temaParam : undefined;
  const now = new Date();
  const todayKey = dateKey(now);
  const scope = { communityIds: props.communityIds, anyTags: props.anyTags, itemIds: props.itemIds };
  const [origin, tagCounts] = await Promise.all([baseUrl(), props.hideControls ? Promise.resolve([]) : listTagCounts({ ...scope, kind }, now)]);
  // Odabrana tema ostaje u izborniku i kad trenutno nema objava.
  const shownTags = tagCounts.slice(0, 14);
  if (tag && !shownTags.some((t) => t.key === tag)) shownTags.push({ key: tag, n: 0 });

  const controls = props.hideControls ? null : (
    <div className="controls">
      <div className="chips" role="group" aria-label="Vrsta">
        <Link className="chip" href={hrefWith(basePath, params, { vrsta: null, dan: null })} aria-current={!kind ? "true" : undefined}>
          Sve
          <LinkHint />
        </Link>
        <Link className="chip" href={hrefWith(basePath, params, { vrsta: "dogadaji", dan: null })} aria-current={kind === "event" ? "true" : undefined}>
          <span className="chip__dot" />
          Događaji
          <LinkHint />
        </Link>
        <Link className="chip" href={hrefWith(basePath, params, { vrsta: "rokovi", dan: null })} aria-current={kind === "deadline" ? "true" : undefined}>
          <span className="chip__dot chip__dot--rok" />
          Rokovi
          <LinkHint />
        </Link>
      </div>
      <div className="seg" role="group" aria-label="Prikaz">
        <Link href={hrefWith(basePath, params, { prikaz: null, m: null, dan: null })} aria-current={!month ? "true" : undefined}>
          Popis
          <LinkHint />
        </Link>
        <Link href={hrefWith(basePath, params, { prikaz: "mjesec" })} aria-current={month ? "true" : undefined}>
          Mjesec
          <LinkHint />
        </Link>
      </div>
      {shownTags.length > 1 || tag ? (
        <div className="chips chips--tags" role="group" aria-label="Tema">
          <Link className="chip chip--tag" href={hrefWith(basePath, params, { tema: null, dan: null })} aria-current={!tag ? "true" : undefined}>
            Sve teme
            <LinkHint />
          </Link>
          {shownTags.map((t) => (
            <Link key={t.key} className="chip chip--tag" href={hrefWith(basePath, params, { tema: t.key, dan: null })} aria-current={tag === t.key ? "true" : undefined}>
              {tagLabel(t.key)}
              {t.n ? <span className="chip__n">{t.n}</span> : null}
              <LinkHint />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (!month) {
    const rows = await listUpcoming({ ...scope, kind, tag, limit: props.limit ?? 150 }, now);
    return (
      <>
        {controls}
        <Agenda items={rows.map((r) => toView(r, origin, now))} todayKey={todayKey} showCommunity={props.showCommunity} empty={props.empty} external={props.external} />
      </>
    );
  }

  // ── Mjesec ──
  const mParam = one(params.m);
  const m = mParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(mParam) ? mParam : todayKey.slice(0, 7);
  const [year, monthNo] = m.split("-").map(Number);
  const firstKey = `${m}-01`;
  const nextMonth = monthNo === 12 ? `${year + 1}-01` : `${year}-${String(monthNo + 1).padStart(2, "0")}`;
  const prevMonth = monthNo === 1 ? `${year - 1}-12` : `${year}-${String(monthNo - 1).padStart(2, "0")}`;
  const lastKey = addDays(`${nextMonth}-01`, -1);
  const gridStart = addDays(firstKey, -weekdayOfKey(firstKey));
  const gridEnd = addDays(lastKey, 6 - weekdayOfKey(lastKey));
  const cells: string[] = [];
  for (let k = gridStart; k <= gridEnd; k = addDays(k, 1)) cells.push(k);

  const rows = await listItems({ ...scope, kind, tag, from: zonedToUtc(gridStart), to: zonedToUtc(addDays(gridEnd, 1)), limit: 400 });
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const start = dateKey(r.startsAt);
    const end = r.endsAt && r.kind === "event" ? dateKey(r.endsAt) : start;
    for (let k = start < gridStart ? gridStart : start; k <= end && k <= gridEnd; k = addDays(k, 1)) {
      const list = byDay.get(k);
      if (list) list.push(r);
      else byDay.set(k, [r]);
    }
  }

  const danParam = one(params.dan);
  let selected = danParam && isValidDateKey(danParam) && danParam >= gridStart && danParam <= gridEnd ? danParam : null;
  if (!selected) {
    if (todayKey >= firstKey && todayKey <= lastKey) selected = todayKey;
    else selected = cells.find((k) => k >= firstKey && k <= lastKey && byDay.has(k)) ?? firstKey;
  }
  const selectedItems = (byDay.get(selected) ?? []).map((r) => ({ ...toView(r, origin, now), dayKey: selected! }));

  return (
    <>
      {controls}
      <div className="month">
        <div className="month__bar">
          <div className="month__title">
            {MONTHS_NOMINATIVE[monthNo - 1]} {year}.
          </div>
          <div className="month__nav">
            <Link prefetch={false} href={hrefWith(basePath, params, { m: prevMonth, dan: null })} aria-label="Prethodni mjesec">
              <IconPrev />
              <LinkHint />
        </Link>
            <Link prefetch={false} href={hrefWith(basePath, params, { m: nextMonth, dan: null })} aria-label="Sljedeći mjesec">
              <IconNext />
              <LinkHint />
        </Link>
          </div>
        </div>
        <div className="month__grid">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="month__wd">
              {w}
            </div>
          ))}
          {cells.map((k) => {
            const list = byDay.get(k) ?? [];
            const cls = ["cell", k < firstKey || k > lastKey ? "cell--out" : "", k === todayKey ? "cell--today" : "", k === selected ? "cell--selected" : ""]
              .filter(Boolean)
              .join(" ");
            const label = `${formatDateLong(k)}${list.length ? `, stavki: ${list.length}` : ""}`;
            return (
              <Link key={k} prefetch={false} className={cls} href={hrefWith(basePath, params, { dan: k }, "#dan")} aria-label={label} scroll={false}>
                <span className="cell__num">{Number(k.slice(8))}</span>
                {list.length ? (
                  <>
                    <ul className="cell__items">
                      {list.slice(0, 2).map((r) => (
                        <li key={r.id} className={r.kind === "deadline" ? "is-rok" : undefined}>
                          {r.title}
                        </li>
                      ))}
                    </ul>
                    {list.length > 2 ? <div className="cell__more">još {list.length - 2}</div> : null}
                    <span className="cell__dots">
                      {list.slice(0, 4).map((r) => (
                        <i key={r.id} className={r.kind === "deadline" ? "is-rok" : undefined} />
                      ))}
                    </span>
                  </>
                ) : null}
                <LinkHint />
        </Link>
            );
          })}
        </div>
      </div>
      <h3 className="dayhead" id="dan">
        {formatDateLong(selected)}
      </h3>
      <Agenda
        items={selectedItems}
        todayKey={todayKey}
        showCommunity={props.showCommunity}
        external={props.external}
        empty={<div className="empty"><p>Za ovaj dan nema objava.</p></div>}
      />
    </>
  );
}
