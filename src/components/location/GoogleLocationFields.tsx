"use client";

import { LocateFixed, MapPinned, Navigation } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { coordinatesToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Map: new (element: HTMLElement, options: Record<string, unknown>) => {
        setCenter: (position: { lat: number; lng: number }) => void;
        addListener: (eventName: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
      };
      Marker: new (options: Record<string, unknown>) => {
        setPosition: (position: { lat: number; lng: number }) => void;
        addListener: (eventName: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
      };
    };
  };
  __yopidoGoogleMapsPromise?: Promise<void>;
};

type MapInstance = {
  setCenter: (position: { lat: number; lng: number }) => void;
  addListener: (eventName: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
};

type MarkerInstance = {
  setPosition: (position: { lat: number; lng: number }) => void;
  addListener: (eventName: string, handler: (event: { latLng?: { lat: () => number; lng: () => number } }) => void) => void;
};

const fallbackCenter = { latitude: -17.3895, longitude: -66.1568 };

function loadGoogleMaps(apiKey: string) {
  const win = window as GoogleMapsWindow;

  if (win.google?.maps) {
    return Promise.resolve();
  }

  if (win.__yopidoGoogleMapsPromise) {
    return win.__yopidoGoogleMapsPromise;
  }

  win.__yopidoGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("google-maps-load"));
    document.head.appendChild(script);
  });

  return win.__yopidoGoogleMapsPromise;
}

export function GoogleLocationFields({
  latitudeName = "latitude",
  longitudeName = "longitude",
  mapsUrlName = "mapsUrl",
  defaultLatitude,
  defaultLongitude,
  defaultMapsUrl,
  label = "Ubicacion GPS",
}: {
  latitudeName?: string;
  longitudeName?: string;
  mapsUrlName?: string;
  defaultLatitude?: number;
  defaultLongitude?: number;
  defaultMapsUrl?: string;
  label?: string;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
  const [latitude, setLatitude] = useState(defaultLatitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaultLongitude?.toString() ?? "");
  const [mapsUrl, setMapsUrl] = useState(defaultMapsUrl ?? "");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapError, setMapError] = useState("");
  const [gpsStatus, setGpsStatus] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjectRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);

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
  }

  function useCurrentLocation() {
    setGpsStatus("");
    if (!navigator.geolocation) {
      setGpsStatus("Tu navegador no permite tomar ubicacion.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateCoordinates(position.coords.latitude, position.coords.longitude);
        setGpsStatus("Ubicacion capturada.");
      },
      () => setGpsStatus("No se pudo tomar la ubicacion. Puedes mover el pin o escribirla manualmente."),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    );
  }

  useEffect(() => {
    if (!mapOpen || !apiKey || !mapRef.current) {
      return;
    }

    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) {
          return;
        }

        const win = window as GoogleMapsWindow;
        const maps = win.google?.maps;
        if (!maps) {
          setMapError("Google Maps no esta disponible.");
          return;
        }

        const center = coords ?? fallbackCenter;
        const position = { lat: center.latitude, lng: center.longitude };

        if (!mapObjectRef.current) {
          const map = new maps.Map(mapRef.current, {
            center: position,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: coords ? 17 : 13,
          });
          const marker = new maps.Marker({
            draggable: true,
            map,
            position,
            title: label,
          });

          map.addListener("click", (event) => {
            if (event.latLng) {
              updateCoordinates(event.latLng.lat(), event.latLng.lng());
            }
          });
          marker.addListener("dragend", (event) => {
            if (event.latLng) {
              updateCoordinates(event.latLng.lat(), event.latLng.lng());
            }
          });

          mapObjectRef.current = map;
          markerRef.current = marker;
        } else {
          mapObjectRef.current.setCenter(position);
          markerRef.current?.setPosition(position);
        }
      })
      .catch(() => setMapError("No se pudo cargar el mapa. Revisa la key publica de Google Maps."));

    return () => {
      cancelled = true;
    };
  }, [apiKey, coords, label, mapOpen]);

  return (
    <div className="grid gap-3 md:col-span-2">
      <div className="grid gap-3 md:grid-cols-2">
        <Input name={latitudeName} onChange={(event) => setLatitude(event.target.value)} placeholder="Latitud" step="0.0000001" type="number" value={latitude} />
        <Input name={longitudeName} onChange={(event) => setLongitude(event.target.value)} placeholder="Longitud" step="0.0000001" type="number" value={longitude} />
      </div>
      <Input name={mapsUrlName} onChange={(event) => setMapsUrl(event.target.value)} placeholder="Link de Google Maps" value={mapsUrl} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={useCurrentLocation} type="button" variant="secondary">
          <LocateFixed className="h-4 w-4" />
          Usar mi ubicacion
        </Button>
        <Button disabled={!apiKey} onClick={() => setMapOpen((value) => !value)} type="button" variant="secondary">
          <MapPinned className="h-4 w-4" />
          {mapOpen ? "Ocultar mapa" : "Elegir en mapa"}
        </Button>
        {coords ? (
          <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-black text-[var(--color-on-primary)]" href={coordinatesToMapsUrl(coords.latitude, coords.longitude)} rel="noreferrer" target="_blank">
            <Navigation className="h-4 w-4" />
            Abrir Maps
          </a>
        ) : null}
      </div>
      {!apiKey ? <p className="text-xs font-semibold text-[var(--muted)]">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el selector visual. GPS/manual sigue funcionando.</p> : null}
      {gpsStatus ? <p className="text-xs font-black text-[var(--primary)]">{gpsStatus}</p> : null}
      {mapError ? <p className="text-xs font-black text-[var(--color-danger-strong)]">{mapError}</p> : null}
      {mapOpen && apiKey ? <div className="h-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)]" ref={mapRef} /> : null}
    </div>
  );
}
