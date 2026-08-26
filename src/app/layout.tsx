import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMUM Product Normalization",
  description: "Dashboard for inspecting normalized product data",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
