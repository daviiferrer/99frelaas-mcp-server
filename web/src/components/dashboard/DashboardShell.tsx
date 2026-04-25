import { useEffect, useRef, type PropsWithChildren } from "react";

import { dashboardTokens } from "../../theme/tokens";

type OpenAIHeightBridge = {
  notifyIntrinsicHeight?: (height: number) => void | Promise<void>;
};

function getOpenAIHeightBridge(): OpenAIHeightBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { openai?: OpenAIHeightBridge }).openai;
}

function notifyIntrinsicHeight(height: number): void {
  const bridge = getOpenAIHeightBridge();
  if (typeof bridge?.notifyIntrinsicHeight !== "function") return;

  void bridge.notifyIntrinsicHeight(height);
}

export function DashboardShell({ children }: PropsWithChildren): JSX.Element {
  const shellRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof window === "undefined") return;

    let frameId = 0;
    const syncHeight = (): void => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        notifyIntrinsicHeight(Math.ceil(shell.scrollHeight));
      });
    };

    syncHeight();

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(syncHeight);
    resizeObserver?.observe(shell);
    window.addEventListener("resize", syncHeight, { passive: true });
    window.addEventListener("load", syncHeight, { passive: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncHeight);
      window.removeEventListener("load", syncHeight);
    };
  }, []);

  return (
    <main
      ref={shellRef}
      style={{
        width: "100%",
        background: dashboardTokens.color.pageBackground,
        border: `1px solid ${dashboardTokens.color.borderSubtle}`,
        borderRadius: dashboardTokens.radius.card,
        padding: "clamp(8px, 2.2vw, 16px) clamp(8px, 2.4vw, 20px)",
        boxSizing: "border-box",
        overflow: "visible",
        fontFamily: dashboardTokens.font.body,
        color: dashboardTokens.color.textPrimary,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1120,
          margin: "0 auto",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: dashboardTokens.spacing.lg,
        }}
      >
        {children}
      </div>
    </main>
  );
}
