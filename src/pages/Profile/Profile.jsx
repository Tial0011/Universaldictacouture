<<<<<<< HEAD
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { refreshAccountVerification, sendAccountVerification } from "../../firebase/accountActions";
import { fetchCustomerProfile } from "../../services/customerProfile";
=======
import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { PROFILE_AREAS, profileArea } from "../../services/profileExperience";
import { useAccountProfile } from "../../hooks/useAccountProfile";
import { safeReturnPath } from "../../services/authFlow";
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Button from "../../components/common/Button";
import { AccountAccessState, AccountIcon, AccountNotice } from "../../components/account/AccountVisuals";
import { ProfileOverview, PersonalDetails, SavedAddresses, SignInSecurity, Communications, PrivacyAccount, ContinueExploring, DictaExperience } from "./ProfileContent";
import { AREA_ICONS, AREA_DESCRIPTIONS } from "./profileVisualContract";
import "./Profile.css";
import ProfileDetailsEditor from "./ProfileDetailsEditor";

export default function Profile() {
<<<<<<< HEAD
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
=======
  const { user, isLoading, sessionState, recheckSession } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const area = profileArea(params.get("area"));
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const source = useAccountProfile(uid, attempt);
  const [busy, setBusy] = useState(false);
  const [signOutUnknown, setSignOutUnknown] = useState(false);
  const [error, setError] = useState("");
  const heading = useRef(null);
  const navigation = useRef(null);
  useDocumentMeta({ title: "Your account | Universal Dicta Couture", noindex: true });
  useEffect(() => { if (document.activeElement?.id !== "profile-area") heading.current?.focus(); }, [area]);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width:767px)");
    const moveNavigationFocus = () => {
      if (!navigation.current?.contains(document.activeElement)) return;
      const target = navigation.current.querySelector(mobile.matches ? "#profile-area" : "button[aria-current='page']");
      target?.focus({ preventScroll: true });
    };
    mobile.addEventListener("change", moveNavigationFocus);
    return () => mobile.removeEventListener("change", moveNavigationFocus);
  }, []);
  if (isLoading) return <AccountAccessState state="checking" />;
  if (["unverifiable", "revoked"].includes(sessionState)) return <AccountAccessState state={sessionState} />;
  if (!user) return <Navigate to="/signin" replace state={{ returnTo: safeReturnPath(location.pathname + location.search), sessionReason: sessionState }} />;
  if (["restricted", "deleted", "revoked", "unverifiable"].includes(source.state)) return <AccountAccessState state={source.state} onCheck={() => setAttempt(value => value + 1)} />;
  const profileState = source.uid === uid ? source.state : "loading";
  async function logout() {
    if (signOutUnknown || busy) return;
    setBusy(true); setError("");
    try { await signOutUser(); } catch { setSignOutUnknown(true); setError("Sign-out could not be confirmed. Check your current session before continuing."); }
    finally { setBusy(false); }
  }
  function openArea(id) { setParams(id === "overview" ? {} : { area: id }); }
  const title = PROFILE_AREAS.find(item => item.id === area).label;
  return <section className="container profile-workspace" aria-label="Customer account">
    <aside ref={navigation} className="profile-navigation"><p className="profile-eyebrow">Personal account</p><nav aria-label="Account settings">{PROFILE_AREAS.map(item => <button type="button" key={item.id} aria-current={area === item.id ? "page" : undefined} onClick={() => openArea(item.id)}><AccountIcon name={AREA_ICONS[item.id]} /><span>{item.label}</span></button>)}</nav><div className="profile-mobile-navigation"><label htmlFor="profile-area">Account area</label><select id="profile-area" value={area} onChange={event => openArea(event.target.value)}>{PROFILE_AREAS.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div><Button variant="ghost" isLoading={busy} disabled={signOutUnknown} onClick={logout}>Sign out</Button><p className="profile-rail-note">Your style. Your story.<br />Your personal space.</p></aside>
    <div className="profile-content"><header className="profile-heading"><p className="profile-eyebrow">Your Universal Dicta Couture account</p><h1 ref={heading} tabIndex={-1}>{title}</h1><p>{AREA_DESCRIPTIONS[area]}</p></header>
      {error && <AccountNotice state="unknown" title="Sign-out could not be confirmed" announce={false} actions={<Button onClick={recheckSession}>Check current session</Button>}><p role="alert">{error}</p></AccountNotice>}
      {area === "overview" && <ProfileOverview profileState={profileState} openArea={openArea} onRefresh={() => { setAttempt(value => value + 1); }} />}
      {area === "personal" && (profileState === "loaded" ? <ProfileDetailsEditor key={`${uid}:${source.epoch}`} uid={uid} source={source} onRefresh={() => setAttempt(value => value + 1)} /> : <PersonalDetails profileState={profileState} profile={null} />)}
      {area === "addresses" && <SavedAddresses />}
      {area === "security" && <SignInSecurity user={user} busy={busy} logout={logout} logoutBlocked={signOutUnknown} />}
      {area === "communications" && <Communications />}
      {area === "privacy" && <PrivacyAccount />}
      {area === "experience" && <DictaExperience />}
      {(area === "overview" || area === "experience") && <ContinueExploring />}
    </div>
  </section>;
>>>>>>> 36986ec94db2bf83503fded0dfe6362a8aed14d9
}
