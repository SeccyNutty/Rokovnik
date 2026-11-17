"use client";

import { useMemo, useState } from "react";
import { CopyButton } from "./CopyButton";

/** Slaganje koda za ugradnju: izbor postavki, pregled uživo i kôd spreman za kopiranje. */
export function WidgetBuilder({ origin, slug, name }: { origin: string; slug: string; name: string }) {
  const [prikaz, setPrikaz] = useState("popis");
  const [vrsta, setVrsta] = useState("");
  const [broj, setBroj] = useState("12");
  const [kontrole, setKontrole] = useState(true);
  const [tamna, setTamna] = useState(false);
  const [boja, setBoja] = useState("");

  const { code, iframeCode, previewSrc } = useMemo(() => {
    const attrs = [`data-rokovnik="${slug}"`];
    const q = new URLSearchParams();
    const set = (attr: string, key: string, value: string) => {
      attrs.push(`data-${attr}="${value}"`);
      q.set(key, value.replace("#", ""));
    };
    if (prikaz === "mjesec") set("prikaz", "prikaz", "mjesec");
    if (vrsta) set("vrsta", "vrsta", vrsta);
    if (broj !== "12" && prikaz !== "mjesec") set("broj", "broj", broj);
    if (!kontrole) set("kontrole", "kontrole", "ne");
    if (tamna) set("tema", "tema", "tamna");
    if (/^#[0-9a-f]{6}$/i.test(boja)) set("boja", "boja", boja);
    const qs = q.toString();
    const src = `${origin}/ugradi/${slug}${qs ? `?${qs}` : ""}`;
    return {
      code: `<script async src="${origin}/widget.js" ${attrs.join(" ")}></script>`,
      iframeCode: `<iframe src="${src}" title="${name}: događaji i rokovi" style="width:100%;height:600px;border:0" loading="lazy"></iframe>`,
      previewSrc: src,
    };
  }, [origin, slug, name, prikaz, vrsta, broj, kontrole, tamna, boja]);

  return (
    <div className="builder">
      <div className="paper paper--pad builder__opts">
        <div className="field">
          <label htmlFor="w-prikaz">Prikaz</label>
          <select id="w-prikaz" value={prikaz} onChange={(e) => setPrikaz(e.target.value)}>
            <option value="popis">Popis po danima</option>
            <option value="mjesec">Mjesec</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-vrsta">Što prikazati</label>
          <select id="w-vrsta" value={vrsta} onChange={(e) => setVrsta(e.target.value)}>
            <option value="">Događaje i rokove</option>
            <option value="dogadaji">Samo događaje</option>
            <option value="rokovi">Samo rokove</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-broj">Najviše stavki u popisu</label>
          <select id="w-broj" value={broj} onChange={(e) => setBroj(e.target.value)} disabled={prikaz === "mjesec"}>
            {["5", "8", "12", "20", "30", "50"].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="w-boja">Boja isticanja</label>
          <input id="w-boja" value={boja} onChange={(e) => setBoja(e.target.value.trim())} placeholder="#2343d3" maxLength={7} />
        </div>
        <label className="check">
          <input type="checkbox" checked={kontrole} onChange={(e) => setKontrole(e.target.checked)} />
          <span>Filtri i izbor prikaza</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={tamna} onChange={(e) => setTamna(e.target.checked)} />
          <span>Tamna tema</span>
        </label>
      </div>

      <h2 className="aside__title" style={{ marginTop: 22 }}>
        Kôd za tvoju stranicu
      </h2>
      <p className="note">Zalijepi ga na mjesto gdje želiš kalendar. Visina se sama prilagođava sadržaju, a nove objave stižu bez ikakve izmjene.</p>
      <pre className="code" data-testid="widget-code">
        {code}
      </pre>
      <div className="linkrow">
        <CopyButton text={code} label="Kopiraj kôd" className="btn" />
      </div>
      <details className="more">
        <summary>Stranica ne dopušta skripte? Koristi obični okvir</summary>
        <pre className="code">{iframeCode}</pre>
        <div className="linkrow">
          <CopyButton text={iframeCode} label="Kopiraj okvir" className="btn btn--quiet" />
        </div>
      </details>

      <h2 className="aside__title" style={{ marginTop: 22 }}>
        Pregled
      </h2>
      <div className="paper builder__preview">
        <iframe key={previewSrc} src={previewSrc} title="Pregled ugrađenog kalendara" style={{ width: "100%", height: 520, border: 0, display: "block" }} />
      </div>
    </div>
  );
}
