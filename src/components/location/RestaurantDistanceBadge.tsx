"use client";

import { MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readUserLocation, USER_LOCATION_UPDATED_EVENT, writeUserLocation } from "@/lib/client/user-location";
import { calculateDistanceKm, formatDistance, type GeoPoint } from "@/lib/utils/geo-distance";
import { cn } from "@/lib/utils/cn";

type DistanceBadgeVariant = "card" | "hero" | "mini";

type RestaurantDistanceBadgeProps = {
  latitude?: number;
  longitude?: number;
  className?: string;
  variant?: DistanceBadgeVariant;
};

function hasCoordinates(latitude?: number, longitude?: number) {
  return typeof latitude === "number" && typeof longitude === "number";
}

export function RestaurantDistanceBadge({ latitude, longitude, className, variant = "card" }: RestaurantDistanceBadgeProps) {
  const [userLocation, setUserLocation] = useState<GeoPoint | null>(null);
  const canCalculate = hasCoordinates(latitude, longitude);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      const storedLocation = readUserLocation();
      if (storedLocation) {
        setUserLocation(storedLocation);
      }

      if (!canCalculate || !("permissions" in navigator) || !("geolocation" in navigator)) {
        return;
      }

      navigator.permissions
        .query({ name: "geolocation" })
        .then((permissionStatus) => {
          if (permissionStatus.state !== "granted") {
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => {
              const nextLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              writeUserLocation(nextLocation);
              setUserLocation(nextLocation);
            },
            () => null,
            { enableHighAccuracy: false, maximumAge: 1000 * 60 * 10, timeout: 4500 },
          );
        })
        .catch(() => null);
    });

    function handleLocationUpdate(event: Event) {
      const nextLocation = (event as CustomEvent<GeoPoint>).detail;
      if (nextLocation) {
        setUserLocation(nextLocation);
      }
    }

    window.addEventListener(USER_LOCATION_UPDATED_EVENT, handleLocationUpdate);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener(USER_LOCATION_UPDATED_EVENT, handleLocationUpdate);
    };
  }, [canCalculate]);

  const distance = useMemo(() => {
    if (!userLocation || !canCalculate || typeof latitude !== "number" || typeof longitude !== "number") {
      return null;
    }

    return calculateDistanceKm(userLocation, { latitude, longitude });
  }, [canCalculate, latitude, longitude, userLocation]);

  if (!canCalculate) {
    return null;
  }

  if (typeof distance === "number") {
    return (
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full font-black",
          variant === "hero" && "bg-white/14 px-2.5 py-1 text-[11px] text-white ring-1 ring-white/18 backdrop-blur sm:text-sm",
          variant === "card" && "bg-[var(--accent)] px-2.5 py-1 text-xs text-[var(--primary)] shadow-[var(--shadow-glow)]",
          variant === "mini" && "bg-[var(--primary-light)] px-2 py-0.5 text-[10px] text-[var(--primary)]",
          className,
        )}
      >
        <MapPin className={cn("shrink-0", variant === "hero" ? "h-4 w-4" : "h-3.5 w-3.5")} />
        {formatDistance(distance)}
      </span>
    );
  }

  return null;
}
