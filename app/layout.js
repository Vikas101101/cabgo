import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Header from "@/components/Header";

export const metadata = {
  title: "Cab Booking App",
  description: "Book rides easily",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Header />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}