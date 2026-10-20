import { useCallback, useEffect, useRef, useState } from "react";

type Stage = "idle" | "button" | "self" | "waiting" | "check" | "others";
type Options = {
  scope: string;
  disabled: boolean;
  ready: boolean;
  canAdvance: boolean;
  onReady?: ((ready: boolean) => boolean) | ((ready: boolean) => void);
};

type CompletionCue = {
  stage: Stage;
  busy: boolean;
  hideSelfCheck: boolean;
  request: (proceed: (() => void) | null) => void;
};

// 演出はローカル。チェックと進行はサーバーから受けた状態だけで確定する。
export function useCompletionCue(options: Options): CompletionCue {
  const [stage, setStage] = useState<Stage>("idle");
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(false);
  const startedReady = useRef(false);
  const intent = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scope = useRef(options.scope);
  const reset = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    active.current = false;
    intent.current = null;
    setStage("idle");
  }, []);
  useEffect(() => {
    if (options.disabled || scope.current !== options.scope) reset();
    scope.current = options.scope;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      active.current = false;
      intent.current = null;
    };
  }, [options.scope, options.disabled, reset]);

  useEffect(() => {
    if (!active.current || options.disabled || scope.current !== options.scope)
      return;
    const later = (ms: number, action: () => void): void => {
      timer.current = setTimeout(action, ms);
    };
    const finish = (): void => {
      const proceed = intent.current;
      if (latest.current.canAdvance) {
        reset();
        proceed?.();
      } else {
        intent.current = null;
        setStage("others");
      }
    };
    if (stage === "button") later(380, () => setStage("self"));
    if (stage === "self") {
      later(440, () => {
        if (startedReady.current && !latest.current.ready) reset();
        else if (latest.current.ready) {
          if (startedReady.current) finish();
          else setStage("check");
        } else {
          setStage("waiting");
          if (latest.current.onReady?.(true) === false) reset();
        }
      });
    }
    if (stage === "waiting") {
      if (options.ready) setStage("check");
      else later(8000, reset);
    }
    if (stage === "check") {
      if (!options.ready) reset();
      else later(400, finish);
    }
    if (stage === "others") {
      if (options.canAdvance) reset();
      else later(800, reset);
    }
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [
    stage,
    options.ready,
    options.canAdvance,
    options.scope,
    options.disabled,
    reset,
  ]);

  function request(proceed: (() => void) | null): void {
    if (active.current || options.disabled) return;
    if (options.ready && options.canAdvance && proceed) {
      proceed();
      return;
    }
    startedReady.current = options.ready;
    active.current = true;
    intent.current = proceed;
    setStage(proceed && !options.ready ? "button" : "self");
  }
  return {
    stage,
    busy: stage !== "idle",
    hideSelfCheck:
      !startedReady.current && ["button", "self", "waiting"].includes(stage),
    request,
  };
}
