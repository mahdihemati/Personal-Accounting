/** Single service-worker registration point. Refuses (and cleans up) in dev, Lovable preview and iframes. */
const SW_URL = "/sw.js";

function refused(): boolean {
  if (!import.meta.env.PROD) return true;
  if (window.self !== window.top) return true;
  const h = location.hostname;
  if (h.startsWith("id-preview--") || h.startsWith("preview--")) return true;
  if (h === "lovableproject.com" || h.endsWith(".lovableproject.com")) return true;
  if (h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com")) return true;
  if (h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(location.search).get("sw") === "off") return true;
  return false;
}

async function unregisterOurs() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter((r) => r.active?.scriptURL.endsWith(SW_URL) || r.installing?.scriptURL.endsWith(SW_URL) || r.waiting?.scriptURL.endsWith(SW_URL)).map((r) => r.unregister()));
}

export async function initPwa(onNeedRefresh: (update: () => void) => void) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (refused()) { await unregisterOurs().catch(() => {}); return; }
  const { registerSW } = await import("virtual:pwa-register");
  const update = registerSW({
    immediate: true,
    onNeedRefresh: () => onNeedRefresh(() => void update(true)),
  });
}
