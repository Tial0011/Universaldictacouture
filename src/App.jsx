import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import SiteLayout from "./components/navigation/SiteLayout";
import AdminLayout, { ContentEntry } from "./components/navigation/AdminLayout";
import AdminAccess from "./components/admin/AdminAccess";
import StaffRoute from "./components/admin/StaffRoute";
import RequireAuth from "./components/auth/RequireAuth";
import CustomerAccountBoundary, { CustomerOrGuest } from "./components/auth/CustomerAccountBoundary";

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
const Orders = lazy(() => import("./pages/MyCloset/Orders"));
const OrderWorkspace = lazy(() => import("./pages/MyCloset/OrderWorkspace"));
const MainOrderWorkspace = lazy(() => import("./pages/admin/Operations/MainOrderWorkspace"));
const OrderQueue = lazy(() => import("./pages/admin/Operations/OrderQueue"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CustomerNotifications = lazy(() => import('./components/notifications/NotificationCentre'));
const StaffNotifications = lazy(() => import('./pages/admin/Notifications/Notifications'));
const CommunicationTemplates = lazy(() => import('./pages/admin/Notifications/Notifications').then(module=>({default:module.Templates})));
const CommunicationDeliveryIssues = lazy(() => import('./pages/admin/Notifications/Notifications').then(module=>({default:module.DeliveryIssues})));

const AdminSettings = lazy(() => import("./pages/admin/Settings/Settings"));
const AdminStaffAccess = lazy(() => import("./pages/admin/Settings/StaffAccess"));
const AdminShop = lazy(() => import("./pages/admin/Shop/ShopControl"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard/Dashboard"));
const AdminProducts = lazy(() => import("./pages/admin/Products/Products"));
const AdminTaxonomy = lazy(() => import("./pages/admin/Taxonomy/Taxonomy"));
const AdminDiscovery = lazy(() => import("./pages/admin/Discovery/Discovery"));
const AdminHomepage = lazy(() => import("./pages/admin/Homepage/Homepage"));
const AdminChats = lazy(() => import("./pages/admin/Chats/Chats"));
const AdminReviews = lazy(() => import("./pages/admin/Operations/ReviewContext"));
const AdminOperations = lazy(() => import("./pages/admin/Operations/Operations"));
const GlobalSearch = lazy(() => import("./pages/admin/Operations/GlobalSearch"));
const RecentActivity = lazy(() => import("./pages/admin/Operations/RecentActivity"));
const OwnerUnavailable = lazy(() => import("./pages/admin/Operations/OwnerUnavailable"));
const AuditHistory = lazy(() => import("./pages/admin/Operations/AuditHistory"));
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
        {/* Safe account navigation is not a private-data authorization grant. */}
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<RequireAuth><CustomerAccountBoundary><CustomerNotifications/></CustomerAccountBoundary></RequireAuth>} />
        <Route path="/saved-pieces" element={<Navigate to="/my-closet/my-pieces" replace />} />
        <Route path="/my-closet" element={<CustomerOrGuest><MyCloset /></CustomerOrGuest>} />
        <Route path="/my-closet/orders" element={<RequireAuth><CustomerAccountBoundary><Orders /></CustomerAccountBoundary></RequireAuth>} />
        <Route path="/my-closet/orders/:orderId" element={<RequireAuth><CustomerAccountBoundary><OrderWorkspace /></CustomerAccountBoundary></RequireAuth>} />
        <Route path="/my-closet/my-pieces" element={<CustomerOrGuest><SavedPieces /></CustomerOrGuest>} />
        <Route path="/my-closet/saved-reviews" element={<RequireAuth><CustomerAccountBoundary><SavedReviews /></CustomerAccountBoundary></RequireAuth>} />
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
        <Route path="attention" element={<AdminOperations />} />
        <Route path="search" element={<GlobalSearch />} />
        <Route path="activity" element={<RecentActivity />} />
        <Route path="notifications" element={<StaffRoute domain="notifications"><StaffNotifications/></StaffRoute>} />
        <Route path="notifications/templates" element={<CommunicationTemplates/>} />
        <Route path="notifications/delivery-issues" element={<CommunicationDeliveryIssues/>} />
        <Route path="content" element={<StaffRoute domain="content"><ContentEntry/></StaffRoute>} />
        <Route path="shop" element={<StaffRoute domain="products"><AdminShop /></StaffRoute>} />
        <Route path="products" element={<StaffRoute domain="products"><AdminProducts /></StaffRoute>} />
        <Route path="taxonomy" element={<StaffRoute domain="content"><AdminTaxonomy /></StaffRoute>} />
        <Route path="discovery" element={<StaffRoute domain="content"><AdminDiscovery /></StaffRoute>} />
        <Route path="homepage" element={<StaffRoute domain="content"><AdminHomepage /></StaffRoute>} />
        <Route path="reviews" element={<StaffRoute domain="reviews"><AdminReviews /></StaffRoute>} />
        <Route path="appearance" element={<StaffRoute domain="content"><AdminAppearance /></StaffRoute>} />
        <Route path="chats" element={<StaffRoute domain="chats"><AdminChats /></StaffRoute>} />
        <Route path="orders" element={<StaffRoute domain="orders"><OrderQueue /></StaffRoute>} />
        <Route path="orders/:orderId" element={<StaffRoute domain="orders"><MainOrderWorkspace /></StaffRoute>} />
        <Route path="audit" element={<StaffRoute domain="audit"><AuditHistory /></StaffRoute>} />
        {[['customers', 'customers'], ['payments', 'payments'], ['custom-style', 'customStyle']].map(([path, domain]) =>
          <Route key={path} path={path} element={<StaffRoute domain={domain}><OwnerUnavailable domain={domain} /></StaffRoute>} />)}
        <Route path="settings" element={<AdminSettings />} />
        <Route path="settings/admins" element={<AdminStaffAccess />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
