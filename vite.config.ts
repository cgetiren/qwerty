import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

function safeCopyPublicPlugin() {
  return {
    name: 'safe-copy-public',
    closeBundle() {
      const root = process.cwd();
      const publicDir = path.resolve(root, 'public');
      const distDir = path.resolve(root, 'dist');
      if (!fs.existsSync(publicDir)) return;
      const files = fs.readdirSync(publicDir);
      for (const file of files) {
        const src = path.join(publicDir, file);
        const dest = path.join(distDir, file);
        try {
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        } catch {
          // skip files that cannot be copied
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), safeCopyPublicPlugin()],
  build: {
    copyPublicDir: false,
  },
});
