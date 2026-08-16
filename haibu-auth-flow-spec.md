# Haibu — Authentication Flow Spec

> Covers signup, email verification, Google OAuth, and password reset. Grounded in research on what real marketplaces (Airbnb, Fiverr, Cameo) do and what Supabase + Next.js actually support natively. Build nothing without reading Section 1 first.

---

## 1. What the research actually showed

### What real marketplaces do
- **Fiverr**: email + password signup with mandatory email verification before the account is active. Google OAuth as a fast-path alternative. No OTP — uses magic link for confirmation.
- **Airbnb**: email + password OR social login (Google, Apple, Facebook). Mandatory email verification. Uses magic link by default.
- **Cameo**: email + password, Google OAuth. Email confirmation required before creators can publish.

**The consistent pattern across all three:** email verification is mandatory (not optional), Google OAuth is the most common fast-path, and magic links are the dominant confirmation method — not OTP codes — for the primary email/password flow.

### Magic link vs. email OTP — the real tradeoffs
**Magic link** (click a link in your email):
- Simpler UX — one click, done.
- Problem on mobile: user taps "sign up" in Safari, gets an email, switches to Mail app, clicks link — but link opens in a new Safari tab, losing the original app context. Common, annoying, fixable with careful redirect handling.
- Problem with some email clients: corporate email gateways and security scanners sometimes pre-click links, consuming them before the user does. Supabase's PKCE flow (what this app uses with SSR) mitigates this by using a token hash rather than a one-click link.

**Email OTP** (type a 6-digit code):
- Better on mobile — user switches to email app, reads the code, switches back and types it. Never loses context.
- Works naturally as the second step in an already-started flow (user is already on a "verify your email" screen, waiting for a code).
- Research finding: users on devices with autofill (most modern iPhones and Androids) see the OTP in a suggestion banner above the keyboard without even switching apps — this is the best possible mobile UX.
- Supabase supports this natively — it's the same `signUp()` call; you just change the email template from a link to a `{{ .Token }}` variable and add a code-entry UI screen.

**Decision for Haibu: email OTP, not magic link.** Reasons:
1. The target audience (fans and creators booking real sessions) skews mobile. OTP wins on mobile.
2. Supabase's PKCE + SSR setup means magic link handling has more edge cases to get right. OTP is simpler to implement correctly in this stack.
3. OTP is the modern, expected pattern in 2026 — apps like Notion, Linear, and most new consumer apps have switched to it.

### Google OAuth — what's already built vs. what needs verifying
Google OAuth was built in Step 2 and a "Continue with Google" button exists on the login page. However:
- It has never been tested with a real Google account end-to-end in a real browser.
- Supabase's Google OAuth in local dev requires the redirect URL to match exactly what's configured in the Google Cloud Console — this is a common source of silent failures.
- The Supabase project's `Site URL` and `Redirect URLs` allowlist need to include both the local dev URL and the eventual production URL.

---

## 2. The complete authentication flow for Haibu

### 2.1 Signup — email + password

**Step 1 — Signup form** (already built, minimal changes needed)
- Email + password fields, existing segmented tab control.
- On submit: call `supabase.auth.signUp()` with `{ email, password, options: { emailRedirectTo: ... } }`.
- Do NOT log the user in immediately. Show a "Check your email" screen instead.

**Step 2 — "Check your email" screen** (new)
- A clean, centered screen: "We sent a 6-digit code to `[email]`."
- A single OTP input — six individual digit boxes (the standard iOS/Android pattern, not a plain text field), each auto-advancing focus on input.
- A "Resend code" link (disabled for 60 seconds after sending, then re-enabled with a countdown timer).
- An "Use a different email" link that goes back to signup.
- On submit: call `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
- On success: redirect to `/dashboard`.

**Step 3 — Supabase email template change** (required)
Change the "Confirm signup" email template in the Supabase dashboard from the default magic link to:
```
Subject: Your Haibu verification code
Body: Your code is: {{ .Token }}
Valid for 10 minutes.
```
Simple. No HTML needed for v1 — plain text is fine and more likely to be delivered.

**Step 4 — Custom SMTP via Resend** (required before launch)
Supabase's built-in email sending has a hard limit of 2 emails per hour. For production, configure Supabase to use Resend as the SMTP provider (same Resend account already integrated for booking reminders). This is a Supabase dashboard setting, no code change.

---

### 2.2 Signup — Google OAuth

**Flow** (mostly already built, needs verification):
1. User clicks "Continue with Google."
2. Supabase redirects to Google's consent screen.
3. User approves.
4. Google redirects back to `/auth/callback` (the existing route handler from Step 2).
5. The callback exchanges the code for a session and redirects to `/dashboard`.

**What needs verifying:**
- The Supabase project's `Site URL` is set correctly (should be `http://localhost:3000` in dev, production URL in prod).
- `http://localhost:3000/auth/callback` is in the Supabase `Redirect URLs` allowlist.
- The Google Cloud Console's OAuth credentials have `http://localhost:3000/auth/callback` as an authorized redirect URI.
- Actually test it: click "Continue with Google" in a real browser and confirm you land on `/dashboard` with a real session.

**One important UX note:** Google OAuth users skip email verification entirely — Supabase considers a Google-authenticated email pre-verified. This is correct behavior; don't add an OTP step for Google users.

---

### 2.3 Login — returning users

**Email + password:**
- Standard: email + password → `supabase.auth.signInWithPassword()` → redirect to `/dashboard`.
- If the email isn't confirmed yet: Supabase returns an error. Show: "Please verify your email first. [Resend code]" — don't just show a generic error.

**Google OAuth:**
- Same flow as signup — Google handles it, Supabase processes the callback.

**Forgot password:**
- A "Forgot password?" link below the login form.
- Clicking it shows a simple email-only form.
- On submit: `supabase.auth.resetPasswordForEmail(email)` — Supabase sends a reset email.
- **Use OTP for password reset too**, same pattern as signup confirmation — the reset email contains a 6-digit code, user types it on a "Reset password" screen, then sets a new password.
- This is a template change in Supabase, same as the signup confirmation template.

---

### 2.4 Email verification enforcement

**Where to enforce it:**
- The app's middleware (`src/proxy.ts`) already gates protected routes — add a check: if the user is logged in but `email_confirmed_at` is null (Supabase's own field on the user object), redirect them to a "Verify your email" page instead of letting them proceed.
- Exception: Google OAuth users always have `email_confirmed_at` set automatically — no redirect for them.

**The "Verify your email" interstitial:**
- Same OTP screen as the signup step 2 — reuse the same component.
- Shows if someone somehow ended up with an unverified account (e.g., they signed up on a prior version before confirmation was required, or dismissed the confirmation email).

---

## 3. UI components needed

| Component | Status | Notes |
|---|---|---|
| Login/signup form | Already built | Minor changes: better error message for unverified email |
| "Check your email" screen | **New** | OTP input + resend link + back link |
| OTP input component | **New** | 6 individual digit boxes, auto-advance, paste support, autofill support |
| "Forgot password?" link | **New** | Below the login form |
| Password reset flow | **New** | Email entry → OTP verify → new password form |
| Middleware email-verified check | **New** | 3 lines in `proxy.ts` |

---

## 4. Supabase dashboard changes required (not code — manual steps)

1. **Authentication → Providers → Email**: toggle "Confirm email" ON.
2. **Authentication → Email Templates → Confirm signup**: change to the OTP template (Section 2.1 Step 3).
3. **Authentication → Email Templates → Reset password**: change to OTP template.
4. **Authentication → URL Configuration**: confirm `Site URL` and add all necessary redirect URLs.
5. **Project Settings → Auth → SMTP**: configure Resend as the custom SMTP provider.

---

## 5. What's explicitly NOT in v1

- SMS OTP (real research: SMS is the weakest auth channel in 2026, FBI/CISA both issued guidance against SMS-only auth in 2025, and it adds real cost per message).
- Passkeys (genuinely the future and right for 2026 — but requires a separate FIDO2 implementation and adds real complexity; not urgent for v1 with a small user base).
- Apple Sign In (worth adding later if iOS app is built; required by Apple's rules for iOS apps that offer any social login).
- Multi-factor authentication beyond email confirmation.
- "Remember this device" / trusted device management.

---

## 6. Testing plan

1. **Signup with email/password** — real email address, confirm OTP arrives in inbox within ~30 seconds, enter code, land on `/dashboard` with a real session.
2. **Unverified-email gating** — create a user who somehow skips confirmation, confirm they get redirected to the OTP screen on any protected route.
3. **Google OAuth** — click "Continue with Google" in a real browser, complete Google's flow, confirm you land on `/dashboard`.
4. **Resend code** — confirm the 60-second cooldown works, confirm a fresh code arrives and the old one no longer works.
5. **Forgot password** — full reset flow: enter email, receive OTP, enter code, enter new password, confirm login works with the new password.
6. **Supabase rate limit** — confirm Resend SMTP is configured and auth emails actually deliver reliably (not hitting the 2/hr default limit).
