import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Field,
  inputClass,
  primaryButtonClass,
  buttonClass,
} from "@/components/pilot/ui";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "PILOT — Sign In" },
      { name: "description", content: "Sign in to your PILOT pastry R&D workspace" },
      { property: "og:title", content: "PILOT — Sign In" },
      {
        property: "og:description",
        content: "Sign in to your PILOT pastry R&D workspace",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          await navigate({ to: "/" });
        } else {
          setMessage("CHECK YOUR EMAIL TO CONFIRM YOUR ACCOUNT");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await navigate({ to: "/" });
      }
    } catch (error) {
      setMessage(
        (error as Error).message.toUpperCase() || "SOMETHING WENT WRONG"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-body text-foreground">
      <div className="w-full max-w-sm border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <span className="label-caps">PILOT</span>
        </div>
        <form onSubmit={submit} className="space-y-4 p-4">
          <p className="label-caps text-xs text-muted-foreground">
            {mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
          </p>
          <Field label="EMAIL">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="PASSWORD">
            <input
              type="password"
              required
              minLength={6}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {message && (
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {message}
            </p>
          )}
          <button type="submit" disabled={busy} className={primaryButtonClass + " w-full"}>
            {busy ? "..." : mode === "signin" ? "SIGN IN" : "SIGN UP"}
          </button>
          <button
            type="button"
            className={buttonClass + " w-full"}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setMessage(null);
            }}
          >
            {mode === "signin" ? "CREATE ACCOUNT" : "BACK TO SIGN IN"}
          </button>
        </form>
      </div>
    </div>
  );
}
