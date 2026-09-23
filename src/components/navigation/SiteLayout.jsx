import { Suspense, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import LoadingSpinner from "../common/LoadingSpinner";
import PageBoundary from "../common/PageBoundary";

export default function SiteLayout() {
  const { pathname } = useLocation();
  const mainRef = useRef(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header />
      <main id="main-content" ref={mainRef} tabIndex={-1}>
        <PageBoundary key={pathname}>
          <Suspense fallback={<div className="container section"><LoadingSpinner label="Loading page" /></div>}>
            <Outlet />
          </Suspense>
        </PageBoundary>
      </main>
      <Footer />
    </>
  );
}
