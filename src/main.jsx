import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Global design system first, so component CSS (imported via App) can
// override it at equal specificity.
import "./styles/global.css";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { SavedPiecesProvider } from "./context/SavedPiecesContext";
import { ClosetProvider } from "./context/ClosetContext";
import { SavedReviewsProvider } from "./context/SavedReviewsContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <SavedPiecesProvider>
            <SavedReviewsProvider>
              <ClosetProvider>
              <App />
            </ClosetProvider>
            </SavedReviewsProvider>
          </SavedPiecesProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
