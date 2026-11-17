"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleFollowAction } from "@/app/account-actions";
import { IconBookmark } from "./icons";
import { LoginPrompt } from "./LoginPrompt";
import { setFollowLocal, useMe } from "./me";

/** "Zaprati zajednicu": njezine objave ulaze u Moj kalendar. Gost prvo dobiva poziv na prijavu. */
export function FollowButton({ slug, name, block }: { slug: string; name: string; block?: boolean }) {
  const me = useMe();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const on = me.prati.includes(slug);

  const click = () => {
    if (!me.user) return setAsk(true);
    const next = !on;
    setFollowLocal(slug, next);
    start(async () => {
      const res = await toggleFollowAction(slug, next);
      if (!res.ok) {
        setFollowLocal(slug, !next);
        if (res.reason === "login") setAsk(true);
      } else router.refresh();
    });
  };

  return (
    <>
      <button type="button" className={`btn ${on ? "btn--quiet" : ""} ${block ? "btn--block" : ""}`} aria-pressed={on} onClick={click} disabled={pending || !me.loaded}>
        <IconBookmark />
        {on ? "Pratiš · prestani pratiti" : "Zaprati zajednicu"}
      </button>
      <LoginPrompt
        open={ask}
        onClose={() => setAsk(false)}
        title="Za praćenje trebaš račun"
        text={`Prijavi se i zajednica ${name} ulazi u tvoj Moj kalendar, na svim uređajima.`}
        action={`prati:${slug}`}
      />
    </>
  );
}
