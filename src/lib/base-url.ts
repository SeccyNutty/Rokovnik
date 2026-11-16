import { headers } from "next/headers";
import { configuredBaseUrl } from "./config";

/** Javna adresa aplikacije: iz postavki ili iz zaglavlja zahtjeva. */
export async function baseUrl(): Promise<string> {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

export function baseUrlFromRequest(request: Request): string {
  const configured = configuredBaseUrl();
  if (configured) return configured;
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return new URL(request.url).origin;
  const proto = h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
