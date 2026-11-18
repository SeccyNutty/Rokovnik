import type { ItemView } from "@/lib/queries";

/** Opis jedne stavke: koristi se u prozoru s opisom i na zasebnoj stranici događaja. */
export function ItemDetail({ item, heading = "h2" }: { item: ItemView; heading?: "h1" | "h2" }) {
  const H = heading;
  const text = item.description || item.summary;
  return (
    <article className={item.kind === "deadline" ? "detail detail--rok" : "detail"}>
      <div className="detail__kind">
        {item.kind === "deadline" ? <span className="rok">rok</span> : null}
        <span>
          {item.categoryLabel ? `${item.categoryLabel} · ` : ""}
          {item.communityName}
        </span>
      </div>
      <H className="detail__title">{item.title}</H>
      <dl className="facts">
        <div>
          <dt>{item.kind === "deadline" ? "Rok" : "Kada"}</dt>
          <dd>{item.when}</dd>
        </div>
        {item.location ? (
          <div>
            <dt>Gdje</dt>
            <dd>{item.location}</dd>
          </div>
        ) : null}
        {item.onlineUrl ? (
          <div>
            <dt>Online</dt>
            <dd>
              <a href={item.onlineUrl} target="_blank" rel="noopener noreferrer nofollow">
                Otvori poveznicu
              </a>
            </dd>
          </div>
        ) : null}
        {item.organizer ? (
          <div>
            <dt>Organizira</dt>
            <dd>{item.organizer}</dd>
          </div>
        ) : null}
      </dl>
      {text ? <p className="detail__text">{text}</p> : null}
      {item.tags.length ? (
        <ul className="tags" aria-label="Teme">
          {item.tags.map((t) => (
            <li key={t.key}>
              <a className="tag-pill" href={`/?tema=${t.key}`}>
                {t.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {item.unsure ? (
        <p className="detail__unsure">Termin je automatski pročitan iz obavijesti i nije sasvim siguran. Provjeri ga kod organizatora.</p>
      ) : null}
      {item.registrationUrl ? (
        <div className="detail__actions">
          <a className="btn btn--quiet" href={item.registrationUrl} target="_blank" rel="noopener noreferrer nofollow">
            Otvori prijavu
          </a>
        </div>
      ) : null}
    </article>
  );
}
