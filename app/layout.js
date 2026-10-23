import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Header from "@/components/Header";

export const metadata = {
  title: { default: "Cab Booking App", template: "%s | CabGo" },
  description: "Book rides easily",
};

export default function RootLayout({ children }) {
  return (
    // ClerkProvider gives every page access to the logged-in user
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