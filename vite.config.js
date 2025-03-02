import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    server: {
        port: 5173,
        watch: {
            usePolling: true
        }
    },
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html')
            }
        }
    },
    assetsInclude: ['**/*.json'],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@components': resolve(__dirname, './src/components'),
            '@styles': resolve(__dirname, './src/styles'),
            '@js': resolve(__dirname, './src/js'),
            '@data': resolve(__dirname, './data')
        }
    }
});
