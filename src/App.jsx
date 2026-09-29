import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import SiteLayout from "./components/navigation/SiteLayout";
import AdminLayout from "./components/navigation/AdminLayout";
import AdminAccess from "./components/admin/AdminAccess";
import RequireAuth from "./components/auth/RequireAuth";

import PageBoundary from "./components/common/PageBoundary";
import LoadingSpinner from "./components/common/LoadingSpinner";

import Home from "./pages/Home/Home";
const Shop = lazy(() => import("./pages/Shop/Shop"));
const ProductDetails = lazy(() => import("./pages/ProductDetails/ProductDetails"));
const CustomStyle = lazy(() => import("./pages/CustomStyle/CustomStyle"));
const ReviewsFeeds = lazy(() => import("./pages/ReviewsFeeds/ReviewsFeeds"));
const Chats = lazy(() => import("./pages/Chats/Chats"));
const About = lazy(() => import("./pages/About/About"));
const OurStory = lazy(() => import("./pages/OurStory/OurStory"));
const Policies = lazy(() => import("./pages/Policies/Policies"));
const Profile = lazy(() => import("./pages/Profile/Profile"));
const Auth = lazy(() => import("./pages/Auth/Auth"));
const SavedPieces = lazy(() => import("./pages/SavedPieces/SavedPieces"));
const SavedReviews = lazy(() => import("./pages/SavedReviews/SavedReviews"));
const MyCloset = lazy(() => import("./pages/MyCloset/MyCloset"));
const NotFound = lazy(() => import("./pages/NotFound"));

const AdminSettings = lazy(() => import("./pages/admin/Settings/Settings"));
const AdminShop = lazy(() => import("./pages/admin/Shop/ShopControl"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard/Dashboard"));
const AdminProducts = lazy(() => import("./pages/admin/Products/Products"));
const AdminTaxonomy = lazy(() => import("./pages/admin/Taxonomy/Taxonomy"));
const AdminDiscovery = lazy(() => import("./pages/admin/Discovery/Discovery"));
const AdminHomepage = lazy(() => import("./pages/admin/Homepage/Homepage"));
const AdminChats = lazy(() => import("./pages/admin/Chats/Chats"));
const AdminReviews = lazy(() => import("./pages/admin/Reviews/Reviews"));
const AdminAppearance = lazy(() => import("./pages/admin/Appearance/Appearance"));

function AuthRoute() {
  const location = useLocation();
  const routeKey = location.pathname + location.search;
  return <PageBoundary key={routeKey}>
    <Suspense fallback={<main className="container section"><LoadingSpinner label="Opening your account" /></main>}>
      <Auth key={routeKey} />
    </Suspense>
  </PageBoundary>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/:productId" element={<ProductDetails />} />
        <Route path="/custom-style" element={<CustomStyle />} />
        <Route path="/reviews-feeds" element={<ReviewsFeeds />} />
        <Route path="/chats" element={<Chats />} />
        <Route path="/about" element={<About />} />
        <Route path="/our-story" element={<OurStory />} />
        <Route path="/policies" element={<Policies />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/saved-pieces" element={<Navigate to="/my-closet/my-pieces" replace />} />
        <Route path="/my-closet" element={<MyCloset />} />
        <Route path="/my-closet/my-pieces" element={<SavedPieces />} />
        <Route path="/my-closet/saved-reviews" element={<RequireAuth><SavedReviews /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>

      {["/signin", "/signup", "/verify-email", "/forgot-password", "/reset-password", "/auth/action", "/account-unavailable"].map((path) => <Route key={path} path={path} element={<AuthRoute />} />)}

      <Route
        path="/admin"
        element={
          <AdminAccess>
            <AdminLayout />
          </AdminAccess>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="shop" element={<AdminShop />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="taxonomy" element={<AdminTaxonomy />} />
        <Route path="discovery" element={<AdminDiscovery />} />
        <Route path="homepage" element={<AdminHomepage />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="appearance" element={<AdminAppearance />} />
        <Route path="chats" element={<AdminChats />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
