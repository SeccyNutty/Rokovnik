import { currentUser } from "@/lib/auth";
import { accountKind, userState } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Stanje prijavljenog korisnika za sučelje: što prati i što je spremio. Gost dobiva { user: null }. */
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await currentUser();
  if (!user) return Response.json({ user: null }, { headers });
  const [state, kind] = await Promise.all([userState(user.id), accountKind(user)]);
  return Response.json({ user: { name: user.name, email: user.email, vrsta: kind }, prati: state.followSlugs, spremljeno: state.saved }, { headers });
}
