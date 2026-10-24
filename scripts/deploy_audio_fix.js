const { Client } = require('../server/node_modules/ssh2');
const path = require('path');

const conn = new Client();
conn.on('ready', () => {
    console.log('SSH connection established');
    conn.sftp((err, sftp) => {
        if (err) throw err;

        const files = [
            {
                local: path.join(__dirname, '..', 'client', 'src', 'components', 'DualSrtVideoEditor.tsx'),
                remote: '/var/www/kurdish-stream/client/src/components/DualSrtVideoEditor.tsx'
            },
            {
                local: path.join(__dirname, '..', 'client', 'src', 'components', 'SubtitleAudioWaveform.tsx'),
                remote: '/var/www/kurdish-stream/client/src/components/SubtitleAudioWaveform.tsx'
            }
        ];

        let completed = 0;
        files.forEach(f => {
            sftp.fastPut(f.local, f.remote, (err) => {
                if (err) throw err;
                console.log('Uploaded:', f.remote);
                completed++;
                if (completed === files.length) {
                    // Build client on VPS
                    console.log('Building client on VPS...');
                    conn.exec('cd /var/www/kurdish-stream/client && npm run build', (err, stream) => {
                        if (err) throw err;
                        let out = '';
                        stream.on('data', d => out += d);
                        stream.on('close', (code) => {
                            console.log('Build output:', out);
                            console.log('Build finished with code:', code);
                            conn.end();
                        });
                    });
                }
            });
        });
    });
}).connect({
    host: '77.42.22.139',
    port: 2222,
    username: 'root',
    password: '3sAubnu7EXsW'
});
