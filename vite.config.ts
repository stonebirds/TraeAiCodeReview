import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const base = process.env.BASE_PATH || '/TraeAiCodeReview/'

export default defineConfig({
  base,
  plugins: [react()],
})
