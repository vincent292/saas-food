"use client";

export const ORDER_ALERT_AUDIO_SRC = "/notificaciones/notificaiones.mp3";
export const ORDER_ALERT_SOUND_CHANGE_EVENT = "yopido:order-alert-sound-change";
export const ORDER_ALERT_SOUND_STOP_EVENT = "yopido:order-alert-sound-stop";

type SoundChangeDetail = {
  restaurantId: string;
  enabled: boolean;
};

type SoundStopDetail = {
  restaurantId?: string;
};

export function orderAlertSoundEnabledKey(restaurantId: string) {
  return `yopido:order-alert-sound:enabled:${restaurantId}`;
}

export function readOrderAlertSoundEnabled(restaurantId: string) {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(orderAlertSoundEnabledKey(restaurantId)) === "1";
}

export function writeOrderAlertSoundEnabled(restaurantId: string, enabled: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(orderAlertSoundEnabledKey(restaurantId), enabled ? "1" : "0");
  } catch {
    // The preference is local convenience; failing to persist should not break the panel.
  }

  window.dispatchEvent(new CustomEvent<SoundChangeDetail>(ORDER_ALERT_SOUND_CHANGE_EVENT, { detail: { restaurantId, enabled } }));
}

export function stopOrderAlertSound(restaurantId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoundStopDetail>(ORDER_ALERT_SOUND_STOP_EVENT, { detail: { restaurantId } }));
}

