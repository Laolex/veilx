// Lightweight client-side stage timing for the unwrap pipeline.
//
// Pure console output — no network, no backend, no PII. The goal is that a few
// real unwraps produce the "where are users actually waiting" table without any
// infrastructure. Promote to a real sink (PostHog, etc.) later if the console
// signal proves useful.

export interface StageMark {
  stage: string;
  /** ms since the timer started. */
  atMs: number;
  /** ms since the previous mark. */
  deltaMs: number;
}

export class StageTimer {
  private readonly label: string;
  private readonly start: number;
  private last: number;
  private readonly marks: StageMark[] = [];

  constructor(label: string) {
    this.label = label;
    this.start = performance.now();
    this.last = this.start;
  }

  /** Record a stage transition; logs `atMs` (since start) and `deltaMs` (since previous). */
  mark(stage: string, extra?: Record<string, unknown>): StageMark {
    const now = performance.now();
    const m: StageMark = {
      stage,
      atMs: Math.round(now - this.start),
      deltaMs: Math.round(now - this.last),
    };
    this.last = now;
    this.marks.push(m);
    console.info(`[VeilX][${this.label}] ${stage}`, { atMs: m.atMs, deltaMs: m.deltaMs, ...(extra ?? {}) });
    return m;
  }

  /** Print the full stage table — call once on success or failure. */
  summary(outcome: "completed" | "failed", extra?: Record<string, unknown>): { totalMs: number; marks: StageMark[] } {
    const totalMs = Math.round(performance.now() - this.start);
    console.info(`[VeilX][${this.label}] ${outcome} in ${totalMs}ms`, extra ?? {});
    if (typeof console.table === "function") console.table(this.marks);
    return { totalMs, marks: this.marks };
  }
}
