const { Client } = require('../server/node_modules/ssh2');
const conn = new Client();
conn.on('ready', () => {
    conn.exec("ffmpeg -f lavfi -i testsrc=duration=10:size=1920x1080:rate=24 -vf scale=w=-2:h=360 -c:v libx264 -preset ultrafast -b:v 600k -f null - 2>&1 | grep -o 'speed=[0-9.]*x'", (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.on('close', () => {
            console.log('Speed output 360p:', out.trim().split('\n').pop());
            conn.end();
        });
    });
}).connect({ host: '77.42.22.139', port: 2222, username: 'root', password: '3sAubnu7EXsW' });
