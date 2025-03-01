#!/usr/bin/env node

import http from 'http';

const options: http.RequestOptions = {
  host: 'localhost',
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  path: '/health',
  timeout: 2000
};

const request = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

request.on('error', (err) => {
  console.error('ERROR', err);
  process.exit(1);
});

request.end();
