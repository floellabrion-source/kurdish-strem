import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'socket-resilience',
            configureServer(server) {
                server.httpServer?.on('clientError', (err: any, socket: any) => {
                    if (err?.code === 'ECONNRESET' || !socket.writable) {
                        return;
                    }
                    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                });
                process.on('uncaughtException', (err: any) => {
                    if (err?.code === 'ECONNRESET' || err?.code === 'EPIPE' || err?.code === 'ECANCELED') {
                        return;
                    }
                    console.error('[Uncaught Exception]', err);
                });
            }
        }
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
                timeout: 0,
                proxyTimeout: 0,
                configure: (proxy) => {
                    proxy.on('error', (err) => {
                        // Suppress ECONNRESET logs caused by aborted video/stream requests
                        if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                            console.error('[Vite Proxy Error]', err.message);
                        }
                    });
                }
            },
            '/uploads': {
                target: 'http://127.0.0.1:3001',
                changeOrigin: true,
                configure: (proxy) => {
                    proxy.on('error', (err) => {
                        if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
                            console.error('[Vite Uploads Proxy Error]', err.message);
                        }
                    });
                }
            }
        }
    }
})
