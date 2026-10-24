const fs = require('fs');
const path = require('path');
const dotenv = require('../server/node_modules/dotenv');
const { S3Client, PutObjectCommand } = require('../server/node_modules/@aws-sdk/client-s3');

const envPath = path.join(__dirname, '..', 'server', '.env');
const env = dotenv.parse(fs.readFileSync(envPath));

const client = new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY
    }
});

async function run() {
    const key = `test_probe_${Date.now()}.txt`;
    console.log('Testing upload to bucket:', env.R2_BUCKET, 'key:', key);
    await client.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: 'Kurdish Stream R2 Direct Upload Test OK',
        ContentType: 'text/plain'
    }));
    console.log('UPLOAD SUCCESS! Public URL:', `${env.R2_PUBLIC_URL}/${key}`);
}

run().catch(console.error);
