import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product normalization ledger",
  description: "Explainable product normalization: specifications vs retail offer, trusted unit prices, visible ambiguity.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
