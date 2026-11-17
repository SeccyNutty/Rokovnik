"use client";

import { useEffect } from "react";

/**
 * Javlja stranici domaćinu visinu ugrađenog kalendara, pa widget.js prilagodi okvir:
 * bez klizača unutar okvira i bez praznog prostora ispod.
 */
export function EmbedResizer({ id }: { id: string }) {
  useEffect(() => {
    if (window.parent === window) return;
    const send = () => {
      const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
      window.parent.postMessage({ type: "rokovnik:visina", id, height }, "*");
    };
    send();
    const observer = new ResizeObserver(send);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [id]);
  return null;
}
