const { Client } = require('../server/node_modules/ssh2');
const conn = new Client();
conn.on('ready', () => {
    conn.exec('nproc; free -m; df -h /', (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.on('close', () => {
            console.log(out);
            conn.end();
        });
    });
}).connect({ host: '77.42.22.139', port: 2222, username: 'root', password: '3sAubnu7EXsW' });
