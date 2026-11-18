import "./globals.css";
import MotionProvider from "@/components/MotionProvider";
import AppRail from "@/components/AppRail";
import { Barlow } from "next/font/google";
import { DEFAULT_LOOK } from "@/lib/look-config";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata = {
  title: "WarrantyDesk",
  description: "Warranty claims workflow for automotive sub-dealers",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#111111" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-look={DEFAULT_LOOK} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var l=localStorage.getItem('look');if(l==='new'||l==='classic')document.documentElement.setAttribute('data-look',l)}catch(e){}",
          }}
        />
      </head>
      <body className={barlow.className}>
        <MotionProvider>
          <AppRail />
          {children}
        </MotionProvider>
      </body>
    </html>
  );
}
