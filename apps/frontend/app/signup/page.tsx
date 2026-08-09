import { AuthPage } from "@/components/AuthPage";
import { Suspense } from "react";

export default function Signup() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading…</div>}>
      <AuthPage isSignin={false} />
    </Suspense>
  );
}
