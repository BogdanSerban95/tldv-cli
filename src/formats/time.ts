function split(seconds: number): { h: number; m: number; s: number; ms: number } {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalMs = Math.round(safe * 1000);
  return {
    h: Math.floor(totalMs / 3_600_000),
    m: Math.floor((totalMs % 3_600_000) / 60_000),
    s: Math.floor((totalMs % 60_000) / 1000),
    ms: totalMs % 1000,
  };
}

const pad = (value: number, width = 2): string => String(value).padStart(width, "0");

/** `01:02:03` — the timestamp shown inline in txt and md transcripts. */
export function clock(seconds: number): string {
  const { h, m, s } = split(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** `01:02:03,456` — SubRip. */
export function srtTime(seconds: number): string {
  const { h, m, s, ms } = split(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

/** `01:02:03.456` — WebVTT. */
export function vttTime(seconds: number): string {
  const { h, m, s, ms } = split(seconds);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}
