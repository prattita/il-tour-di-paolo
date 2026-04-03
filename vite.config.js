import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { firebaseMessagingSwPlugin } from './vite/plugins/firebaseMessagingSw.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), firebaseMessagingSwPlugin()],
})
