import "./globals.css";
import MotionProvider from "@/components/MotionProvider";
import { Barlow } from "next/font/google";

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
  themeColor: "#111111",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={barlow.className}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
