"use client";

// LP のヒーローで招待コードを受け取り、招待の参加確認（/invite/[code]）へ進める。
// 未ログインなら招待ページが戻り先つきでログインへ案内する（ログイン導線は持たない）。
// LP は App Router の外（テスト・Storybook）でも描画されるため router に依存せず、
// 招待ページへは通常の画面遷移で進む。
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isValidInviteCode,
  normalizeInviteCode,
} from "@/contracts/invite-code";
import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "../logic/landing-content";
import styles from "./landing.module.css";

function assignLocation(href: string): void {
  window.location.assign(href);
}

export type LandingCodeEntryProps = {
  locale?: AppLocale;
  // 招待ページへの遷移。テスト・Storybook で差し替える。
  navigate?: (href: string) => void;
};

export function LandingCodeEntry({
  locale = "ja",
  navigate = assignLocation,
}: LandingCodeEntryProps) {
  const { landingCopy: copy } = getLandingContent(locale);
  const id = useId();
  const [code, setCode] = useState("");
  const [showError, setShowError] = useState(false);
  const [moving, setMoving] = useState(false);
  const normalized = normalizeInviteCode(code);
  const isValid = isValidInviteCode(normalized);
  const errorId = `${id}-error`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!isValid) {
      setShowError(true);
      return;
    }
    setMoving(true);
    navigate(`/invite/${normalized}`);
  }

  return (
    <form
      className={styles.heroCodeEntry}
      onSubmit={handleSubmit}
      data-testid="landing-code-entry"
      noValidate
    >
      <label htmlFor={id} className={styles.heroCodeLabel}>
        {copy.join}
      </label>
      <div className={styles.heroCodeRow}>
        <Input
          id={id}
          name="code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setShowError(false);
          }}
          placeholder={copy.codeEntry.placeholder}
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          aria-invalid={showError ? true : undefined}
          aria-describedby={showError ? errorId : undefined}
          className="h-11 w-36 bg-[var(--lp-paper)] text-center font-mono text-base tracking-[0.3em] uppercase"
        />
        <Button
          type="submit"
          variant="outline"
          size="lg"
          disabled={moving}
          className="h-11"
        >
          {moving ? copy.codeEntry.moving : copy.codeEntry.submit}
        </Button>
      </div>
      {showError && (
        <p id={errorId} role="alert" className={styles.heroCodeError}>
          {copy.codeEntry.error}
        </p>
      )}
    </form>
  );
}
