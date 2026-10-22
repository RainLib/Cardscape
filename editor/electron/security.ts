/** Only electron-vite's loopback development server can replace the app origin. */
export function rendererLocations(value: string | undefined): { editor: string; splash: string } {
  if (!value) return { editor: 'atelier://app/index.html', splash: 'atelier://app/splash.html' };
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw Error('Electron development URL must use a loopback HTTP origin');
  }
  return { editor: new URL('/index.html', url).href, splash: new URL('/splash.html', url).href };
}
