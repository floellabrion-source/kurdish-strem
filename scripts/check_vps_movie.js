const { Client } = require('../server/node_modules/ssh2');
const conn = new Client();
conn.on('ready', () => {
    conn.exec("node -e \"const fs = require('fs'); const ms = JSON.parse(fs.readFileSync('/var/www/kurdish-stream/server/data/movies.json')); const m = ms.find(x => x.id === 'e27c7d36-b2e2-4ad3-8e2a-35df210d99e8'); console.log(m ? { id: m.id, title: m.title, videoUrl: m.videoUrl } : 'not found');\"", (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.on('close', () => {
            console.log('Movie output:', out);
            conn.end();
        });
    });
}).connect({ host: '77.42.22.139', port: 2222, username: 'root', password: '3sAubnu7EXsW' });
