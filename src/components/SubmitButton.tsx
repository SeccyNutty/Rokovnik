"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Gumb za slanje obrasca koji odmah pokaže da je klik primljen: dok poslužitelj radi,
 * natpis se mijenja i gumb je isključen (bez dvostrukog slanja).
 */
export function SubmitButton(props: { children: ReactNode; pending: string; className?: string; name?: string; value?: string }) {
  const status = useFormStatus();
  // U obrascu s dva gumba (potvrdi / odbij) natpis mijenja samo onaj koji je kliknut.
  const mine = status.pending && (!props.name || status.data?.get(props.name) === props.value);
  return (
    <button className={props.className ?? "btn"} type="submit" name={props.name} value={props.value} disabled={status.pending} aria-busy={mine || undefined}>
      {mine ? props.pending : props.children}
    </button>
  );
}
