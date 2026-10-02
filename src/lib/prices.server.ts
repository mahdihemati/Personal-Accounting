/** Server-only: Navasan calls, key encryption and price-cache writes. The API key never leaves this module. */
import { getSupabaseAdmin } from "@/integrations/supabase/client.server";
import { ASSET_SYMBOLS } from "./assets-catalog";

export const NAVASAN_BASE = "http://api.navasan.tech";
const TIMEOUT_MS = 10_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(): Promise<CryptoKey> {
  const secret = process.env["SECRETS_ENCRYPTION_KEY"];
  if (!secret) throw new Error("missing_encryption_key");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptKey(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

export async function decryptKey(enc: string): Promise<string> {
  const all = unb64(enc);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, await aesKey(), all.slice(12));
  return new TextDecoder().decode(pt);
}

export const hasEncryptionKey = () => !!process.env["SECRETS_ENCRYPTION_KEY"];

/** GET a Navasan endpoint. Never logs or returns the URL (it contains the key). */
export async function navasanGet(path: "usage" | "latest", apiKey: string): Promise<{ status: number | null; body: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${NAVASAN_BASE}/${path}/?api_key=${encodeURIComponent(apiKey)}`, { signal: ctrl.signal });
    let body: unknown = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch {
    return { status: null, body: null };
  } finally {
    clearTimeout(t);
  }
}

export function errorCodeOf(status: number | null, body: unknown): string | null {
  if (status === 200) return null;
  const msg = body && typeof body === "object" && "message" in body ? String((body as { message: unknown }).message) : "";
  const base = status == null ? "network_or_timeout" : `http_${status}`;
  return (msg ? `${base}:${msg}` : base).slice(0, 120);
}

export async function logFetch(userId: string, trigger: "auto" | "manual" | "validate", status: number | null, ok: boolean, error_code: string | null) {
  await getSupabaseAdmin().from("price_fetch_log").insert({ user_id: userId, trigger, http_status: status, ok, error_code });
}

/** Parse /latest/ response into valid cache rows. Unknown or invalid symbols are skipped. */
export function parseLatest(body: unknown, userId: string, fetchedAt: string) {
  const rows: { user_id: string; symbol: string; value_raw: number; source_timestamp: string | null; fetched_at: string }[] = [];
  if (!body || typeof body !== "object") return rows;
  const obj = body as Record<string, unknown>;
  for (const sym of ASSET_SYMBOLS) {
    const item = obj[sym] as { value?: unknown; timestamp?: unknown } | undefined;
    if (!item || typeof item !== "object") continue;
    const v = Number(String(item.value ?? "").replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0) continue;
    const ts = Number(item.timestamp);
    rows.push({
      user_id: userId, symbol: sym, value_raw: v,
      source_timestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      fetched_at: fetchedAt,
    });
  }
  return rows;
}
