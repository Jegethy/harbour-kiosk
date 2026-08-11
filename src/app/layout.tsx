import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harbour Care Centre",
  description: "Visitor check-in for Harbour Care Centre",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The kiosk is a fixed-size panel; pinch-zoom only strands visitors on a
  // half-scrolled screen with no way back.
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f4c6b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
