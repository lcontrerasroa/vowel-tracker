import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ⚠️ Remplacez "vowel-space-tracker" par le nom exact de votre repo GitHub
  base: '/vowel-space-tracker/',
})
