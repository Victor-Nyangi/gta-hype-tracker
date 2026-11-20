"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * A per-card error boundary: if one card throws while rendering (say a source arrives in a
 * shape the adapter did not expect), that card says so and the rest of the page carries on.
 */
export class CardBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.name} card failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="status" className="flex min-h-[120px] flex-col justify-center gap-1.5">
        <p className="m-0 text-[13px] font-bold text-fg-2">{this.props.name}</p>
        <p className="m-0 text-sm text-fg-3">This signal is unavailable right now. The rest of the page is unaffected.</p>
      </div>
    );
  }
}

/** What a card shows when its source is missing from both the live data and the fallback. */
export function Unavailable({ name }: { name: string }) {
  return (
    <div role="status" className="flex min-h-[120px] flex-col justify-center gap-1.5">
      <p className="m-0 text-[13px] font-bold text-fg-2">{name}</p>
      <p className="m-0 text-sm text-fg-3">No data from this source yet.</p>
    </div>
  );
}
