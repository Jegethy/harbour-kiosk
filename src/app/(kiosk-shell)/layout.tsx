import { KioskBodyAttribute } from "@/components/kiosk/KioskBodyAttribute";

/**
 * Shared chrome for every kiosk surface.
 *
 * A route group rather than a path segment, so it wraps both the kiosk itself
 * at "/" and the sub-routes still under "/kiosk/" — without putting "kiosk" in
 * the URL of the screen visitors actually look at.
 */
export default function KioskLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <KioskBodyAttribute />
      <main className="flex h-dvh w-full flex-col overflow-hidden">{children}</main>
    </>
  );
}
