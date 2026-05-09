import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

function stripConsole(): Plugin {
  return {
    name: 'strip-console',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.match(/\.(ts|tsx|js|jsx)$/)) return null
      if (id.includes('node_modules')) return null
      if (!/console\.(log|debug|info)\s*\(/.test(code)) return null

      let result = ''
      let i = 0
      while (i < code.length) {
        const match = code.slice(i).match(/\bconsole\.(log|debug|info)\s*\(/)
        if (!match || match.index === undefined) {
          result += code.slice(i)
          break
        }
        result += code.slice(i, i + match.index)
        const parenStart = i + match.index + match[0].length
        let depth = 1
        let j = parenStart
        while (j < code.length && depth > 0) {
          if (code[j] === '(') depth++
          else if (code[j] === ')') depth--
          j++
        }
        // Skip optional trailing semicolon
        if (j < code.length && code[j] === ';') j++
        i = j
      }
      return { code: result, map: null }
    },
  }
}

function generateVersionJson(): Plugin {
  return {
    name: 'generate-version-json',
    apply: 'build',
    closeBundle() {
      let sha = process.env.VERCEL_GIT_COMMIT_SHA || ''
      if (!sha) {
        try { sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim() } catch { sha = 'unknown' }
      }
      writeFileSync(
        path.resolve(__dirname, 'dist/version.json'),
        JSON.stringify({ current: sha, minimum: sha }, null, 2),
      )
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    stripConsole(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'PPA_Favicon.png'],
      manifest: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/sw\.js$/, /^\/manifest\.json$/, /^\/version\.json$/],
        runtimeCaching: [
          {
            urlPattern: /supabase\.co/,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /padelplayersapp\.com\/api/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
    generateVersionJson(),
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? 'wynaxa',
      project: process.env.SENTRY_PROJECT ?? 'javascript-react',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      release: { name: process.env.VERCEL_GIT_COMMIT_SHA },
    })] : []),
  ],
  build: {
    sourcemap: true,
  },
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
