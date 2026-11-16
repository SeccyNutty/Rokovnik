import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <div className="paper empty">
        <h1 style={{ marginBottom: 10 }}>Ove stranice nema</h1>
        <p>Objava je možda uklonjena ili je adresa pogrešno prepisana.</p>
        <Link className="btn" href="/">
          Pogledaj sve objave
        </Link>
      </div>
    </main>
  );
}
