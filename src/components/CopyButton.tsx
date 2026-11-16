"use client";

import { useState } from "react";

export function CopyButton(props: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={props.className ?? "btn btn--quiet"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Kopiraj poveznicu:", props.text);
        }
      }}
    >
      {copied ? "Kopirano" : (props.label ?? "Kopiraj")}
    </button>
  );
}
