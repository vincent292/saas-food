import type { BusinessHour } from "@/types/restaurant.types";

export const DEFAULT_RESTAURANT_TIME_ZONE = "America/La_Paz";

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hour: number;
  minute: number;
  inputValue: string;
  minutesOfDay: number;
};

type BusinessHourMap = Map<number, BusinessHour>;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function normalizeTime(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

function toMinutes(value?: string | null) {
  const normalized = normalizeTime(value);
  const [hour, minute] = normalized.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function datePartsToInput(parts: Pick<LocalDateTimeParts, "year" | "month" | "day" | "hour" | "minute">) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function getDayOfWeek(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function asMap(hours: BusinessHour[]) {
  return new Map(hours.map((hour) => [hour.dayOfWeek, hour])) as BusinessHourMap;
}

function hasConfiguredHours(hours: BusinessHour[]) {
  return hours.some((hour) => !hour.isClosed && toMinutes(hour.opensAt) !== null && toMinutes(hour.closesAt) !== null);
}

function getZonedParts(date: Date, timeZone: string): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek: getDayOfWeek(year, month, day),
    inputValue: datePartsToInput({ year, month, day, hour, minute }),
    minutesOfDay: hour * 60 + minute,
  };
}

function parseLocalDateTimeInput(value?: string | null): LocalDateTimeParts | null {
  if (!value) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (![year, month, day, hour, minute].every(Number.isFinite) || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  return {
    year,
    month,
    day,
    hour,
    minute,
    dayOfWeek: getDayOfWeek(year, month, day),
    inputValue: datePartsToInput({ year, month, day, hour, minute }),
    minutesOfDay: hour * 60 + minute,
  };
}

function isWithinRules(parts: LocalDateTimeParts, hours: BusinessHour[]) {
  if (!hasConfiguredHours(hours)) {
    return true;
  }

  const hoursByDay = asMap(hours);
  const current = hoursByDay.get(parts.dayOfWeek);
  const previous = hoursByDay.get((parts.dayOfWeek + 6) % 7);

  if (current && !current.isClosed) {
    const opensAt = toMinutes(current.opensAt);
    const closesAt = toMinutes(current.closesAt);
    if (opensAt !== null && closesAt !== null) {
      if (opensAt === closesAt) {
        return true;
      }
      if (opensAt < closesAt && parts.minutesOfDay >= opensAt && parts.minutesOfDay <= closesAt) {
        return true;
      }
      if (opensAt > closesAt && parts.minutesOfDay >= opensAt) {
        return true;
      }
    }
  }

  if (previous && !previous.isClosed) {
    const previousOpensAt = toMinutes(previous.opensAt);
    const previousClosesAt = toMinutes(previous.closesAt);
    if (previousOpensAt !== null && previousClosesAt !== null && previousOpensAt > previousClosesAt && parts.minutesOfDay <= previousClosesAt) {
      return true;
    }
  }

  return false;
}

function addDays(parts: LocalDateTimeParts, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    dayOfWeek: date.getUTCDay(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const zonedTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));

  return zonedTime - date.getTime();
}

export function formatBusinessHour(hour?: BusinessHour | null) {
  if (!hour || hour.isClosed || !hour.opensAt || !hour.closesAt) {
    return "Cerrado";
  }

  return `${normalizeTime(hour.opensAt)} - ${normalizeTime(hour.closesAt)}`;
}

export function formatLocalDateTimeInput(date = new Date(), timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  return getZonedParts(date, timeZone).inputValue;
}

export function getBusinessStatus(hours: BusinessHour[], date = new Date(), timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const current = getZonedParts(date, timeZone);
  const hoursByDay = asMap(hours);
  const hasSchedule = hasConfiguredHours(hours);

  return {
    hasSchedule,
    isOpen: isWithinRules(current, hours),
    todayHours: formatBusinessHour(hoursByDay.get(current.dayOfWeek)),
    currentInputValue: current.inputValue,
    nextOpeningInputValue: getNextOpeningInputValue(hours, date, timeZone),
  };
}

export function getNextOpeningInputValue(hours: BusinessHour[], date = new Date(), timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const current = getZonedParts(date, timeZone);

  if (!hasConfiguredHours(hours)) {
    return current.inputValue;
  }

  const hoursByDay = asMap(hours);
  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDate = addDays(current, offset);
    const hour = hoursByDay.get(candidateDate.dayOfWeek);
    const opensAt = toMinutes(hour?.opensAt);
    if (!hour || hour.isClosed || opensAt === null) {
      continue;
    }

    const candidateInputValue = `${candidateDate.year}-${pad(candidateDate.month)}-${pad(candidateDate.day)}T${normalizeTime(hour.opensAt)}`;
    if (candidateInputValue > current.inputValue) {
      return candidateInputValue;
    }
  }

  return current.inputValue;
}

export function isLocalDateTimeWithinBusinessHours(value: string | null | undefined, hours: BusinessHour[]) {
  const parts = parseLocalDateTimeInput(value);
  if (!parts) {
    return false;
  }

  return isWithinRules(parts, hours);
}

export function localDateTimeInputToIso(value: string, timeZone = DEFAULT_RESTAURANT_TIME_ZONE) {
  const parts = parseLocalDateTimeInput(value);
  if (!parts) {
    return null;
  }

  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset).toISOString();
}
