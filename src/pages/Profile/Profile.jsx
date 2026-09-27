import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { refreshAccountVerification, sendAccountVerification } from "../../firebase/accountActions";
import { fetchCustomerProfile } from "../../services/customerProfile";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Button from "../../components/common/Button";
import LoadingSpinner from "../../components/common/LoadingSpinner";
import "./Profile.css";

export default function Profile() {
  const { user, isLoading, sessionExpired } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [signedOut, setSignedOut] = useState(false);
  const [verified, setVerified] = useState(Boolean(user?.emailVerified));
  useDocumentMeta({ title: "Your account | Universal Dicta Couture", noindex: true });

  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    fetchCustomerProfile(user.uid).then((value) => { if (active) setProfile(value); }).catch(() => {});
    return () => { active = false; };
  }, [user?.uid]);

  if (isLoading) return <LoadingSpinner />;
  if (!user && !signedOut) return <Navigate to="/signin" replace state={{ returnTo: `${location.pathname}${location.search}`, sessionExpired }} />;
  if (signedOut) return <section className="account-page container"><div className="account-card account-card--status"><p className="text-secondary">Universal Dicta Couture</p><h1>Signed Out</h1><p>You’ve been signed out successfully. We’ll be here whenever you’re ready to return.</p><div className="account-actions"><Button to="/">CONTINUE BROWSING</Button><Button to="/signin" variant="secondary">SIGN IN AGAIN</Button></div></div></section>;

  async function verify(action) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "send") { await sendAccountVerification(user, "/profile"); setNotice("Verification email sent. Check your inbox and spam folder."); }
      else { const result = await refreshAccountVerification(user); setVerified(result); setNotice(result ? "Your email address is verified." : "Your email is not verified yet."); }
    } catch { setError("We couldn’t complete that account request. Please try again."); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (busy) return;
    setBusy(true); setError("");
    try { await signOutUser(); setSignedOut(true); }
    catch { setError("Unable to sign out. Please try again."); }
    finally { setBusy(false); }
  }

  return <section className="account-page container"><div className="account-card">
    <p className="text-secondary">Universal Dicta Couture · Client account</p>
    <h1>Welcome{user.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}</h1>
    <div className="account-profile-summary"><div><span>Email</span><strong>{user.email}</strong></div>{profile?.phoneNumber && <div><span>Phone</span><strong>{profile.phoneNumber}</strong></div>}<div><span>Email status</span><strong>{verified ? "Verified" : "Verification pending"}</strong></div></div>
    {!verified && <div className="account-form"><p>Verify your email to finish securing your account.</p><div className="account-actions"><Button disabled={busy} onClick={() => verify("send")}>Send verification email</Button><Button disabled={busy} variant="ghost" onClick={() => verify("check")}>Check verification</Button></div></div>}
    <div className="account-actions"><Button to="/shop">Browse Shop</Button><Button to="/my-closet" variant="secondary">My Closet</Button><Button to="/chats" variant="secondary">My messages</Button></div>
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <div className="account-actions"><Button type="button" variant="ghost" isLoading={busy} onClick={logout}>Sign out</Button><Button type="button" variant="ghost" onClick={() => navigate(-1)}>Back</Button></div>
  </div></section>;
}
