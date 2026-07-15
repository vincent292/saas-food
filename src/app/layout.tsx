import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://yopido.shop"),
  title: {
    default: "yopido.shop",
    template: "%s | yopido.shop",
  },
  description: "Pedidos y comercio digital en una sola plataforma.",
  applicationName: "yopido.shop",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "yopido.shop",
  },
  icons: {
    icon: [
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon.ico" },
    ],
    apple: [{ url: "/brand/yopido-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "es_BO",
    siteName: "yopido.shop",
    title: "yopido.shop",
    description: "Pide lo que quieras, donde quieras.",
    images: [{ url: "/brand/yopido-social-cover.png", width: 1200, height: 630, alt: "yopido.shop" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "yopido.shop",
    description: "Pide lo que quieras, donde quieras.",
    images: ["/brand/yopido-social-cover.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#12355B",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
