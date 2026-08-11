"use client";

import { useEffect } from "react";

/**
 * Applies body[data-kiosk] for the duration of the kiosk routes.
 *
 * The hardening rules in globals.css (no selection, no zoom, no overscroll,
 * no caret) have to sit on <body>, which is owned by the root layout. Scoping
 * them with an attribute keeps the admin dashboard behaving like a normal web
 * page.
 */
export function KioskBodyAttribute() {
  useEffect(() => {
    document.body.dataset.kiosk = "true";
    return () => {
      delete document.body.dataset.kiosk;
    };
  }, []);

  return null;
}
