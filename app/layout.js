export const metadata = {
  title: "พิซซ่า คาซ่า",
  description: "ระบบสั่งพิซซ่าผ่าน QR Code",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
