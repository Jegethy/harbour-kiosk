"use client";

import { useSyncExternalStore } from "react";

/**
 * Ticks once a second.
 *
 * useSyncExternalStore rather than setState-in-an-effect: the snapshot is
 * whole seconds, so React only re-renders when the displayed value actually
 * changes, and the server snapshot keeps hydration quiet.
 */
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}

const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => 0;

/** Epoch seconds, or null before hydration. */
export function useClock(): Date | null {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return seconds === 0 ? null : new Date(seconds * 1000);
}

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const formatClockTime = (date: Date) => timeFormat.format(date);
export const formatClockDate = (date: Date) => dateFormat.format(date);

/** "14:32" — used on result screens to state when the visit was recorded. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeFormat.format(date);
}
