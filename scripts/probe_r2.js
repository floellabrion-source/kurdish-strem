const { Client } = require('../server/node_modules/ssh2');
const conn = new Client();
conn.on('ready', () => {
    const cmd = "ffprobe -v error -show_entries stream=codec_name,codec_type,channels,channel_layout,sample_rate,bit_rate -of json 'https://pub-b0d449d8e91a4935b983f479c22d8796.r2.dev/videos/e27c7d36-b2e2-4ad3-8e2a-35df210d99e8_1792879846302_Housebound.2014.1080p.BluRay.x264.YIFY.mp4'";
    conn.exec(cmd, (err, stream) => {
        let out = '';
        stream.on('data', d => out += d);
        stream.stderr.on('data', d => out += d);
        stream.on('close', () => {
            console.log(out);
            conn.end();
        });
    });
}).connect({ host: '77.42.22.139', port: 2222, username: 'root', password: '3sAubnu7EXsW' });
