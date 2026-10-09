import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { signOutUser } from "../../firebase/auth";
import { PROFILE_AREAS, profileArea } from "../../services/profileExperience";
import { useAccountProfile } from "../../hooks/useAccountProfile";
import { safeReturnPath } from "../../services/authFlow";
import { useDocumentMeta } from "../../hooks/useDocumentMeta";
import Button from "../../components/common/Button";
import { AccountAccessState, AccountIcon, AccountNotice } from "../../components/account/AccountVisuals";
import { ProfileOverview, PersonalDetails, SavedAddresses, SignInSecurity, Communications, PrivacyAccount, ContinueExploring, DictaExperience } from "./ProfileContent";
import { AREA_ICONS, AREA_DESCRIPTIONS } from "./profileVisualContract";
import "./Profile.css";
import ProfileDetailsEditor from "./ProfileDetailsEditor";

export default function Profile() {
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
}
