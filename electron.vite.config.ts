import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: 'src',
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
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
