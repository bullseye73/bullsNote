import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    // 컨텍스트 공유 라이브러리의 중복 복사본 로딩 방지 (blank/SideMenu 오류 예방)
    dedupe: ['react', 'react-dom', '@blocknote/core', '@blocknote/react'],
  },
  server: { port: 5190 },
  build: { outDir: 'dist', emptyOutDir: true },
});
