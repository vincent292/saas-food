// Android installations keep their existing channel sound. iOS requires the
// WAV bundled by the POS app's notification plugin.
export function posNotificationSound(platform?: string | null) {
  return platform === "ios" ? "pos_order.wav" : "notificaiones.mp3";
}
