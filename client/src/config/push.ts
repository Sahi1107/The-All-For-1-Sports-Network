import api from '../api/client';

// Web push subscription helpers. The VAPID public key is fetched from the server
// (single source of truth), so no client env var is needed.

export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function vapidKey(): Promise<string | null> {
  try { return (await api.get('/push/vapid')).data.publicKey ?? null; } catch { return null; }
}

/** Request permission + subscribe this browser. Returns true on success. */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;
  const key = await vapidKey();
  if (!key) return false; // push not configured on the server yet
  if ((await Notification.requestPermission()) !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) as BufferSource });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  await api.post('/push/subscribe', { endpoint: j.endpoint, keys: j.keys });
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try { const reg = await navigator.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()); } catch { return false; }
}
