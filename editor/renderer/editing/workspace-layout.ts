const api = (() => {
  'use strict';
  function normalize(input: unknown = {}) {
    const saved =
      input && typeof input === 'object'
        ? (input as Record<string, unknown>)
        : {};
    return {
      view:
        typeof saved.view === 'string' &&
        ['edit', 'split', 'preview', 'space'].includes(saved.view)
          ? saved.view
          : 'split',
      axis: saved.axis === 'columns' ? 'columns' : 'rows',
      ratio:
        typeof saved.ratio === 'number' && Number.isFinite(saved.ratio)
          ? Math.max(25, Math.min(75, saved.ratio))
          : 60,
      lastPreview:
        typeof saved.lastPreview === 'string' &&
        ['split', 'preview', 'space'].includes(saved.lastPreview)
          ? saved.lastPreview
          : 'split',
      effectsEnabled: saved.effectsEnabled !== false,
    };
  }
  function ratioFromPointer(
    axis: string,
    bounds: { width: number; height: number; left: number; top: number },
    x: number,
    y: number,
  ) {
    const length = axis === 'rows' ? bounds.height : bounds.width;
    if (length <= 0) return 60;
    return Math.max(
      25,
      Math.min(
        75,
        Math.round(
          ((axis === 'rows' ? y - bounds.top : x - bounds.left) / length) * 100,
        ),
      ),
    );
  }
  return { normalize, ratioFromPointer };
})();

export default api;
