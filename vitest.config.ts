import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@features': resolve(__dirname, 'src/features'),
      '@entities': resolve(__dirname, 'src/entities'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@assets': resolve(__dirname, 'src/assets')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node'
  }
})
