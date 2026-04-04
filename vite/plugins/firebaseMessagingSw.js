import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

/** Keep in sync with the `firebase` package version in package.json (compat CDN scripts). */
const FIREBASE_JS_VERSION = '12.11.0'

function buildSwSource(env) {
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY || '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: env.VITE_FIREBASE_APP_ID || '',
  }
  if (!config.apiKey || !config.projectId || !config.appId) {
    return "console.warn('[Il Tour] firebase-messaging-sw.js: set VITE_FIREBASE_* in .env — FCM service worker inactive');\n"
  }
  const json = JSON.stringify(config)
  return [
    `importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-app-compat.js');`,
    `importScripts('https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-messaging-compat.js');`,
    `firebase.initializeApp(${json});`,
    'var messaging = firebase.messaging();',
    '// Default notification still comes from FCM (do not call showNotification here — duplicates).',
    '// iOS PWA badge: page JS may not run when push arrives; set badge in SW when data present.',
    'messaging.onBackgroundMessage(function (payload) {',
    '  var d = payload.data || {};',
    '  if (d.kind !== "new_pending_submission" || d.ownerPendingBadge == null) return;',
    '  var nav = self.navigator;',
    '  if (!nav || typeof nav.setAppBadge !== "function") return;',
    '  var num = parseInt(String(d.ownerPendingBadge), 10);',
    '  if (isNaN(num) || num <= 0) return;',
    '  nav.setAppBadge(num).catch(function () {});',
    '});',
  ].join('\n')
}

/**
 * Serves and emits `firebase-messaging-sw.js` with the same web config as the Vite app
 * (FCM expects this file at the origin root).
 */
export function firebaseMessagingSwPlugin() {
  let root = process.cwd()
  let outDir = 'dist'
  let cachedEnv = {}

  return {
    name: 'firebase-messaging-sw',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
      cachedEnv = loadEnv(config.mode, root, '')
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/firebase-messaging-sw.js') {
          next()
          return
        }
        const body = buildSwSource({ ...process.env, ...cachedEnv })
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.setHeader('Service-Worker-Allowed', '/')
        res.end(body)
      })
    },
    closeBundle() {
      const body = buildSwSource({ ...process.env, ...cachedEnv })
      const dest = path.resolve(root, outDir, 'firebase-messaging-sw.js')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, body, 'utf8')
    },
  }
}
