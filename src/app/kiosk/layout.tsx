import { KioskBodyAttribute } from "@/components/kiosk/KioskBodyAttribute";

export default function KioskLayout({ children }: LayoutProps<"/kiosk">) {
  return (
    <>
      <KioskBodyAttribute />
      <main className="flex h-dvh w-full flex-col overflow-hidden">{children}</main>
    </>
  );
}
