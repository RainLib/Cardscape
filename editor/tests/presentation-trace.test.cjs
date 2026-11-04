const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  analyzePresentationTrace: analyze,
} = require('../scripts/presentation-trace-model.mts');
const event = (name, ts, pid = 3, tid = 4) => ({ name, ts, pid, tid });
test('presentation analysis uses feedback within renderer markers and excludes loading, teardown and duplicate timestamps', () => {
  const trace = {
    traceEvents: [
      event('case:start', 1e6, 1),
      event('case:end', 2e6, 1),
      ...[0.9, 1, 1.5, 1.5, 1.9, 2, 2.1].map((t) =>
        event('Display::FrameDisplayed', t * 1e6),
      ),
      event('DrawFrame', 1.7e6),
    ],
  };
  const r = analyze(trace, 'case', 1);
  assert.equal(r.available, true);
  assert.equal(r.feedbackFrames, 3);
  assert.equal(r.duplicates, 1);
  assert.equal(r.feedbackFps, 3);
  assert.equal(r.intervalMs.p95, 500);
  assert.equal(r.hardwarePresentationVerified, false);
});
test('presentation analysis refuses to aggregate multiple windows or display streams and reports missing feedback', () => {
  const marks = [event('case:start', 1e6, 1), event('case:end', 2e6, 1)];
  assert.equal(analyze({ traceEvents: marks }, 'case', 1).available, false);
  const trace = {
    traceEvents: [
      ...marks,
      event('Display::FrameDisplayed', 1.2e6),
      event('Display::FrameDisplayed', 1.3e6, 7),
    ],
  };
  assert.equal(analyze(trace, 'case', 1).reason, 'ambiguous display streams');
  assert.equal(
    analyze(trace, 'case', 2).reason,
    'multiple application windows',
  );
});
test('presentation windows must have unique ordered marks from the same renderer process', () => {
  assert.throws(() => analyze({}, 'case', 1));
  assert.throws(() =>
    analyze(
      { traceEvents: [event('case:start', 2), event('case:end', 1)] },
      'case',
      1,
    ),
  );
  assert.throws(() =>
    analyze(
      { traceEvents: [event('case:start', 1), event('case:end', 2, 8)] },
      'case',
      1,
    ),
  );
  assert.throws(() =>
    analyze(
      {
        traceEvents: [
          event('case:start', 1),
          event('case:start', 1.1),
          event('case:end', 2),
        ],
      },
      'case',
      1,
    ),
  );
});
