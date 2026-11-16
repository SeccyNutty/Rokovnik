import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { adminPassword, isProd } from "@/lib/config";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prijava", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ greska?: string }> }) {
  if (await isAdmin()) redirect("/admin");
  const { greska } = await searchParams;
  const configured = !!adminPassword();
  return (
    <div style={{ maxWidth: 420 }}>
      <div className="pagehead">
        <h1>Administracija</h1>
      </div>
      {greska === "lozinka" ? <div className="flash flash--err">Lozinka nije točna.</div> : null}
      {greska === "previse" ? <div className="flash flash--err">Previše pokušaja. Pokušaj ponovno za 10 minuta.</div> : null}
      {!configured ? <div className="flash flash--err">Lozinka nije postavljena. Postavi varijablu ADMIN_PASSWORD.</div> : null}
      <form action={loginAction} className="paper paper--pad">
        <div className="field">
          <label htmlFor="lozinka">Lozinka</label>
          <input id="lozinka" name="lozinka" type="password" autoComplete="current-password" required autoFocus />
          {!isProd && !process.env.ADMIN_PASSWORD ? <small>Lokalni razvoj: lozinka je „rokovnik”.</small> : null}
        </div>
        <button className="btn btn--block" type="submit">
          Prijavi se
        </button>
      </form>
    </div>
  );
}
