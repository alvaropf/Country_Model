import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Momentum Strategy Dashboard", description: "ETF Momentum Rotation Strategy" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="antialiased">{children}</body></html>;
}
