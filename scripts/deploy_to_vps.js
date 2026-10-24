const { Client } = require('../server/node_modules/ssh2');
const fs = require('fs');
const path = require('path');

const conn = new Client();

conn.on('ready', () => {
    console.log('SSH connection established');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const localServerIndex = path.join(__dirname, '..', 'server', 'index.js');
        const remoteServerIndex = '/var/www/kurdish-stream/server/index.js';

        console.log('Uploading server/index.js...');
        sftp.fastPut(localServerIndex, remoteServerIndex, (err) => {
            if (err) throw err;
            console.log('server/index.js uploaded successfully');

            // Restart PM2
            conn.exec('pm2 restart kurdish-stream-api', (err, stream) => {
                if (err) throw err;
                let out = '';
                stream.on('data', d => out += d);
                stream.on('close', (code) => {
                    console.log('PM2 restart code:', code);
                    console.log(out);
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
