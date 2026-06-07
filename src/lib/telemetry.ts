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

const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export class StageTimer {
  private readonly label: string;
  /** Short run id so interleaved/overlapping runs are attributable in the log. */
  readonly id: string;
  private readonly start: number;
  private last: number;
  private readonly marks: StageMark[] = [];

  constructor(label: string) {
    this.label = label;
    this.id = Math.random().toString(36).slice(2, 6);
    this.start = performance.now();
    this.last = this.start;
  }

  private tag(): string {
    return `[VeilX][${this.label} ${this.id}]`;
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
    console.info(`${this.tag()} ${stage} (+${s(m.deltaMs)})`, { atMs: m.atMs, deltaMs: m.deltaMs, ...(extra ?? {}) });
    return m;
  }

  /**
   * One flat, copy-pasteable summary line — no collapsed objects to expand.
   * e.g. `DONE 108.4s | started +0.0s | encrypt_finished +0.8s | phase2_started +80.1s | …`
   */
  summary(outcome: "completed" | "failed", extra?: Record<string, unknown>): { totalMs: number; marks: StageMark[] } {
    const totalMs = Math.round(performance.now() - this.start);
    const flat = this.marks.map((m) => `${m.stage} +${s(m.deltaMs)}`).join(" | ");
    const verdict = outcome === "completed" ? "DONE" : "FAIL";
    console.info(`${this.tag()} ${verdict} ${s(totalMs)} | ${flat}`, extra ?? {});
    return { totalMs, marks: this.marks };
  }
}
