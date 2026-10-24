const { Client } = require('../server/node_modules/ssh2');
const path = require('path');

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH connection established');
    conn.sftp((err, sftp) => {
        if (err) {
            console.error('SFTP error:', err);
            conn.end();
            return;
        }

        const localServerIndex = path.join(__dirname, '..', 'server', 'index.js');
        const remoteServerIndex = '/var/www/kurdish-stream/server/index.js';

        const localAdmin = path.join(__dirname, '..', 'client', 'src', 'pages', 'Admin.tsx');
        const remoteAdmin = '/var/www/kurdish-stream/client/src/pages/Admin.tsx';

        console.log('Uploading server/index.js...');
        sftp.fastPut(localServerIndex, remoteServerIndex, (err) => {
            if (err) {
                console.error('Upload server/index.js failed:', err);
                conn.end();
                return;
            }
            console.log('server/index.js uploaded.');

            console.log('Uploading client/src/pages/Admin.tsx...');
            sftp.fastPut(localAdmin, remoteAdmin, (err) => {
                if (err) {
                    console.error('Upload Admin.tsx failed:', err);
                    conn.end();
                    return;
                }
                console.log('Admin.tsx uploaded.');

                // Rebuild client and restart pm2
                const cmd = 'cd /var/www/kurdish-stream/client && npm run build && pm2 restart kurdish-stream-api';
                console.log('Executing build & restart on VPS...');
                conn.exec(cmd, (err, stream) => {
                    if (err) {
                        console.error('Exec error:', err);
                        conn.end();
                        return;
                    }
                    let out = '';
                    stream.on('data', d => {
                        out += d;
                        process.stdout.write(d);
                    });
                    stream.stderr.on('data', d => process.stderr.write(d));
                    stream.on('close', (code) => {
                        console.log('\nCommand finished with exit code:', code);
                        conn.end();
                    });
                });
            });
        });
    });
}).connect({
    host: '77.42.22.139',
    port: 2222,
    username: 'root',
    password: '3sAubnu7EXsW'
});
