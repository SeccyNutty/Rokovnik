import { notFound } from "next/navigation";
import { baseUrl } from "@/lib/base-url";
import { APP_NAME } from "@/lib/config";
import { getCommunityBySlug, listUpcoming, toView } from "@/lib/queries";
import { dateKey, MONTHS_SHORT, WEEKDAYS_SHORT, weekdayOfKey } from "@/lib/time";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ broj?: string; vrsta?: string }> };

/** Sažeti kalendar zajednice za ugradnju (iframe) na stranicu organizacije. */
export default async function EmbedPage({ params, searchParams }: Props) {
  const [{ slug }, sp, origin] = await Promise.all([params, searchParams, baseUrl()]);
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  const limit = Math.min(Math.max(Number(sp.broj) || 12, 1), 50);
  const kind = sp.vrsta === "rokovi" ? "deadline" : sp.vrsta === "dogadaji" ? "event" : undefined;
  const now = new Date();
  const todayKey = dateKey(now);
  const views = (await listUpcoming({ communityIds: [community.id], kind, limit }, now)).map((r) => toView(r, origin, now));
  const days = new Map<string, typeof views>();
  for (const v of views) days.set(v.dayKey, [...(days.get(v.dayKey) ?? []), v]);

  return (
    <div className="embed">
      <div className="agenda">
        {views.length === 0 ? (
          <div className="empty">
            <p>Trenutno nema nadolazećih objava.</p>
          </div>
        ) : (
          [...days.entries()].map(([key, list]) => {
            const [, month, day] = key.split("-").map(Number);
            return (
              <section key={key} className={key === todayKey ? "day day--today" : "day"}>
                <div className="day__date">
                  <span className="day__num">{day}</span>
                  <span className="day__wd">{key === todayKey ? "danas" : WEEKDAYS_SHORT[weekdayOfKey(key)]}</span>
                  <span className="day__mo">{MONTHS_SHORT[month - 1]}</span>
                </div>
                <ul className="day__list">
                  {list.map((item) => (
                    <li key={item.id}>
                      <a className={item.kind === "deadline" ? "entry entry--rok" : "entry"} href={item.pageUrl} target="_blank" rel="noopener">
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
                          <span className="entry__meta">{item.location ?? item.categoryLabel}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
      <div className="embed__foot">
        <a href={`${origin}/z/${community.slug}`} target="_blank" rel="noopener">
          Cijeli kalendar i pretplata
        </a>
        <span className="muted">{APP_NAME}</span>
      </div>
    </div>
  );
}
