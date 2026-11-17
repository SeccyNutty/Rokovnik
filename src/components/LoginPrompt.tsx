"use client";

import { useEffect, useRef } from "react";
import { IconClose } from "./icons";

/** Adresa za prijavu koja nakon povratka s Googlea izvrši radnju zbog koje se korisnik prijavljuje. */
export function loginHref(action?: string): string {
  const next = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  const q = new URLSearchParams({ next });
  if (action) q.set("akcija", action);
  return `/api/auth/google?${q}`;
}

/**
 * Skočni prozor za goste: radnja traži račun, a prijava je jedan klik putem Googlea.
 * Nakon prijave korisnik se vraća na istu stranicu i radnja je već izvršena.
 */
export function LoginPrompt(props: { open: boolean; onClose: () => void; title: string; text: string; action?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      className="prompt"
      aria-labelledby="prompt-title"
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      {props.open ? (
        <div className="prompt__in">
          <button type="button" className="sheet__close" onClick={props.onClose} aria-label="Zatvori">
            <IconClose />
          </button>
          <h2 id="prompt-title" className="prompt__title">
            {props.title}
          </h2>
          <p>{props.text}</p>
          <a className="btn btn--block btn--google" href={loginHref(props.action)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
            </svg>
            Prijavi se putem Googlea
          </a>
          <p className="small muted" style={{ margin: "12px 0 0" }}>
            Prvom prijavom nastaje račun. Spremamo samo ime i e-mail adresu. <a href="/privatnost">Privatnost</a>
          </p>
        </div>
      ) : null}
    </dialog>
  );
}
