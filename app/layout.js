import "./globals.css";

export const metadata = {
  title: "Grand Crew — Shot Board",
  description: "Shot list boards for Grand Crew productions",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
