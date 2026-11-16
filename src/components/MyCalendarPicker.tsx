"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { countLabel } from "./CommunityList";

const STORAGE_KEY = "rokovnik:moje-zajednice";

type Option = { slug: string; name: string; upcoming: number };

/**
 * Izbor zajednica za "Moj kalendar". Izbor se pamti na uređaju (bez korisničkog
 * računa) i vidi se u adresi, pa se stranica može i podijeliti.
 */
export function MyCalendarPicker(props: { options: Option[]; selected: string[]; hasParam: boolean }) {
  const router = useRouter();

  useEffect(() => {
    try {
      if (props.hasParam) {
        window.localStorage.setItem(STORAGE_KEY, props.selected.join(","));
        return;
      }
      const saved = (window.localStorage.getItem(STORAGE_KEY) ?? "").split(",").filter(Boolean);
      const valid = saved.filter((s) => props.options.some((o) => o.slug === s));
      if (valid.length) router.replace(`/moj?${valid.map((s) => `z=${encodeURIComponent(s)}`).join("&")}`);
    } catch {
      /* bez pamćenja */
    }
  }, [props.hasParam, props.selected, props.options, router]);

  const toggle = (slug: string, on: boolean) => {
    const next = props.options.map((o) => o.slug).filter((s) => (s === slug ? on : props.selected.includes(s)));
    try {
      window.localStorage.setItem(STORAGE_KEY, next.join(","));
    } catch {
      /* bez pamćenja */
    }
    router.replace(next.length ? `/moj?${next.map((s) => `z=${encodeURIComponent(s)}`).join("&")}` : "/moj?z=", { scroll: false });
  };

  return (
    <form className="paper" method="get" action="/moj">
      {props.options.map((o) => (
        <label key={o.slug} className="check">
          <input type="checkbox" name="z" value={o.slug} checked={props.selected.includes(o.slug)} onChange={(e) => toggle(o.slug, e.target.checked)} />
          <span>
            <b style={{ fontWeight: 650 }}>{o.name}</b>
            <span className="clist__count">{countLabel(o.upcoming)}</span>
          </span>
        </label>
      ))}
      <noscript>
        <div style={{ padding: 12 }}>
          <button className="btn btn--block" type="submit">
            Prikaži
          </button>
        </div>
      </noscript>
    </form>
  );
}
