import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="top">
        <div className="top__in">
          <Link href="/" className="brand">
            {APP_NAME}
          </Link>
          <SiteNav />
        </div>
      </header>
      <main className="page">{children}</main>
      <footer className="foot">
        <span>
          {APP_NAME}: {APP_TAGLINE.toLowerCase()}.
        </span>
        <Link href="/objavi">Kako objaviti</Link>
        <Link href="/privatnost">Privatnost</Link>
        <Link href="/admin">Administracija</Link>
      </footer>
    </>
  );
}
