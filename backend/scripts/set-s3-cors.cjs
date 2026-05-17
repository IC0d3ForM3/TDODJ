'use strict';
const fs = require('fs'), path = require('path');
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');

const parseEnv = (f) => {
  const v = {};
  fs.readFileSync(f, 'utf8').split('\n').forEach(l => {
    const s = l.replace(/\r$/, '');
    const m = s.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) v[m[1].trim()] = m[2].trim();
  });
  return v;
};

const prodEnv = parseEnv(path.join(__dirname, '..', '.prod.env'));

const s3 = new S3Client({
  region: prodEnv['AWS_REGION'] ?? 'us-east-1',
  credentials: {
    accessKeyId: prodEnv['AWS_ACCESS_KEY_ID'],
    secretAccessKey: prodEnv['AWS_SECRET_ACCESS_KEY'],
  },
});

const BUCKET = prodEnv['S3_USER_CONTENT_BUCKET'];

async function main() {
  console.log(`Setting CORS on bucket: ${BUCKET}`);

  await s3.send(new PutBucketCorsCommand({
    Bucket: BUCKET,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [
            'https://tdodj.com',
            'https://www.tdodj.com',
            'http://localhost:4200',
          ],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['Content-Length', 'Content-Type'],
          MaxAgeSeconds: 86400,
        },
      ],
    },
  }));

  console.log('CORS config set. Verifying...');
  const result = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log(JSON.stringify(result.CORSRules, null, 2));
  console.log('Done.');
}

main().catch(console.error);
