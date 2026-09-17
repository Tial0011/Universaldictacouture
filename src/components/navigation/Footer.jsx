import "./Footer.css";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <p className="site-footer__brand">Universal Dicta Couture</p>
        <p className="text-secondary">&copy; {year} Universal Dicta Couture. All rights reserved.</p>
      </div>
    </footer>
  );
}
