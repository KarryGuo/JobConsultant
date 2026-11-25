import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteChrome } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d1d19",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "职顾问 · offer 之前，先查这家公司。",
    template: "%s · 职顾问",
  },
  description:
    "输入公司名，查它有没有欠薪、社保欠缴、招聘收费等公开记录。每条结论都能点回官方原文；查不到，也不代表安全。",
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: "/",
    siteName: SITE_NAME,
    title: "职顾问 · offer 之前，先查这家公司。",
    description:
      "输入公司名，查它有没有欠薪、社保欠缴、招聘收费等公开记录。每条结论都能点回官方原文。",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "职顾问 · offer 之前，先查这家公司。",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "职顾问 · offer 之前，先查这家公司。",
    description:
      "输入公司名，查欠薪、社保欠缴、招聘收费等公开记录。",
    images: ["/og.png"],
  },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="min-h-screen antialiased">
        <SiteChrome header={<SiteHeader />} footer={<SiteFooter />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
