"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { requestOrganizationAction, type OrgRequestActionResult } from "@/app/search-actions";
import { countLabel, initials } from "./CommunityList";
import { LinkHint } from "./LinkHint";
import { useMe } from "./me";

type Item = { slug: string; name: string; kind: "organization" | "topic"; upcoming: number };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Pogodak po dijelu naziva, po početnim slovima ("fsb") ili po riječima u bilo kojem redu. */
function matches(item: Item, q: string): boolean {
  const name = norm(item.name);
  if (name.includes(q)) return true;
  if (norm(initials(item.name)) === q.replace(/ /g, "")) return true;
  const words = q.split(" ");
  return words.length > 1 && words.every((w) => name.includes(w));
}

const ERRORS: Record<string, string> = {
  naziv: "Upiši naziv organizacije (najmanje 3 znaka).",
  web: "Mrežna stranica treba početi s https:// (ili ostavi prazno).",
  email: "E-mail adresa nije ispravna (ili ostavi prazno).",
  limit: "Previše zahtjeva u kratkom vremenu. Pokušaj ponovno kasnije.",
};

/**
 * Pretraga zajednica. Ako tražene organizacije nema, posjetitelj može zatražiti da se pridruži:
 * zahtjev stiže administratoru mailom i u administraciju.
 */
export function CommunitySearch({ communities, row = false }: { communities: Item[]; row?: boolean }) {
  const me = useMe();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", note: "", email: "", hp: "" });
  const [result, setResult] = useState<OrgRequestActionResult | null>(null);
  const [pending, start] = useTransition();

  const q = norm(query);
  const shown = useMemo(() => (q ? communities.filter((c) => matches(c, q)) : communities), [communities, q]);
  const exact = shown.some((c) => norm(c.name) === q);
  const canRequest = q.length >= 3 && !exact;

  const openForm = () => {
    setForm((f) => ({ ...f, name: query.trim(), email: f.email || me.user?.email || "" }));
    setResult(null);
    setOpen(true);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => setResult(await requestOrganizationAction(form)));
  };
  const field = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  const idp = row ? "m" : "d";

  return (
    <div>
      <div className="search">
        <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          aria-label="Pretraži zajednice"
          placeholder="Pretraži zajednice i organizacije"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(false);
          }}
        />
      </div>

      {shown.length ? (
        <div className={row ? "" : "paper"} style={{ marginTop: 10 }}>
          <ul className={row ? "clist clist--row" : "clist"}>
            {shown.map((c) => (
              <li key={c.slug}>
                <Link href={`/z/${c.slug}`}>
                  <span className="clist__badge" aria-hidden>
                    {initials(c.name)}
                  </span>
                  <span>
                    <span className="clist__name">
                      {c.name}
                      {c.kind === "topic" ? <span className="clist__kind">tema</span> : null}
                    </span>
                    <span className="clist__count">{countLabel(c.upcoming)}</span>
                    <LinkHint />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : q ? (
        <div className="paper search__none" style={{ marginTop: 10 }}>
          Nema zajednice „{query.trim()}”.
        </div>
      ) : null}

      {canRequest && !open ? (
        <p className="note" style={{ margin: "10px 0 0" }}>
          {shown.length ? `Ne vidiš „${query.trim()}”? ` : "Organizacija još nije u Rokovniku. "}
          <button type="button" className="linkbtn" onClick={openForm}>
            Zatraži da se pridruži
          </button>
        </p>
      ) : null}

      {open ? (
        <form className="orgreq" onSubmit={submit}>
          {result?.ok ? (
            <div role="status">
              <h3>Zahtjev je zabilježen</h3>
              <p style={{ margin: 0 }}>
                Hvala! Javit ćemo se organizaciji „{form.name}”.{result.count > 1 ? ` Ukupno zahtjeva za nju: ${result.count}.` : ""}
                {form.email ? " Kad se pridruži, dobit ćeš obavijest." : ""}
              </p>
            </div>
          ) : (
            <>
              <h3>Zatraži da se organizacija pridruži</h3>
              <p className="small muted" style={{ marginTop: 0 }}>
                Zahtjev ide administratoru Rokovnika, koji kontaktira organizaciju. Za njih je objava jednostavna: šalju obične mailove.
              </p>
              {result && !result.ok ? (
                <div className="flash flash--err">
                  {result.reason === "postoji" && result.slug ? (
                    <>
                      Ta zajednica već postoji: <Link href={`/z/${result.slug}`}>otvori je</Link>.
                    </>
                  ) : (
                    ERRORS[result.reason]
                  )}
                </div>
              ) : null}
              <div className="field">
                <label htmlFor={`or-name-${idp}`}>Naziv organizacije</label>
                <input id={`or-name-${idp}`} required maxLength={120} {...field("name")} />
              </div>
              <div className="field">
                <label htmlFor={`or-web-${idp}`}>Mrežna stranica (neobavezno)</label>
                <input id={`or-web-${idp}`} type="url" placeholder="https://" maxLength={200} {...field("website")} />
              </div>
              <div className="field">
                <label htmlFor={`or-mail-${idp}`}>Tvoj e-mail za obavijest kad se pridruže (neobavezno)</label>
                <input id={`or-mail-${idp}`} type="email" maxLength={200} {...field("email")} />
              </div>
              <div className="field">
                <label htmlFor={`or-note-${idp}`}>Napomena (neobavezno)</label>
                <input id={`or-note-${idp}`} maxLength={500} placeholder="npr. objavljuju radionice i upise" {...field("note")} />
              </div>
              <div className="hp" aria-hidden>
                <label htmlFor={`or-hp-${idp}`}>Ne ispunjavaj</label>
                <input id={`or-hp-${idp}`} tabIndex={-1} autoComplete="off" {...field("hp")} />
              </div>
              <div className="linkrow">
                <button className="btn" type="submit" disabled={pending}>
                  {pending ? "Šaljem…" : "Pošalji zahtjev"}
                </button>
                <button className="btn btn--quiet" type="button" onClick={() => setOpen(false)}>
                  Odustani
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}
    </div>
  );
}
