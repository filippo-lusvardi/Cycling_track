import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState } from "react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sessionReady } from "@/lib/account";
import { authError } from "@/lib/auth-errors";
import { auth } from "@/lib/firebase";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
  // Where to go after signing in (a forest invite link, say); only paths inside the app.
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s["next"] === "string" && s["next"].startsWith("/") && !s["next"].startsWith("//")
      ? { next: s["next"] }
      : {},
  head: () => ({ meta: [{ title: t("Sign in — Cirmolo", "Accedi — Cirmolo") }] }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "reset";

function LoginPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        toast.success(
          t(
            "Check your email for a link to choose a new password",
            "Controlla l'email: troverai un link per scegliere una nuova password",
          ),
        );
        setMode("signin");
        return;
      }
      if (mode === "signup") await createUserWithEmailAndPassword(auth, email.trim(), password);
      else await signInWithEmailAndPassword(auth, email.trim(), password);
      // The account's intervals.icu key comes down first, so a known account skips Settings.
      await sessionReady();
      if (next) window.location.assign(next);
      else navigate({ to: "/" });
    } catch (err) {
      toast.error(authError(err));
    } finally {
      setBusy(false);
    }
  }

  const title = {
    signin: t("Sign in", "Accedi"),
    signup: t("Create account", "Crea account"),
    reset: t("Reset password", "Reimposta password"),
  }[mode];

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-6">
      <div className="flex items-center gap-3">
        <img src="/icon.svg" alt="" width={40} height={40} className="rounded-lg" />
        <div>
          <div className="eyebrow">Cirmolo</div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        </div>
      </div>
      <Panel title={title}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {mode !== "reset" && (
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy
              ? t("Please wait…", "Attendere…")
              : mode === "reset"
                ? t("Send reset link", "Invia link")
                : title}
          </Button>
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <button
              type="button"
              className="text-primary underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin"
                ? t("Create an account", "Crea un account")
                : t("I have an account", "Ho già un account")}
            </button>
            {mode === "signin" && (
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => setMode("reset")}
              >
                {t("Forgot password?", "Password dimenticata?")}
              </button>
            )}
          </div>
        </form>
      </Panel>
      <p className="text-xs text-muted-foreground">
        {t(
          "Your account keeps your intervals.icu key and saved segments, so any device you sign in on is ready to go. Rides and wellness stay on intervals.icu.",
          "L'account conserva la chiave intervals.icu e i segmenti salvati, così ogni dispositivo su cui accedi è subito pronto. Attività e benessere restano su intervals.icu.",
        )}{" "}
        {mode === "signup"
          ? t(
              "By creating an account you confirm you've read the",
              "Creando un account confermi di aver letto l'",
            )
          : t("See the", "Leggi l'")}{" "}
        <Link to="/privacy" className="underline hover:text-foreground">
          {t("privacy notice", "informativa privacy")}
        </Link>
        .
      </p>
    </div>
  );
}
