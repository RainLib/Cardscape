const rect = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
function complexContour() {
  const outline = Array.from({ length: 128 }, (_, i) => {
    const a = (i * Math.PI * 2) / 128;
    return [400 + 350 * Math.cos(a), 768 + 680 * Math.sin(a)];
  });
  const windows = [250, 500].flatMap((x) =>
    [440, 740, 1040].map((y) => rect(x - 60, y - 65, 120, 130)),
  );
  return {
    outline,
    windows,
    islands: [
      { outline: rect(215, 405, 70, 70), windows: [rect(235, 425, 30, 30)] },
      { outline: rect(850, 600, 140, 300), windows: [] },
    ],
  };
}
module.exports = { rect, complexContour };
