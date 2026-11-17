import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { googleConfigured } from "@/lib/google";
import { safeNext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prijava", robots: { index: false } };

const ERRORS: Record<string, string> = {
  "nije-postavljeno": "Prijava putem Googlea još nije uključena na ovoj stranici.",
  previse: "Previše pokušaja prijave. Pričekaj desetak minuta.",
  odustao: "Prijava je prekinuta. Možeš pokušati ponovno.",
  neuspjelo: "Prijava nije uspjela. Pokušaj ponovno; ako se ponavlja, javi administratoru.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; greska?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  // Prijavljenog korisnika vodi dalje, osim kad treba pokazati grešku (npr. neuspio novi pokušaj).
  if (!sp.greska && (await currentUser())) redirect(next === "/" ? "/racun" : next);
  const enabled = googleConfigured();
  return (
    <div className="paper paper--pad" style={{ maxWidth: 460, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Prijava</h1>
      <p className="lead" style={{ fontSize: 16 }}>
        S računom spremaš događaje u Moj kalendar i pratiš zajednice, na svim svojim uređajima. Pregled kalendara ne traži prijavu.
      </p>
      {sp.greska && ERRORS[sp.greska] ? <div className="flash flash--err">{ERRORS[sp.greska]}</div> : null}
      {enabled ? (
        <a className="btn btn--block btn--google" href={`/api/auth/google?next=${encodeURIComponent(next)}`} style={{ marginTop: 14 }}>
          Prijavi se putem Googlea
        </a>
      ) : (
        <p className="warn">Prijava putem Googlea nije postavljena (GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET). Upute su u DEPLOY.md.</p>
      )}
      <p className="small muted" style={{ marginTop: 14 }}>
        Prvom prijavom nastaje račun. Spremamo samo ime i e-mail adresu s Google računa. <Link href="/privatnost">Privatnost</Link>
      </p>
    </div>
  );
}
