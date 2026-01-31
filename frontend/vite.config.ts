import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 检测是否在 Tauri 环境中运行
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // 清除 Vite 缓存以避免 HMR 问题
  clearScreen: false,
  server: {
    // Tauri 开发模式使用 1420 端口
    port: isTauri ? 1420 : 3000,
    // 严格端口模式，如果端口被占用则失败
    strictPort: true,
    proxy: {
      '/api': {
        // 统一后端端口：3620
        target: 'http://localhost:3620',
        changeOrigin: true,
      },
    },
  },
  // 生产构建配置
  build: {
    // Tauri 构建输出目录
    outDir: 'dist',
    // 生成 sourcemap 便于调试
    sourcemap: process.env.NODE_ENV !== 'production',
    // 代码分割配置
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Markdown 渲染
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          // 代码高亮
          'vendor-highlight': ['react-syntax-highlighter'],
          // Excel 处理
          'vendor-xlsx': ['xlsx'],
          // 流程图
          'vendor-xyflow': ['@xyflow/react'],
        },
      },
    },
    // 提高 chunk 大小警告阈值
    chunkSizeWarningLimit: 600,
  },
  // 环境变量前缀
  envPrefix: ['VITE_', 'TAURI_'],
})
