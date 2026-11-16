
"use client";

import { signIn } from "next-auth/react";

export default function LoginForm() {
  return (
    <button
      type="button"
      onClick={() =>
        signIn("google", {
          redirectTo: "/dashboard",
        })
      }
    >
      Continuar con Google
    </button>
  );
}
