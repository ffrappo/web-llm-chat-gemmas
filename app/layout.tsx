/* eslint-disable @next/next/no-page-custom-font */
import "./styles/globals.scss";
import "./styles/markdown.scss";
import "./styles/highlight.scss";
import { getClientConfig } from "./config/client";
import { type Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL("https://fornacestudio.com"),
  title: "Gemmas",
  description:
    "Chat with AI large language models running natively in your browser. Your data never leaves your computer.",
  keywords: [
    "Gemma",
    "AI chat",
    "machine learning",
    "browser AI",
    "language model",
    "no server",
  ],
  authors: [{ name: "Fornace Studio" }],
  publisher: "Fornace Studio",
  creator: "Fornace Studio",
  robots: "index, follow",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#151515" },
  ],
  appleWebApp: {
    title: "Gemmas",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    url: "https://fornacestudio.com",
    title: "Gemmas",
    description:
      "Chat with AI large language models running natively in your browser",
    siteName: "Gemmas",
    images: [
      {
        url: "https://fornacestudio.com/mlc-logo.png",
        width: 360,
        height: 360,
        alt: "Gemmas - Browser-based AI conversation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Gemmas",
    description:
      "Chat with AI large language models running natively in your browser",
    images: ["https://fornacestudio.com/mlc-logo.png"],
  },
  alternates: {
    canonical: "https://fornacestudio.com",
  },
};

const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline';
    worker-src 'self';
    connect-src 'self' blob: data: https: http:;
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={cspHeader.replace(/\n/g, "")}
        />
        <meta name="config" content={JSON.stringify(getClientConfig())} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#4f46e5" />
        <meta name="msapplication-TileColor" content="#4f46e5" />
        <meta name="theme-color" content="#f0f4f8" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Gemmas",
              url: "https://fornacestudio.com",
              description:
                "Chat with AI large language models running natively in your browser. Your data never leaves your computer.",
              applicationCategory: "Artificial Intelligence",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              operatingSystem: "Web Browser",
              creator: {
                "@type": "Organization",
                name: "Fornace Studio",
              },
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
