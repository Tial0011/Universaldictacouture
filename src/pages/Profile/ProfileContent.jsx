import Button from "../../components/common/Button";
import { AccountIcon, AccountNotice, AccountPanel } from "../../components/account/AccountVisuals";
import { CLOSET_LINKS, COMMUNICATION_PRESETS } from "../../services/profileExperience";

function Unavailable({ children, loading = false, title }) {
  return <AccountNotice state={loading ? "loading" : "unavailable"} title={title} announce={loading}>{children || "We can’t check this information right now. No saved state is shown."}</AccountNotice>;
}

export function ClosetContinuity() {
  const icons = ["shopping-bag", "file-text", "package", "credit-card"];
  return <AccountPanel title="My Closet" description="Your saved pieces, saved reviews, orders and payments—all in their own space.">
    <div className="profile-continuity">{CLOSET_LINKS.map((link, index) => <section className="profile-continuity-card" key={link.label}>
      <span className="account-icon-tile"><AccountIcon name={icons[index]} /></span><h3>{link.label}</h3>
      <p>{link.to ? "Continue to your collection. Current access is checked there." : "This destination is not connected yet."}</p>
      {link.to ? <Button to={link.to} variant="ghost">Open {link.label.toLowerCase()}</Button> : <span className="profile-availability">Not available yet</span>}
    </section>)}</div>
  </AccountPanel>;
}

export function ProfileOverview({ profileState, openArea, onRefresh }) {
  return <>
    <div className="profile-overview-lead">
      <AccountPanel className="profile-welcome" title="Welcome back" description="Your style journey continues." icon="users">
        {profileState === "loaded" ? <p role="status">Your account is connected. Open Personal Details to view or update your current information.</p> : <Unavailable loading={profileState === "loading"}>{profileState === "loading" ? "Checking your current Profile…" : "We can’t load your Profile right now. You can still explore your account settings."}</Unavailable>}
        <div className="account-actions"><Button onClick={() => openArea("personal")}>Personal Details</Button><Button variant="ghost" onClick={onRefresh}>Check Profile again</Button></div>
      </AccountPanel>
      <AccountPanel title="Customer Attention" description="Anything that needs your action." icon="alert-circle"><Unavailable>We can’t check action-required items right now. No task or count has been assumed.</Unavailable><Button onClick={() => openArea("security")} variant="ghost">Sign-in & Security</Button></AccountPanel>
    </div>
    <ClosetContinuity />
    <div className="profile-overview-secondary"><AccountPanel title="Continue Your Journey" icon="activity"><Unavailable>Saved progress can’t be checked right now. No previous task will be resumed automatically.</Unavailable></AccountPanel><AccountPanel title="Custom Style" icon="scissors" description="A piece shaped around your vision."><p>Explore the next step in your couture journey.</p><Button to="/custom-style" variant="secondary">Explore Custom Style</Button></AccountPanel></div>
  </>;
}

const detailFields = [
  { key: "fullName", label: "Full Name", required: true, autoComplete: "name", hint: "Your private account name." },
  { key: "preferredName", label: "Preferred Name", autoComplete: "nickname", hint: "Optional. How you prefer to be addressed privately." },
  { key: "phoneNumber", label: "Phone Number", required: true, type: "tel", autoComplete: "tel", hint: "Your current contact number." },
  { key: "publicDisplayName", label: "Public Review / Dicta Moment Display Name", hint: "Optional. Separate from your private name and past publications." },
];

export function PersonalDetails({ profileState, profile }) {
  // A confirmed text projection may be displayed, but writes and private photo retrieval
  // remain unavailable until their owning services exist. Missing values are not defaults.
  const loaded = profileState === "loaded";
  return <AccountPanel title="Current Personal Details" description="Changes here never change the details captured for previous orders or payments.">
    <Unavailable loading={profileState === "loading"}>Your details can’t currently be edited. We haven’t changed or inferred any saved values.</Unavailable>
    <dl className="profile-field-contract profile-details-form">
      <div className="profile-photo-row"><dt>Profile Photo <span className="profile-optional">(optional)</span></dt><dd><span className="profile-photo-unavailable"><AccountIcon name="image" /><span>Photo unavailable</span></span><div><Button variant="secondary" disabled aria-describedby="profile-photo-help">Change Photo</Button><p id="profile-photo-help" className="profile-note">Private by default. Uploading does not grant public or promotional use.</p></div></dd></div>
      {detailFields.map(field => <div key={field.key}><dt><label htmlFor={`profile-${field.key}`}>{field.label}<span className="profile-optional"> {field.required ? "(required)" : "(optional)"}</span></label></dt><dd><input className="form-control" id={`profile-${field.key}`} name={field.key} type={field.type || "text"} autoComplete={field.autoComplete || "off"} required={field.required || undefined} value={loaded ? profile?.[field.key] ?? "" : ""} readOnly disabled aria-describedby={`profile-${field.key}-hint`} /><p id={`profile-${field.key}-hint`} className="profile-note">{field.hint}{!loaded && " Saved value unavailable."}</p></dd></div>)}
    </dl><div className="account-actions"><Button disabled aria-describedby="profile-save-help">Save Changes</Button><Button to="/profile?area=addresses" variant="ghost">Saved Addresses</Button></div><p id="profile-save-help" className="profile-note">Saving is unavailable until your current details can be checked.</p>
  </AccountPanel>;
}

export function SavedAddresses() {
  return <AccountPanel title="Your reusable address book" description="Save an address for future use. Previous delivery details stay unchanged." icon="home" action={<Button disabled aria-describedby="address-source-note">Add Address</Button>}>
    <Unavailable title="Saved Addresses unavailable">We can’t load your address book right now. This is not an empty address list.</Unavailable>
    <p id="address-source-note" className="profile-note">Add, edit, delete and default-address changes are unavailable until your saved addresses can be checked.</p>
  </AccountPanel>;
}

function SecurityRow({ title, children, icon = "lock", action }) {
  return <section className="profile-security-row"><span className="account-icon-tile"><AccountIcon name={icon} /></span><div><h2>{title}</h2>{children}</div>{action}</section>;
}
export function SignInSecurity({ user, busy, logout, logoutBlocked = false }) {
  return <>
    <div className="profile-security-group">
      <SecurityRow title="Current sign-in" icon="message-square" action={<Button disabled variant="secondary" aria-describedby="security-source-note">Change Email</Button>}><dl className="profile-field-contract"><div><dt>Current Login Email</dt><dd>{user.email || "Not available from the current sign-in provider"}</dd></div></dl><p className="profile-note">Your current sign-in email, not your public display name.</p></SecurityRow>
      <SecurityRow title="Password" action={<Button disabled variant="secondary" aria-describedby="security-source-note">Change Password</Button>}><p>Your password is never displayed.</p></SecurityRow>
      <SecurityRow title="Keep Me Signed In" icon="layout"><p>Current-device persistence settings are unavailable. No permanent trust has been assumed.</p></SecurityRow>
    </div>
    <p id="security-source-note" className="profile-note">Email and password changes need current account checks and are not available yet.</p>
    <AccountPanel title="Signed-in Devices" icon="layout" description="Manage current account sessions."><Unavailable>We can’t check your device list. No remote sign-out has been performed.</Unavailable><div className="account-actions"><Button isLoading={busy} disabled={logoutBlocked} onClick={logout}>Sign out this session</Button><Button disabled variant="secondary">Sign Out All Other Devices</Button></div></AccountPanel>
    <AccountPanel title="Recent Security Activity" icon="shield"><Unavailable>Current security activity can’t be loaded right now.</Unavailable></AccountPanel>
  </>;
}

const presetDescriptions = ["Only essential and important updates.", "A considered mix of style and community updates.", "All approved optional updates."];
export function Communications() {
  return <>
    <AccountPanel title="Essential account communications" description="Updates needed to service your orders, payments and account security.">
      <div className="profile-communication-rows">{[["Orders", "package", "Order and delivery updates."], ["Payments", "credit-card", "Payment confirmations and important updates."], ["Security", "shield", "Account access and security updates."]].map(([title, icon, description]) => <div key={title}><AccountIcon name={icon} /><div><h3>{title}</h3><p>{description}</p></div><span className="profile-availability">Essential</span></div>)}</div><p className="profile-note">Channels: Email and in-site notifications. These are not advertising preferences.</p>
    </AccountPanel>
    <AccountPanel title="Your communication preferences" description="Choose your optional updates, on your terms.">
      <Unavailable>No saved preset or optional permission can currently be checked.</Unavailable>
      <fieldset disabled className="profile-presets" aria-describedby="profile-preset-note"><legend>Communication preset</legend>{COMMUNICATION_PRESETS.map((preset, index) => <label key={preset}><input type="radio" name="communication-preset" value={preset} /><span><strong>{preset}</strong><small>{presetDescriptions[index]}</small></span></label>)}</fieldset>
      <p id="profile-preset-note" className="profile-note">No preset is selected. Changes are unavailable until your preferences can be checked and saved.</p>
      <div className="profile-preference-notes"><div><h3>Dicta Couturier alerts</h3><p>Optional style updates. Current preference unavailable.</p></div><div><h3>Style Circle</h3><p>Optional community updates. Current preference unavailable.</p></div></div>
    </AccountPanel>
    <AccountPanel title="Advanced preferences"><div className="profile-preference-notes"><div><h3>Quiet Hours</h3><p>Current settings unavailable.</p></div><div><h3>Style Digest</h3><p>Instant or weekly settings unavailable.</p></div></div></AccountPanel>
  </>;
}

export function PrivacyAccount() {
  return <>
    <div className="profile-privacy-grid">
      <AccountPanel title="Your privacy" description="Understand and manage your information.">
        <div className="profile-privacy-links"><a href="#profile-public-identity"><AccountIcon name="users" />Public Identity & Review Permissions</a><a href="#profile-information"><AccountIcon name="file-text" />My Information</a><a href="#profile-information-use"><AccountIcon name="info" />Where My Information Is Used</a><a href="#profile-delete"><AccountIcon name="shield" />Delete Account</a></div>
        <Button to="/profile?area=personal" variant="secondary">Manage My Information</Button><Button to="/policies" variant="ghost">Privacy Policy</Button>
      </AccountPanel>
      <AccountPanel id="profile-information" title="My Information" description="Your current information, checked separately at each source.">
        <div className="profile-information-groups">{[["Account Information", "users"], ["Contact Information", "message-square"], ["Style Information", "scissors"], ["Order Information", "package"]].map(([title, icon]) => <section key={title}><AccountIcon name={icon} /><div><h3>{title}</h3><p>Source unavailable</p></div></section>)}</div><p className="profile-note">These groups could not be loaded. This is not a complete view of your information.</p>
      </AccountPanel>
    </div>
    <AccountPanel id="profile-public-identity" title="Public Identity & Review Permissions" icon="users"><p>Your Full Name and Preferred Name stay private. A public display name is a separate choice.</p><Unavailable title="Public Identity Preview unavailable">Current display settings, permissions and privacy activity can’t be checked right now. No publication permission has been assumed.</Unavailable></AccountPanel>
    <AccountPanel id="profile-information-use" title="Where My Information Is Used" description="Current account information and past business records are different."><p>Update current details in Personal Details. Orders, payments, conversations and publications retain their own historical evidence.</p></AccountPanel>
    <AccountPanel id="profile-delete" title="Delete Account" icon="shield" className="profile-destructive" description="A deliberate decision, with a clear account impact."><p>Confirmed deletion ends normal customer access. It does not automatically cancel orders or erase legitimate transaction and publication history.</p><Unavailable>Deletion can’t be submitted while current account access and the deletion outcome cannot be checked. No request has been made.</Unavailable><Button disabled aria-describedby="profile-delete-note" variant="secondary">Delete Account</Button><p id="profile-delete-note" className="profile-note">Protected confirmation and current authentication are required before a deletion can be submitted.</p></AccountPanel>
  </>;
}

export function ContinueExploring() {
  return <AccountPanel title="Continue exploring" description="Find your next inspiration."><div className="profile-explore-links"><Button to="/shop" variant="secondary">Shop all</Button><Button to="/custom-style" variant="secondary">Custom Style</Button><Button to="/reviews-feeds" variant="secondary">Reviews & Dicta Moments</Button><Button to="/chats" variant="secondary">Chat with a Dicta Couturier</Button></div></AccountPanel>;
}
export function DictaExperience() {
  return <><ClosetContinuity /><AccountPanel title="Resume your journey" icon="activity"><Unavailable>Saved progress can’t be checked. No task has been resumed from browser history.</Unavailable></AccountPanel></>;
}
