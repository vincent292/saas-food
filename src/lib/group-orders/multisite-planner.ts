import { calculateDistanceKm, type GeoPoint } from "@/lib/utils/geo-distance";

export type MultisitePickupCandidate = {
  id: string;
  name: string;
  location: GeoPoint;
  prepTimeMinutes: number;
  coldRisk?: "low" | "medium" | "high";
};

export type MultisitePlanOptions = {
  destination: GeoPoint;
  candidates: MultisitePickupCandidate[];
  radiusKm?: number;
  maxPickups?: number;
  baseFee?: number;
  feePerKm?: number;
  maxRouteKm?: number;
  maxFirstPickupToDeliveryMinutes?: number;
  averageSpeedKmh?: number;
};

export type MultisiteRouteStop = MultisitePickupCandidate & {
  distanceToDestinationKm: number;
  estimatedReadyInMinutes: number;
  expectedReadyEtaMinutes: number;
  foodWaitMinutes: number;
  orderReleaseDelayMinutes: number;
  pickupEtaMinutes: number;
  pickupOffsetMinutes: number;
  deliveryCarryMinutes: number;
};

export type MultisiteRouteSegment = {
  fromId: string;
  toId: string;
  distanceKm: number;
  deliveryFee: number;
  travelMinutes: number;
};

export type MultisitePlan = {
  enabled: boolean;
  feasible: boolean;
  stops: MultisiteRouteStop[];
  segments: MultisiteRouteSegment[];
  totalRouteKm: number;
  deliveryFee: number;
  estimatedPickupWindowMinutes: number;
  routeStartDelayMinutes: number;
  warnings: string[];
};

const DEFAULT_RADIUS_KM = 3;
const DEFAULT_MAX_PICKUPS = 3;
const DEFAULT_BASE_FEE = 6;
const DEFAULT_FEE_PER_KM = 2.2;
const DEFAULT_MAX_ROUTE_KM = 8;
const DEFAULT_MAX_FIRST_PICKUP_TO_DELIVERY_MINUTES = 25;
const DEFAULT_AVERAGE_SPEED_KMH = 22;
const EXACT_ROUTE_LIMIT = 5;

function minutesForDistance(distanceKm: number, averageSpeedKmh: number) {
  return (distanceKm / averageSpeedKmh) * 60;
}

function segmentFee(distanceKm: number, feePerKm: number) {
  return Number((distanceKm * feePerKm).toFixed(2));
}

function riskWeight(risk: MultisitePickupCandidate["coldRisk"]) {
  if (risk === "high") return 2.2;
  if (risk === "medium") return 1;
  return 0.35;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];

  const routes: T[][] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const route of permutations(rest)) {
      routes.push([item, ...route]);
    }
  }
  return routes;
}

function buildSegments(stops: Array<MultisitePickupCandidate & { distanceToDestinationKm: number }>, destination: GeoPoint, feePerKm: number, averageSpeedKmh: number) {
  const segments: MultisiteRouteSegment[] = [];
  let totalRouteKm = 0;

  for (let index = 0; index < stops.length; index += 1) {
    const from = stops[index];
    const to = stops[index + 1];
    const distanceKm = to ? calculateDistanceKm(from.location, to.location) : calculateDistanceKm(from.location, destination);
    totalRouteKm += distanceKm;
    segments.push({
      fromId: from.id,
      toId: to?.id ?? "destination",
      distanceKm: Number(distanceKm.toFixed(2)),
      deliveryFee: segmentFee(distanceKm, feePerKm),
      travelMinutes: Math.round(minutesForDistance(distanceKm, averageSpeedKmh)),
    });
  }

  return { segments, totalRouteKm };
}

function scheduleStops(stops: Array<MultisitePickupCandidate & { distanceToDestinationKm: number }>, segments: MultisiteRouteSegment[], estimatedPickupWindowMinutes: number, averageSpeedKmh: number) {
  const pickupOffsets = stops.map((_, index) =>
    segments.slice(0, index).reduce((sum, segment) => sum + minutesForDistance(segment.distanceKm, averageSpeedKmh), 0),
  );
  const routeStartDelayMinutes = Math.max(0, ...stops.map((stop, index) => stop.prepTimeMinutes - pickupOffsets[index]));

  const scheduledStops = stops.map<MultisiteRouteStop>((stop, index) => {
    const pickupOffsetMinutes = Math.round(pickupOffsets[index]);
    const pickupEtaMinutes = Math.round(routeStartDelayMinutes + pickupOffsets[index]);
    const orderReleaseDelayMinutes = Math.max(0, Math.round(routeStartDelayMinutes + pickupOffsets[index] - stop.prepTimeMinutes));
    const expectedReadyEtaMinutes = orderReleaseDelayMinutes + stop.prepTimeMinutes;
    const foodWaitMinutes = Math.max(0, pickupEtaMinutes - expectedReadyEtaMinutes);
    const deliveryCarryMinutes = Math.max(0, Math.round(estimatedPickupWindowMinutes - pickupOffsets[index]));

    return {
      ...stop,
      deliveryCarryMinutes,
      estimatedReadyInMinutes: expectedReadyEtaMinutes,
      expectedReadyEtaMinutes,
      foodWaitMinutes,
      orderReleaseDelayMinutes,
      pickupEtaMinutes,
      pickupOffsetMinutes,
    };
  });

  return { routeStartDelayMinutes: Math.round(routeStartDelayMinutes), scheduledStops };
}

function scoreRoute(stops: Array<MultisitePickupCandidate & { distanceToDestinationKm: number }>, totalRouteKm: number, estimatedPickupWindowMinutes: number, routeStartDelayMinutes: number, averageSpeedKmh: number) {
  const totalFulfillmentMinutes = routeStartDelayMinutes + estimatedPickupWindowMinutes;
  let accumulatedTravelMinutes = 0;
  let qualityPenalty = 0;

  for (let index = 0; index < stops.length; index += 1) {
    if (index > 0) {
      const previous = stops[index - 1];
      accumulatedTravelMinutes += minutesForDistance(calculateDistanceKm(previous.location, stops[index].location), averageSpeedKmh);
    }
    const carryMinutes = Math.max(0, estimatedPickupWindowMinutes - accumulatedTravelMinutes);
    qualityPenalty += carryMinutes * riskWeight(stops[index].coldRisk);
  }

  const lastStop = stops[stops.length - 1];
  const lastStopDistancePenalty = lastStop ? lastStop.distanceToDestinationKm * 4 : 0;
  return totalRouteKm * 8 + totalFulfillmentMinutes * 1.4 + qualityPenalty + lastStopDistancePenalty;
}

export function planMultisiteGroupOrder(options: MultisitePlanOptions): MultisitePlan {
  const radiusKm = options.radiusKm ?? DEFAULT_RADIUS_KM;
  const maxPickups = Math.min(Math.max(options.maxPickups ?? DEFAULT_MAX_PICKUPS, 1), EXACT_ROUTE_LIMIT);
  const baseFee = options.baseFee ?? DEFAULT_BASE_FEE;
  const feePerKm = options.feePerKm ?? DEFAULT_FEE_PER_KM;
  const maxRouteKm = options.maxRouteKm ?? DEFAULT_MAX_ROUTE_KM;
  const maxFirstPickupToDeliveryMinutes = options.maxFirstPickupToDeliveryMinutes ?? DEFAULT_MAX_FIRST_PICKUP_TO_DELIVERY_MINUTES;
  const averageSpeedKmh = Math.max(options.averageSpeedKmh ?? DEFAULT_AVERAGE_SPEED_KMH, 5);
  const warnings: string[] = [];

  const candidates = options.candidates.map((candidate) => ({
    ...candidate,
    distanceToDestinationKm: calculateDistanceKm(candidate.location, options.destination),
  }));
  const outOfRadius = candidates.filter((candidate) => candidate.distanceToDestinationKm > radiusKm);
  const routeCandidates = candidates.filter((candidate) => candidate.distanceToDestinationKm <= radiusKm);

  if (outOfRadius.length) {
    warnings.push("Hay locales fuera del radio multisede permitido.");
  }

  if (!routeCandidates.length) {
    return {
      enabled: true,
      feasible: false,
      stops: [],
      segments: [],
      totalRouteKm: 0,
      deliveryFee: 0,
      estimatedPickupWindowMinutes: 0,
      routeStartDelayMinutes: 0,
      warnings: [...warnings, "No hay locales dentro del radio multisede."],
    };
  }

  if (routeCandidates.length > maxPickups) {
    warnings.push(`Maximo ${maxPickups} locales por pedido multisede.`);
  }

  if (routeCandidates.length > EXACT_ROUTE_LIMIT) {
    return {
      enabled: true,
      feasible: false,
      stops: [],
      segments: [],
      totalRouteKm: 0,
      deliveryFee: 0,
      estimatedPickupWindowMinutes: 0,
      routeStartDelayMinutes: 0,
      warnings: [...warnings, `No se puede optimizar mas de ${EXACT_ROUTE_LIMIT} locales a la vez.`],
    };
  }

  const bestRoute = permutations(routeCandidates).reduce<{
    route: typeof routeCandidates;
    score: number;
    segments: MultisiteRouteSegment[];
    totalRouteKm: number;
    estimatedPickupWindowMinutes: number;
    routeStartDelayMinutes: number;
  } | null>((best, route) => {
    const { segments, totalRouteKm } = buildSegments(route, options.destination, feePerKm, averageSpeedKmh);
    const estimatedPickupWindowMinutes = Math.round(minutesForDistance(totalRouteKm, averageSpeedKmh));
    const pickupOffsets = route.map((_, index) => segments.slice(0, index).reduce((sum, segment) => sum + minutesForDistance(segment.distanceKm, averageSpeedKmh), 0));
    const routeStartDelayMinutes = Math.max(0, ...route.map((stop, index) => stop.prepTimeMinutes - pickupOffsets[index]));
    const score = scoreRoute(route, totalRouteKm, estimatedPickupWindowMinutes, routeStartDelayMinutes, averageSpeedKmh);

    if (!best || score < best.score) {
      return { route, score, segments, totalRouteKm, estimatedPickupWindowMinutes, routeStartDelayMinutes: Math.round(routeStartDelayMinutes) };
    }
    return best;
  }, null);

  const route = bestRoute?.route ?? routeCandidates;
  const segments = bestRoute?.segments ?? [];
  const totalRouteKm = bestRoute?.totalRouteKm ?? 0;
  const estimatedPickupWindowMinutes = bestRoute?.estimatedPickupWindowMinutes ?? 0;
  const { routeStartDelayMinutes, scheduledStops } = scheduleStops(route, segments, estimatedPickupWindowMinutes, averageSpeedKmh);

  if (totalRouteKm > maxRouteKm) warnings.push("La ruta total esta por encima del limite recomendado.");
  if (estimatedPickupWindowMinutes > maxFirstPickupToDeliveryMinutes) warnings.push("La primera comida podria esperar demasiado antes de la entrega.");
  if (scheduledStops.some((stop) => stop.prepTimeMinutes >= 40)) warnings.push("Hay productos/locales con preparacion larga; el envio a cocina se escalona.");
  if (scheduledStops.some((stop) => stop.coldRisk === "high" && stop.deliveryCarryMinutes > 12)) {
    warnings.push("Hay comida sensible al enfriamiento con demasiado tiempo de traslado.");
  }

  const hasHardLimitWarning = outOfRadius.length > 0 || routeCandidates.length > maxPickups || totalRouteKm > maxRouteKm || estimatedPickupWindowMinutes > maxFirstPickupToDeliveryMinutes;

  return {
    enabled: true,
    feasible: !hasHardLimitWarning,
    stops: scheduledStops,
    segments,
    totalRouteKm: Number(totalRouteKm.toFixed(2)),
    deliveryFee: Number((baseFee + segments.reduce((sum, segment) => sum + segment.deliveryFee, 0)).toFixed(2)),
    estimatedPickupWindowMinutes: Math.round(estimatedPickupWindowMinutes),
    routeStartDelayMinutes,
    warnings,
  };
}
