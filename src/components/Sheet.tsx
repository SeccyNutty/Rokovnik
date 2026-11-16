"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconClose } from "./icons";

/** Prozor na računalu, ploča koja se otvara odozdo na mobitelu. */
export function Sheet(props: { open: boolean; onClose: () => void; label: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) dialog.showModal();
    if (!props.open && dialog.open) dialog.close();
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={props.label}
      onClose={props.onClose}
      onClick={(e) => {
        if (e.target === ref.current) props.onClose();
      }}
    >
      {props.open ? (
        <>
          <button type="button" className="sheet__close" onClick={props.onClose} aria-label="Zatvori">
            <IconClose />
          </button>
          <div className="sheet__scroll">{props.children}</div>
          {props.footer ? <div className="sheet__foot">{props.footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
