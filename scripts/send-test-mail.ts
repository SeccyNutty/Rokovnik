/**
 * Šalje testni mail na pokrenutu aplikaciju kroz općeniti ulaz (/api/inbound/generic).
 *   INBOUND_SECRET=... pnpm mail:test --from "Okružnica <okruznica@fsb.unizg.hr>" --subject "Predavanje" --text "…15. 12. 2026. u 14:15…"
 *   … --file mail.txt   (tekst maila iz datoteke)   --url https://moja-domena.hr
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const secret = process.env.INBOUND_SECRET;
  if (!secret) throw new Error("Postavi INBOUND_SECRET (isti kao u aplikaciji).");
  const file = arg("file");
  const body = JSON.stringify({
    messageId: `cli-${Date.now()}`,
    from: arg("from") ?? "Test <test@primjer.hr>",
    subject: arg("subject") ?? "Testna obavijest",
    text: file ? readFileSync(file, "utf8") : (arg("text") ?? ""),
    date: new Date().toISOString(),
  });
  const url = `${(arg("url") ?? "http://localhost:3000").replace(/\/+$/, "")}/api/inbound/generic`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
    body,
  });
  console.log(res.status, await res.text());
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
