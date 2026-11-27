import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "vDrop — Wi‑Fi file transfer",
  description:
    "Move any file across your Wi‑Fi — upload on one laptop, download on the other, originals untouched.",
  icons: {
    icon: [
      { url: "/vdrop-favicon.webp", type: "image/webp", sizes: "32x32" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
    ],
    shortcut: "/vdrop-favicon.webp",
    apple: "/favicon-32.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1411" },
  ],
};

const themeBootScript = `(function(){try{var t=localStorage.getItem("vdrop-theme")||localStorage.getItem("ydroply-theme")||localStorage.getItem("landrop-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${manrope.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--foam)] font-sans text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
