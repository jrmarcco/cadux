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
    css: {
      modules: {
        // 项目内统一以 camelCase 访问 ( styles.settingsMenu ),
        // 必须开启 camelCase 导出, 否则连字符类名静默失效
        localsConvention: 'camelCaseOnly'
      }
    },
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
    server: {
      proxy: {
        // dev 同源代理: 后端 CORS 预检在鉴权路由被 401 拦截 ( 待后端修复 ), 走代理规避
        '/api': {
          target: 'http://127.0.0.1:10081',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/index.html')
      }
    }
  }
})
