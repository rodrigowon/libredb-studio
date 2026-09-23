"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ExternalLink, Lock, Mail, ShieldCheck, Shield } from "lucide-react";
import { toast } from "sonner";
import LibreDBLogo from "@/components/libredb-logo";
import { CommunitySection } from "@/components/community-section";
import { ConnectionSignature } from "@/components/login/connection-signature";
import { DatabaseShowcase } from "@/components/login/database-showcase";
import { WireCompatibleLine } from "@/components/login/wire-compatible-line";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { HeroProof, useHeroClaims } from "@/components/login/hero-proof";

/**
 * The agent half of the mobile summary comes from the same localized claim data as the
 * desktop figure, so the two surfaces cannot drift.
 */
function LoginFormInner({ authProvider }: { authProvider: string }) {
  const isOIDC = authProvider === "oidc";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const oidcError = searchParams.get("error");
  const t = useTranslations("Login");
  const heroClaims = useHeroClaims();
  const agentClaimDetail = heroClaims.find((claim) => claim.key === "agent")?.detail ?? "";

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!email || !password) {
      toast.error(t("messages.requiredCredentials"));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(t("messages.welcome", { role: data.role }));
        router.push(data.role === "admin" ? "/admin" : "/");
        router.refresh();
      } else {
        // data.message is the login route's own body ({ success: false, message }); data.error is
        // everything else that can refuse a login POST before or without reaching that body - the
        // proxy's Origin-mismatch 403 (src/proxy.ts) and the shared 429 envelope
        // (createErrorResponse) both carry `error`, not `message`. Without this fallback, a
        // reverse-proxy Host rewrite or a rate-limited legitimate user both see "Invalid email or
        // password" instead of the actionable text naming ALLOWED_ORIGINS or the retry window.
        const message =
          data.message === "Invalid email or password"
            ? t("messages.invalidCredentials")
            : data.message || data.error || t("messages.invalidCredentials");
        toast.error(message);
      }
    } catch {
      toast.error(t("messages.genericError"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <div className="absolute right-4 top-4 z-20">
        <LocaleSwitcher />
      </div>
      {/* The existing product panel stays dark; the form follows the viewer's theme. */}
      <div className="dark hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-surface" />

        {/* Right edge separator */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-fill-strong" />

        {/* Content */}
        <div className="relative z-10 flex flex-col gap-8 p-8 xl:p-12 w-full overflow-y-auto">
          {/* Top: Logo */}
          <a
            href="https://libredb.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 group w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-fill border border-hairline-strong">
              <LibreDBLogo className="h-6 w-6 text-blue-400" />
            </div>
            <span className="text-xl font-semibold text-white tracking-tight group-hover:text-blue-400 transition-colors duration-200">
              LibreDB Studio
            </span>
          </a>

          {/*
            Thesis, then evidence, then the proof numbers - three tiers of weight instead of
            six blocks competing at one weight.

            A single `mt-auto` here, and none below: with `mt-auto` on both the middle and
            the bottom group the column split its free space in two, and once the content
            grew past the viewport the two groups closed up against each other and the panel
            simply overflowed the page (measured at 1294px tall in a 900px viewport, which
            pushed the sign-in card itself below the fold). The content now ends with the
            community row, so one auto margin above it is the whole layout.
          */}
          <div className="space-y-6 mt-auto">
            <div className="space-y-4 max-w-xl">
              <h1 className="text-3xl font-semibold text-white tracking-tight leading-tight">
                {t.rich("hero.title", {
                  accent: (chunks) => (
                    <span className="text-fg-secondary">
                      {chunks}
                    </span>
                  ),
                })}
              </h1>
              {/*
                No longer "deploy with Docker in seconds": Docker is one of two dozen live
                channels (distribution/channels.yaml), and half of the rest are installers,
                so the old line was both an undercount and a contradiction of the deb, rpm,
                Snap, winget, Homebrew and AppImage packages this project ships.
              */}
              <p className="text-sm text-fg-tertiary leading-relaxed">{t("hero.description")}</p>
            </div>

            <ConnectionSignature />

            {/*
              The pills and the relatives line are ONE block with a 12px gap, not two
              siblings in the 32px rhythm above. Two reasons, and the second is a measurement:
              the line is the second half of the engine list rather than a fourth claim, so it
              belongs to the pills; and this column had no room to give. At 1280x800 the hero
              measured exactly 800px before this change - zero slack - so every pixel added
              here scrolls the page. Folding the two into one block buys back 20px of the 32
              the standalone gap would have cost.
            */}
            <div className="space-y-3">
              <DatabaseShowcase variant="desktop" />
              <WireCompatibleLine variant="desktop" />
            </div>

            <HeroProof claims={heroClaims} />
          </div>

          <div>
            <CommunitySection variant="desktop" />
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile branding (visible only on mobile) */}
          <a
            href="https://libredb.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("brand.websiteAriaLabel")}
            className="flex items-center gap-3 lg:hidden group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-raised border border-hairline-strong">
                <LibreDBLogo className="h-6 w-6 text-blue-400" />
              </div>
            </div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-lg font-semibold tracking-tight group-hover:text-blue-400 transition-colors duration-200">
                LibreDB Studio
              </h2>
              <p className="text-xs text-muted-foreground">{t("brand.tagline")}</p>
            </div>
          </a>

          <Card className="rounded-md border-hairline-strong bg-surface gap-5 py-6 shadow-none">
            {/* Desktop header inside card */}
            <CardHeader className="space-y-1 text-left">
              <CardTitle className="text-xl font-semibold tracking-tight">
                <span className="hidden lg:inline">{t("header.desktopTitle")}</span>
                <span className="lg:hidden">{t("header.mobileTitle")}</span>
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                <span className="hidden lg:inline">{t("header.desktopDescription")}</span>
                <span className="lg:hidden">{t("header.mobileDescription")}</span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              {isOIDC ? (
                <>
                  {oidcError && (
                    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                      {t("oidc.error")}
                    </div>
                  )}

                  <div className="flex flex-col items-center text-center space-y-3 py-2">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <ShieldCheck className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">{t("oidc.title")}</p>
                      <p className="text-xs text-muted-foreground">{t("oidc.description")}</p>
                    </div>
                  </div>

                  <Button
                    className="w-full h-10 text-sm font-medium gap-2"
                    onClick={() => {
                      setIsLoading(true);
                      window.location.href = "/api/auth/oidc/login";
                    }}
                    disabled={isLoading}
                  >
                    <ExternalLink className="h-4 w-4" />
                    {isLoading ? t("oidc.redirecting") : t("oidc.submit")}
                  </Button>

                  {/*
                    One badge, not two. A lone "Encrypted" used to sit beside this one and named no
                    subject - and on the default STORAGE_PROVIDER=local deployment it had no
                    referent beyond the TLS the browser already indicates: credentials live in the
                    browser's localStorage in plaintext by design, and the at-rest AES-256-GCM in
                    src/lib/storage/encryption.ts covers the sqlite/postgres server store only.
                    "OIDC Protected" survives because it states something this branch actually does.
                  */}
                  <div className="flex items-center justify-center gap-4 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      <span>{t("oidc.protected")}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t("form.emailLabel")}</Label>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                          id="email"
                          type="email"
                          placeholder={t("form.emailPlaceholder")}
                          className="pl-10 h-10 shadow-none"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t("form.passwordLabel")}</Label>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                          id="password"
                          type="password"
                          placeholder={t("form.passwordPlaceholder")}
                          className="pl-10 h-10 shadow-none"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full h-10 text-sm font-medium"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? t("form.authenticating") : t("form.submit")}
                    </Button>
                  </form>
                </>
              )}
            </CardContent>

            <CardFooter className="border-t border-hairline flex flex-col items-start gap-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("footer.security")}
              </p>
              <span className="text-xs text-muted-foreground font-mono">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </span>
            </CardFooter>
          </Card>

          {/*
            Mobile showcase: the same three derived sources as the hero, condensed. The
            deploy block collapses to one line and the agent claim to its own paragraph -
            these tokens follow the viewer's theme, unlike the pinned-dark hero above.
          */}
          <div className="lg:hidden space-y-4">
            <DatabaseShowcase variant="mobile" />
            <WireCompatibleLine variant="mobile" />
            {/*
              The same three claims the desktop hero makes, joined into one line rather than
              re-worded for mobile: the localized claims are the single source, so a change to the
              agent copy cannot land on one surface and miss the other.
            */}
            <p
              data-testid="agent-claim"
              className="text-[10px] text-center text-muted-foreground leading-relaxed select-none"
            >
              {heroClaims.map((claim) => `${claim.value} ${claim.unit}`).join(" · ")} — {agentClaimDetail}
            </p>
            <CommunitySection variant="mobile" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginForm({ authProvider }: { authProvider: string }) {
  return (
    <Suspense>
      <LoginFormInner authProvider={authProvider} />
    </Suspense>
  );
}
