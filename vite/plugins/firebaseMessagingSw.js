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
    'const messaging = firebase.messaging();',
    'messaging.onBackgroundMessage((payload) => {',
    "  const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || 'Il Tour di Paolo';",
    "  const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || '';",
    "  return self.registration.showNotification(title, { body, icon: '/p-icon-512.png', data: payload.data || {} });",
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
