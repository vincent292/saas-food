"use client";

import { LocateFixed, MapPinned } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { coordinatesToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";

type LatLngValue = { lat: number; lng: number } | { lat: () => number; lng: () => number };
type MapMouseEvent = { latLng?: { lat: () => number; lng: () => number } };

type MapInstance = {
  setCenter: (position: { lat: number; lng: number }) => void;
  addListener: (eventName: string, handler: (event: MapMouseEvent) => void) => void;
};

type MarkerInstance = {
  setPosition: (position: { lat: number; lng: number }) => void;
  addListener: (eventName: string, handler: (event: MapMouseEvent) => void) => void;
};

type MapConstructor = new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
type MarkerConstructor = new (options: Record<string, unknown>) => MarkerInstance;
type AdvancedMarkerConstructor = new (options: Record<string, unknown>) => {
  position?: LatLngValue | null;
  addListener: (eventName: string, handler: (event: MapMouseEvent) => void) => void;
};

type LoadedGoogleMaps = {
  AdvancedMarkerElement?: AdvancedMarkerConstructor;
  Map: MapConstructor;
  Marker?: MarkerConstructor;
};

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Map?: MapConstructor;
      Marker?: MarkerConstructor;
      importLibrary?: (libraryName: string) => Promise<Record<string, unknown>>;
      marker?: {
        AdvancedMarkerElement?: AdvancedMarkerConstructor;
      };
    };
  };
  __yopidoGoogleMapsPromise?: Promise<LoadedGoogleMaps>;
  __yopidoGoogleMapsReady?: () => void;
  gm_authFailure?: () => void;
};

const fallbackCenter = { latitude: -17.3895, longitude: -66.1568 };

async function resolveGoogleMapsLibraries(): Promise<LoadedGoogleMaps> {
  const maps = (window as GoogleMapsWindow).google?.maps;

  if (!maps) {
    throw new Error("google-maps-namespace");
  }

  if (!maps.importLibrary) {
    if (!maps.Map) {
      throw new Error("google-maps-map-unavailable");
    }

    return {
      AdvancedMarkerElement: maps.marker?.AdvancedMarkerElement,
      Map: maps.Map,
      Marker: maps.Marker,
    };
  }

  const mapsLibrary = await maps.importLibrary("maps");
  const markerLibrary: Record<string, unknown> = await maps.importLibrary("marker").catch(() => ({}));
  const MapClass = (mapsLibrary.Map ?? maps.Map) as MapConstructor | undefined;

  if (!MapClass) {
    throw new Error("google-maps-map-unavailable");
  }

  return {
    AdvancedMarkerElement: (markerLibrary.AdvancedMarkerElement ?? maps.marker?.AdvancedMarkerElement) as AdvancedMarkerConstructor | undefined,
    Map: MapClass,
    Marker: (markerLibrary.Marker ?? maps.Marker) as MarkerConstructor | undefined,
  };
}

function loadGoogleMaps(apiKey: string) {
  const win = window as GoogleMapsWindow;
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    return Promise.reject(new Error("google-maps-missing-key"));
  }

  if (win.google?.maps) {
    return resolveGoogleMapsLibraries();
  }

  if (win.__yopidoGoogleMapsPromise) {
    return win.__yopidoGoogleMapsPromise;
  }

  win.__yopidoGoogleMapsPromise = new Promise<LoadedGoogleMaps>((resolve, reject) => {
    const rejectAndReset = (error: Error) => {
      win.__yopidoGoogleMapsPromise = undefined;
      reject(error);
    };
    const previousAuthFailure = win.gm_authFailure;

    win.gm_authFailure = () => {
      previousAuthFailure?.();
      rejectAndReset(new Error("google-maps-auth-failure"));
    };

    win.__yopidoGoogleMapsReady = () => {
      resolveGoogleMapsLibraries().then(resolve).catch(rejectAndReset);
    };

    document.querySelectorAll<HTMLScriptElement>('script[data-yopido-google-maps="true"]').forEach((script) => script.remove());

    const script = document.createElement("script");
    const params = new URLSearchParams({
      callback: "__yopidoGoogleMapsReady",
      key: normalizedApiKey,
      loading: "async",
      v: "weekly",
    });

    script.async = true;
    script.dataset.yopidoGoogleMaps = "true";
    script.defer = true;
    script.onerror = () => rejectAndReset(new Error("google-maps-load"));
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    document.head.appendChild(script);
  });

  return win.__yopidoGoogleMapsPromise;
}

function createEditableMarker({
  label,
  loadedMaps,
  map,
  onDragEnd,
  position,
  useAdvancedMarker,
}: {
  label: string;
  loadedMaps: LoadedGoogleMaps;
  map: MapInstance;
  onDragEnd: (latitude: number, longitude: number) => void;
  position: { lat: number; lng: number };
  useAdvancedMarker: boolean;
}): MarkerInstance {
  if (useAdvancedMarker && loadedMaps.AdvancedMarkerElement) {
    try {
      const advancedMarker = new loadedMaps.AdvancedMarkerElement({
        gmpDraggable: true,
        map,
        position,
        title: label,
      });

      advancedMarker.addListener("dragend", (event) => {
        if (event.latLng) {
          onDragEnd(event.latLng.lat(), event.latLng.lng());
          return;
        }

        const markerPosition = advancedMarker.position;
        if (markerPosition && "lat" in markerPosition && "lng" in markerPosition) {
          const lat = typeof markerPosition.lat === "function" ? markerPosition.lat() : markerPosition.lat;
          const lng = typeof markerPosition.lng === "function" ? markerPosition.lng() : markerPosition.lng;
          onDragEnd(lat, lng);
        }
      });

      return {
        addListener: advancedMarker.addListener.bind(advancedMarker),
        setPosition: (nextPosition) => {
          advancedMarker.position = nextPosition;
        },
      };
    } catch {
      // Fall through to the legacy marker if the project has no usable Map ID.
    }
  }

  if (loadedMaps.Marker) {
    try {
      const marker = new loadedMaps.Marker({
        draggable: true,
        map,
        position,
        title: label,
      });
      marker.addListener("dragend", (event) => {
        if (event.latLng) {
          onDragEnd(event.latLng.lat(), event.latLng.lng());
        }
      });
      return marker;
    } catch {
      // The map is still useful through map clicks even if marker creation fails.
    }
  }

  return {
    addListener: () => undefined,
    setPosition: () => undefined,
  };
}

function googleMapsErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message === "google-maps-auth-failure") {
    return "Google rechazo la key publica. Puedes guardar la ubicacion con GPS/manual y revisar restricciones de dominio en Google Cloud.";
  }

  if (message === "google-maps-missing-key") {
    return "Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el selector visual. GPS/manual sigue funcionando.";
  }

  return "No se pudo cargar el mapa. Puedes guardar la ubicacion con GPS/manual y revisar la key publica de Google Maps.";
}

export function GoogleLocationFields({
  latitudeName = "latitude",
  longitudeName = "longitude",
  mapsUrlName = "mapsUrl",
  defaultLatitude,
  defaultLongitude,
  defaultMapsUrl,
  label = "Ubicacion GPS",
  showMapByDefault = false,
  hideCoordinateInputs = false,
  hideMapsUrlInput = false,
  mapHeightClassName = "h-72",
  onCoordinatesChange,
}: {
  latitudeName?: string;
  longitudeName?: string;
  mapsUrlName?: string;
  defaultLatitude?: number;
  defaultLongitude?: number;
  defaultMapsUrl?: string;
  label?: string;
  showMapByDefault?: boolean;
  hideCoordinateInputs?: boolean;
  hideMapsUrlInput?: boolean;
  mapHeightClassName?: string;
  onCoordinatesChange?: (coordinates: { latitude: number; longitude: number; mapsUrl: string }) => void;
}) {
  const apiKey = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "").trim();
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID?.trim() || "";
  const [latitude, setLatitude] = useState(defaultLatitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaultLongitude?.toString() ?? "");
  const [mapsUrl, setMapsUrl] = useState(defaultMapsUrl ?? "");
  const [mapOpen, setMapOpen] = useState(showMapByDefault);
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

  const updateCoordinates = useCallback((nextLatitude: number, nextLongitude: number) => {
    const nextLat = nextLatitude.toFixed(7);
    const nextLng = nextLongitude.toFixed(7);
    const nextMapsUrl = coordinatesToMapsUrl(nextLatitude, nextLongitude);
    setLatitude(nextLat);
    setLongitude(nextLng);
    setMapsUrl(nextMapsUrl);
    onCoordinatesChange?.({ latitude: nextLatitude, longitude: nextLongitude, mapsUrl: nextMapsUrl });
  }, [onCoordinatesChange]);

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
    setMapError("");

    loadGoogleMaps(apiKey)
      .then((loadedMaps) => {
        if (cancelled || !mapRef.current) {
          return;
        }

        const center = coords ?? fallbackCenter;
        const position = { lat: center.latitude, lng: center.longitude };

        if (!mapObjectRef.current) {
          const mapOptions: Record<string, unknown> = {
            center: position,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: coords ? 17 : 13,
          };
          if (mapId) {
            mapOptions.mapId = mapId;
          }

          const map = new loadedMaps.Map(mapRef.current, mapOptions);
          const marker = createEditableMarker({
            label,
            loadedMaps,
            map,
            onDragEnd: updateCoordinates,
            position,
            useAdvancedMarker: Boolean(mapId),
          });

          map.addListener("click", (event) => {
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
      .catch((error) => {
        setMapOpen(false);
        setMapError(googleMapsErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, coords, label, mapId, mapOpen, updateCoordinates]);

  return (
    <div className="grid gap-3 md:col-span-2">
      {hideCoordinateInputs ? (
        <>
          <input name={latitudeName} type="hidden" value={latitude} />
          <input name={longitudeName} type="hidden" value={longitude} />
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Input name={latitudeName} onChange={(event) => setLatitude(event.target.value)} placeholder="Latitud" step="0.0000001" type="number" value={latitude} />
          <Input name={longitudeName} onChange={(event) => setLongitude(event.target.value)} placeholder="Longitud" step="0.0000001" type="number" value={longitude} />
        </div>
      )}
      {hideMapsUrlInput ? (
        <input name={mapsUrlName} type="hidden" value={mapsUrl} />
      ) : (
        <Input name={mapsUrlName} onChange={(event) => setMapsUrl(event.target.value)} placeholder="Link de Google Maps" value={mapsUrl} />
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={useCurrentLocation} type="button" variant="secondary">
          <LocateFixed className="h-4 w-4" />
          Usar mi ubicacion
        </Button>
        <Button disabled={!apiKey} onClick={() => setMapOpen((value) => !value)} type="button" variant="secondary">
          <MapPinned className="h-4 w-4" />
          {mapOpen ? "Ocultar mapa" : "Elegir en mapa"}
        </Button>
      </div>
      {!apiKey ? <p className="text-xs font-semibold text-[var(--muted)]">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY para activar el selector visual. GPS/manual sigue funcionando.</p> : null}
      {mapOpen && apiKey ? (
        <div className="rounded-2xl bg-[var(--primary-light)] p-3 text-xs font-black text-[var(--primary)]">
          Toca el mapa o arrastra el pin para guardar la ubicacion.
        </div>
      ) : null}
      {gpsStatus ? <p className="text-xs font-black text-[var(--primary)]">{gpsStatus}</p> : null}
      {mapError ? <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-black text-[var(--color-warning-strong)]">{mapError}</p> : null}
      {mapOpen && apiKey ? <div className={`${mapHeightClassName} overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)]`} ref={mapRef} /> : null}
    </div>
  );
}
