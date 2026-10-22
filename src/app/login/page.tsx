import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * PM login (T9.1). `LoginForm` is split out as a Client Component so
 * `useSearchParams` (needed to read `?redirectTo=`) can be wrapped in
 * `Suspense` here, per Next.js's requirement that any `useSearchParams` usage
 * not force the whole page out of static rendering unguarded — without this,
 * `next build` fails to prerender the page. The form draws its own page
 * (card, heading), using the look shared with the invite page (see auth-ui).
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
