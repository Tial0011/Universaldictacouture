import { Routes, Route } from "react-router-dom";
import SiteLayout from "./components/navigation/SiteLayout";
import AdminLayout from "./components/navigation/AdminLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";

import Home from "./pages/Home/Home";
import Shop from "./pages/Shop/Shop";
import ProductDetails from "./pages/ProductDetails/ProductDetails";
import CustomStyle from "./pages/CustomStyle/CustomStyle";
import ReviewsFeeds from "./pages/ReviewsFeeds/ReviewsFeeds";
import Chats from "./pages/Chats/Chats";
import About from "./pages/About/About";
import Profile from "./pages/Profile/Profile";
import SavedPieces from "./pages/SavedPieces/SavedPieces";
import MyCloset from "./pages/MyCloset/MyCloset";
import NotFound from "./pages/NotFound";

import Dashboard from "./pages/admin/Dashboard/Dashboard";
import AdminProducts from "./pages/admin/Products/Products";
import AdminTaxonomy from "./pages/admin/Taxonomy/Taxonomy";
import AdminDiscovery from "./pages/admin/Discovery/Discovery";
import AdminHomepage from "./pages/admin/Homepage/Homepage";
import AdminReviews from "./pages/admin/Reviews/Reviews";

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
        <Route path="/profile" element={<Profile />} />
        <Route path="/saved-pieces" element={<SavedPieces />} />
        <Route path="/my-closet" element={<MyCloset />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="taxonomy" element={<AdminTaxonomy />} />
        <Route path="discovery" element={<AdminDiscovery />} />
        <Route path="homepage" element={<AdminHomepage />} />
        <Route path="reviews" element={<AdminReviews />} />
      </Route>
    </Routes>
  );
}
