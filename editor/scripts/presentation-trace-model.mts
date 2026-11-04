interface TraceEvent {
  name: string;
  ts: number;
  pid: number;
  tid: number;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** Chromium feedback timestamps are distinct from JS submissions. The trace
 * event omits hardware/vsync flags, so this cannot certify physical scanout. */
export function analyzePresentationTrace(
  value: unknown,
  tag: string,
  windowCount: number,
) {
  if (!record(value) || !Array.isArray(value.traceEvents))
    throw Error('Invalid presentation trace');
  const events = value.traceEvents.filter(
    (e): e is TraceEvent =>
      record(e) &&
      typeof e.name === 'string' &&
      typeof e.ts === 'number' &&
      Number.isFinite(e.ts) &&
      typeof e.pid === 'number' &&
      typeof e.tid === 'number',
  );
  const starts = events.filter((e) => e.name === tag + ':start'),
    ends = events.filter((e) => e.name === tag + ':end');
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    starts[0].pid !== ends[0].pid ||
    ends[0].ts <= starts[0].ts
  )
    throw Error(
      'Presentation markers must identify one ordered renderer window',
    );
  const start = starts[0].ts,
    end = ends[0].ts,
    seconds = (end - start) / 1e6;
  const groups = new Map<string, TraceEvent[]>();
  for (const event of events)
    if (
      event.name === 'Display::FrameDisplayed' &&
      event.ts >= start &&
      event.ts < end
    ) {
      const key = event.pid + ':' + event.tid;
      const group = groups.get(key) || [];
      group.push(event);
      groups.set(key, group);
    }
  const scope =
    'Chromium Display::FrameDisplayed feedback in the marked steady window. Hardware/vsync feedback flags are not exposed; not OS ETW, physical scanout or input latency.';
  if (windowCount !== 1 || groups.size !== 1)
    return {
      available: false,
      reason:
        windowCount !== 1
          ? 'multiple application windows'
          : groups.size
            ? 'ambiguous display streams'
            : 'no feedback in steady window',
      seconds,
      scope,
      streams: [...groups].map(([id, values]) => ({
        id,
        count: values.length,
      })),
    };
  const [stream, raw] = [...groups][0],
    times = [...new Set(raw.map((e) => e.ts))].sort((a, b) => a - b),
    intervals = times
      .slice(1)
      .map((t, i) => (t - times[i]) / 1000)
      .sort((a, b) => a - b);
  return {
    available: times.length > 1,
    seconds,
    scope,
    stream,
    feedbackFrames: times.length,
    duplicates: raw.length - times.length,
    feedbackFps: times.length / seconds,
    intervalMs: {
      p50: intervals[Math.floor(intervals.length * 0.5)] || 0,
      p95: intervals[Math.floor(intervals.length * 0.95)] || 0,
      max: intervals.at(-1) || 0,
    },
    hardwarePresentationVerified: false,
  };
}
