import type { BrowserWindowConstructorOptions } from 'electron';
// Native controls retain OS close confirmation, fullscreen and accessibility.
export function windowChromeOptions(
  platform: NodeJS.Platform,
): BrowserWindowConstructorOptions {
  return platform === 'darwin'
    ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
    : {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: '#262626',
          symbolColor: '#d8d8d8',
          height: 40,
        },
      };
}
