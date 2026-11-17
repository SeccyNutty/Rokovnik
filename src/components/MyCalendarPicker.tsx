"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toggleFollowAction } from "@/app/account-actions";
import { countLabel } from "./CommunityList";
import { setFollowLocal } from "./me";

type Option = { slug: string; name: string; upcoming: number };

/** Zajednice koje korisnik prati. Kvačica reagira odmah, a izbor se sprema u račun. */
export function MyCalendarPicker(props: { options: Option[]; selected: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(props.selected);
  const [seen, setSeen] = useState(props.selected);
  if (seen !== props.selected) {
    setSeen(props.selected);
    setSelected(props.selected);
  }

  const toggle = (slug: string, on: boolean) => {
    setSelected((cur) => (on ? [...cur.filter((s) => s !== slug), slug] : cur.filter((s) => s !== slug)));
    setFollowLocal(slug, on);
    void toggleFollowAction(slug, on).then(() => router.refresh());
  };

  return (
    <div className="paper">
      {props.options.map((o) => (
        <label key={o.slug} className="check">
          <input type="checkbox" checked={selected.includes(o.slug)} onChange={(e) => toggle(o.slug, e.target.checked)} />
          <span>
            <b style={{ fontWeight: 650 }}>{o.name}</b>
            <span className="clist__count">{countLabel(o.upcoming)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
