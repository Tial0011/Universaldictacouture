# Universal Dicta Couture authentication handoff

This implementation keeps the existing Firebase Authentication provider and adds the customer-facing Module 1 authentication experience. No passwords, reset tokens, service-account credentials, or other secrets belong in this repository.

## Firebase Authentication dashboard

1. Keep **Email/Password** enabled under Firebase Authentication > Sign-in method.
2. Add the production Universal Dicta Couture domain(s) to **Authorized domains**.
3. For both **Email address verification** and **Password reset** templates, configure the custom email **Action URL** to the production route:

   `https://<your-production-domain>/auth/action`

   Firebase appends the secure `mode`, `oobCode` and `continueUrl` parameters. The application validates those provider-issued parameters and never stores them as ordinary customer data.
4. Keep the Firebase-generated token lifetime/validation behaviour. Do not replace it with a visible verification code or a home-grown reset token.

If the Action URL is not customized, Firebase's hosted action handler may complete verification/reset outside the Universal Dicta Couture branded flow. The application code does not bypass Firebase validation.

## Firestore rules

Deploy the repository's updated `firestore.rules` after testing. The changes add:

- private `customerProfiles/{uid}` ownership;
- admin-managed `siteAppearance/auth` content;
- authenticated Style Circle subscription writes;
- admin deletion of homepage hero slides.

Do not rely on frontend route guards as the authorization boundary for private Firestore data.

## Optional session policy settings

These are non-secret Vite configuration values. The defaults are 24 hours for an ordinary session and 30 days when **Keep me signed in on this device** is selected.

```text
VITE_AUTH_STANDARD_SESSION_HOURS=24
VITE_AUTH_EXTENDED_SESSION_DAYS=30
```

Both use Firebase browser-local persistence so closing a tab or browser is not itself a sign-out. The application session policy controls the configurable expiry window.

## Website Appearance / imagery

Authorized admins can open **Admin > Website Appearance** to replace or remove the shared authentication photograph and edit the approved presentation copy. Removing a custom authentication photograph safely falls back to the built-in fashion image.

**Admin > Homepage** remains the source of truth for homepage hero slides. Existing image fields allow desktop/mobile photograph replacement and removal; this update also permits deleting an entire hero slide after confirmation.

Removing an image from a content record detaches it from the website. The stored image blob is intentionally not destroyed automatically because the project has no reliable cross-record reference counter and the same asset may be reused elsewhere.

## Local verification checklist

After merging the changed files:

1. `npm install` / `npm ci` if dependencies are not already installed.
2. `npm run build`.
3. `npm run lint`.
4. Test Sign In, Create Account, Verify Email, Forgot Password and Reset Password.
5. Verify a protected guest action opens the authentication gate and returns to the original safe destination without automatically replaying the action.
6. Verify guest My Pieces are current-session only and merge into My Closet after signing in during the same session.
7. Verify Chat drafts, Custom Style inputs, Style Circle email and Search state survive the authentication return where applicable.
8. Verify intentional Sign Out and session-expiry states are distinct.
9. Test Admin Website Appearance image replace/remove/reset.
10. Test Homepage hero desktop/mobile image replace/remove and full slide deletion.
11. Deploy Firestore rules only after the above checks pass.
