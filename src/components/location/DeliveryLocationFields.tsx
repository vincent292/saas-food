"use client";

import { LocateFixed, MapPinned, Navigation } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { coordinatesToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";

export function DeliveryLocationFields({ visible }: { visible: boolean }) {
  const [address, setAddress] = useState("");
  const [detail, setDetail] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");
  const [status, setStatus] = useState("");

  const coords = useMemo(() => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    return hasValidCoordinates(lat, lng) ? { latitude: lat, longitude: lng } : null;
  }, [latitude, longitude]);

  function updateCoordinates(nextLatitude: number, nextLongitude: number) {
    const nextLat = nextLatitude.toFixed(7);
    const nextLng = nextLongitude.toFixed(7);
    setLatitude(nextLat);
    setLongitude(nextLng);
    setMapsUrl(coordinatesToMapsUrl(nextLatitude, nextLongitude));
    if (!address.trim()) {
      setAddress("Ubicacion compartida por GPS");
    }
  }

  function useCurrentLocation() {
    setStatus("");
    if (!navigator.geolocation) {
      setStatus("Tu navegador no permite compartir ubicacion.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateCoordinates(position.coords.latitude, position.coords.longitude);
        setStatus("Ubicacion capturada. Agrega una referencia para que el repartidor ubique mejor el lugar.");
      },
      () => setStatus("No pudimos tomar tu ubicacion. Escribe la direccion manualmente."),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
  }

  return (
    <div className={visible ? "grid gap-3 md:col-span-2" : "hidden"}>
      <Input name="customerAddress" onChange={(event) => setAddress(event.target.value)} placeholder="Direccion de entrega" required={visible} value={address} />
      <Textarea name="deliveryAddressDetail" onChange={(event) => setDetail(event.target.value)} placeholder="Referencia, piso, color de puerta, zona o indicaciones" value={detail} />
      <input name="deliveryLatitude" type="hidden" value={latitude} />
      <input name="deliveryLongitude" type="hidden" value={longitude} />
      <input name="deliveryMapsUrl" type="hidden" value={mapsUrl} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={useCurrentLocation} type="button" variant="secondary">
          <LocateFixed className="h-4 w-4" />
          Usar mi ubicacion
        </Button>
        {coords ? (
          <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-black text-[var(--color-on-primary)]" href={coordinatesToMapsUrl(coords.latitude, coords.longitude)} rel="noreferrer" target="_blank">
            <Navigation className="h-4 w-4" />
            Ver punto
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--color-surface)] px-4 text-sm font-bold text-[var(--muted)]">
            <MapPinned className="h-4 w-4" />
            Puedes escribir la direccion sin GPS
          </span>
        )}
      </div>
      {status ? <p className="rounded-2xl bg-[var(--primary-light)] p-3 text-xs font-black text-[var(--primary)]">{status}</p> : null}
    </div>
  );
}
