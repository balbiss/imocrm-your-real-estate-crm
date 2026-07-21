import { useCallback, useEffect, useState } from "react";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/lib/push";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || process.env.BACKEND_URL || "";

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification !== "undefined" ? Notification.permission : "unsupported"
  );
  const [loading, setLoading] = useState(false);

  const isSupported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const isIOS = isIOSDevice();
  // No iOS, push só existe se o app estiver instalado na tela inicial — limitação da Apple, não bug.
  const needsInstallOnIOS = isIOS && !isStandalone();

  // Registra o service worker uma vez, sem pedir permissão (isso pode acontecer sem gesto do usuário).
  useEffect(() => {
    if (!isSupported) return;
    // sw.js e servido pelo backend (o worker do frontend nao repassa
    // arquivos estaticos fora de /assets) — o header Service-Worker-Allowed
    // no backend + o scope explicito aqui deixam ele controlar o site inteiro.
    navigator.serviceWorker.register(`${BACKEND_URL}/sw.js`, { scope: "/" }).catch((e) => {
      console.error("Erro ao registrar service worker:", e);
    });
  }, [isSupported]);

  // Precisa ser chamado direto num onClick — Safari (inclusive iOS) ignora
  // Notification.requestPermission() se não vier de um gesto real do usuário.
  const subscribe = useCallback(async () => {
    if (!isSupported || needsInstallOnIOS) return false;

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const publicKey = await getVapidPublicKey();
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await subscribePush(subscription.toJSON());
      return true;
    } catch (e) {
      console.error("Erro ao assinar push:", e);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported, needsInstallOnIOS]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint).catch(() => {});
      await subscription.unsubscribe();
    }
    setPermission(Notification.permission);
  }, [isSupported]);

  return { permission, isSupported, isIOS, needsInstallOnIOS, loading, subscribe, unsubscribe };
}
