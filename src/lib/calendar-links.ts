import { calendarDescription, calendarTitle, eventSpan, utcStamp, type IcsItem } from "./ics";

/**
 * Poveznice "Dodaj u moj kalendar". Nema integracije s pojedinim servisima:
 * Google i Outlook dobivaju unaprijed ispunjen događaj, ostali .ics datoteku,
 * a pretplata na cijeli kalendar ide preko ICS adrese koju svi podržavaju.
 */

export type AddLinks = { google: string; outlook: string; office: string; ics: string };

export function addEventLinks(i: IcsItem, baseUrl: string): AddLinks {
  const span = eventSpan(i);
  const title = calendarTitle(i);
  const details = calendarDescription(i, `${baseUrl}/d/${i.id}`);
  const location = i.location || i.onlineUrl || "";

  const g = new URLSearchParams({ action: "TEMPLATE", text: title, details, location });
  g.set(
    "dates",
    span.allDay
      ? `${span.startKey.replace(/-/g, "")}/${span.endKeyExclusive.replace(/-/g, "")}`
      : `${utcStamp(span.start)}/${utcStamp(span.end)}`,
  );

  const o = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: title, body: details, location });
  if (span.allDay) {
    o.set("startdt", span.startKey);
    o.set("enddt", span.endKeyExclusive);
    o.set("allday", "true");
  } else {
    o.set("startdt", span.start.toISOString());
    o.set("enddt", span.end.toISOString());
    o.set("allday", "false");
  }
  const oq = o.toString();

  return {
    google: `https://calendar.google.com/calendar/render?${g.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${oq}`,
    office: `https://outlook.office.com/calendar/0/deeplink/compose?${oq}`,
    ics: `${baseUrl}/ics/d/${i.id}.ics`,
  };
}

export type SubscribeLinks = { feed: string; webcal: string; google: string; outlook: string; office: string };

/** Poveznice za pretplatu na cijeli kalendar (feedPath npr. "/ics/fsb.ics"). */
export function subscribeLinks(baseUrl: string, feedPath: string, name: string): SubscribeLinks {
  const feed = `${baseUrl}${feedPath}`;
  const webcal = feed.replace(/^https?:\/\//, "webcal://");
  const add = new URLSearchParams({ url: feed, name }).toString();
  return {
    feed,
    webcal,
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?${add}`,
    office: `https://outlook.office.com/calendar/0/addfromweb?${add}`,
  };
}
