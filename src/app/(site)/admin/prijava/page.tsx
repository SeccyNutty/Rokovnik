import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { adminPassword, isProd } from "@/lib/config";
import { googleConfigured } from "@/lib/google";
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
      {googleConfigured() ? (
        <div className="paper paper--pad" style={{ marginBottom: 14 }}>
          <p style={{ marginTop: 0 }}>Administratori se prijavljuju svojim Google računom.</p>
          <a className="btn btn--block btn--google" href="/api/auth/google?next=/admin">
            Prijavi se putem Googlea
          </a>
        </div>
      ) : null}
      {!configured && !googleConfigured() ? <div className="flash flash--err">Prijava nije postavljena. Postavi Google prijavu ili varijablu ADMIN_PASSWORD.</div> : null}
      {configured ? (
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
      ) : null}
    </div>
  );
}
