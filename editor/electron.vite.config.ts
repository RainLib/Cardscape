import { defineConfig } from 'electron-vite';
import { resolve, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import type { Plugin } from 'vite';
import { compileRuntimeFile } from './build/compile-runtime.mts';

function mainRuntimeWatch(): Plugin {
  const root = resolve('.');
  return {
    name: 'cardscape-main-runtime-watch',
    buildStart() {
      for (const name of readdirSync(resolve(root, 'electron'))) if (name.endsWith('.ts')) this.addWatchFile(resolve(root, 'electron', name));
      for (const name of readdirSync(resolve(root, 'renderer'), { recursive: true })) {
        if (typeof name === 'string' && /(?:model|stats|shortcuts|particle-batch|mesh-rigidity|export-profile)\.ts$/.test(name)) this.addWatchFile(resolve(root, 'renderer', name));
      }
    },
    async watchChange(file) {
      const local = relative(root, resolve(file));
      if (file.endsWith('.ts') && local.startsWith('electron' + sep) && !['main.ts', 'preload.ts'].includes(relative(resolve(root, 'electron'), file))) {
        await compileRuntimeFile(root, 'electron', relative(resolve(root, 'electron'), file));
      }
      if (file.endsWith('.ts') && local.startsWith('renderer' + sep)) {
        await compileRuntimeFile(root, 'renderer', relative(resolve(root, 'renderer'), file));
      }
    }
  };
}

// Keep the portable HTML and ordered classic-script contract usable by exports.
// The desktop build replaces its many script requests with Vite's module graph.
function editorEntry(): Plugin {
  return {
    name: 'cardscape-editor-entry',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        if (!context.filename.endsWith('index.html')) return html;
        let result = html.replace(/<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g, '');
        result = result.replace(/<link\b[^>]*href="shader-nodes\.bundle\.css"[^>]*>/g, '');
        result = result.replace('</head>', '<script type="module" src="/editor-entry.ts"></script></head>');
        if (context.server) result = result.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
        return result;
      }
    }
  };
}

function developmentRuntime(): Plugin {
  return {
    name: 'cardscape-development-runtime',
    configureServer(server) {
      const sourceRoot = resolve('renderer');
      server.watcher.on('change', async file => {
        const local = relative(resolve('.'), resolve(file));
        if (!file.endsWith('.ts') || !local.startsWith('renderer' + sep)) return;
        try {
          await compileRuntimeFile(resolve('.'), 'renderer', relative(sourceRoot, file));
          server.ws.send({ type: 'full-reload' });
        } catch (error) { server.config.logger.error(String(error)); }
      });
      // Sandboxed preload pages and classic workers consume the compatibility build.
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (!pathname.endsWith('.js')) return next();
        const root = resolve('dist/renderer');
        const file = resolve(root, '.' + pathname);
        if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) return next();
        try {
          const bytes = await readFile(file);
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          response.end(bytes);
        } catch { next(); }
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        return context.server
          ? html.replaceAll('__ATELIER_STYLE_NONCE__', randomBytes(24).toString('base64')).replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")
          : html;
      }
    }
  };
}

export default defineConfig({
  main: {
    plugins: [mainRuntimeWatch()],
    build: {
      outDir: 'dist/electron', emptyOutDir: false,
      rollupOptions: { input: resolve('electron/main.ts'), output: { entryFileNames: 'main.cjs' } }
    }
  },
  preload: {
    build: {
      outDir: 'dist/electron', emptyOutDir: false,
      rollupOptions: { input: resolve('electron/preload.ts'), output: { entryFileNames: 'preload.cjs' } }
    }
  },
  renderer: {
    root: resolve('renderer'), base: './', publicDir: false,
    // poly2tri's CommonJS entry captures Node's `global` even in browsers.
    // Match the standalone runtime bundle in both Vite dev and production.
    define: { global: 'globalThis' },
    resolve: { alias: {
      '@cardscape/shader-editor': resolve('renderer/shaders/shader-editor-source.ts'),
      '@cardscape/shader-nodes': resolve('renderer/shaders/shader-nodes-source.ts')
    } },
    html: { cspNonce: '__ATELIER_STYLE_NONCE__' },
    plugins: [editorEntry(), developmentRuntime()],
    // Prebundle lazy vendors before editing starts, so opening a panel never
    // triggers Vite's late-dependency full reload of an unsaved document.
    optimizeDeps: { include: [
      '@codemirror/state', '@codemirror/view', '@codemirror/language',
      '@codemirror/legacy-modes/mode/clike', '@codemirror/autocomplete',
      '@codemirror/commands', '@codemirror/search', '@codemirror/lint',
      '@codemirror/theme-one-dark', 'litegraph.js/build/litegraph.core.js',
      'polyclip-ts', 'clipper2-ts', 'poly2tri'
    ] },
    server: { host: '127.0.0.1', port: 8770, strictPort: true },
    build: {
      outDir: resolve('dist/renderer'), emptyOutDir: false, minify: 'esbuild',
      assetsInlineLimit: 0,
      rollupOptions: {
        input: resolve('renderer/index.html'),
        output: {
          manualChunks(id) {
            if (id.includes('/node_modules/@codemirror/') || id.includes('/node_modules/@lezer/')) return 'shader-editor';
            if (id.includes('/node_modules/litegraph.js/')) return 'shader-graph';
          }
        }
      }
    }
  }
});
