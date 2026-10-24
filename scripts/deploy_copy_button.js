const { Client } = require('../server/node_modules/ssh2');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const localAdmin = path.join(__dirname, '..', 'client', 'src', 'pages', 'Admin.tsx');
        const remoteAdmin = '/var/www/kurdish-stream/client/src/pages/Admin.tsx';

        sftp.fastPut(localAdmin, remoteAdmin, (err) => {
            if (err) throw err;
            console.log('Admin.tsx uploaded to VPS.');

            console.log('Building client on VPS...');
            conn.exec('cd /var/www/kurdish-stream/client && npm run build', (err, stream) => {
                if (err) throw err;
                let out = '';
                stream.on('data', d => out += d);
                stream.on('close', (code) => {
                    console.log('Build code:', code);
                    conn.end();
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
