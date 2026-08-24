import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * PM login (T9.1). Minimal, functional styling only — M10 (PM Dashboard UI)
 * owns the real dashboard design; this page just needs to work for T9's
 * manual acceptance (login, logout, protected-route redirect, password reset).
 *
 * `LoginForm` is split out as a Client Component so `useSearchParams` (needed
 * to read `?redirectTo=`) can be wrapped in `Suspense` here, per Next.js's
 * requirement that any `useSearchParams` usage not force the whole page out
 * of static rendering unguarded — without this, `next build` fails to
 * prerender the page.
 */
export default function LoginPage() {
  return (
    <main style={{ padding: 24, maxWidth: 400, fontFamily: "system-ui" }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
