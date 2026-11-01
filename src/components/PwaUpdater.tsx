import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "@/lib/i18n";

/** Registers the service worker and offers a reload when a new version is deployed. */
export function PwaUpdater() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => {
    if (!needRefresh) return;
    toast(t("New version available", "Nuova versione disponibile"), {
      duration: Infinity,
      action: { label: t("Reload", "Ricarica"), onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);
  return null;
}
