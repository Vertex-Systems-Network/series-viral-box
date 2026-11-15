import './site.css';

export const metadata = { title: 'Series Viral Box' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header><a href="/">Series Viral Box</a></header>
        <main>{children}</main>
      </body>
    </html>
  );
}
