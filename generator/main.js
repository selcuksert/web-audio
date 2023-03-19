import { Reader } from 'wav';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createConnection } from 'node:net';
import getFileHeaders from 'wav-headers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLE_RATE = 16000
const BIT_DEPTH = 16
const CHANNEL_CNT = 1;
const PACKET_SIZE_PER_SEC_KB = SAMPLE_RATE * (BIT_DEPTH / 8) * CHANNEL_CNT;

const TCP_SRV_PORT = 12345;
const tcpClient = createConnection(TCP_SRV_PORT, 'localhost');

const options = {
  channels: CHANNEL_CNT,
  sampleRate: SAMPLE_RATE,
  bitDepth: BIT_DEPTH,
  dataLength: PACKET_SIZE_PER_SEC_KB/10 * 1000
};

const headersBuffer = getFileHeaders(options);

tcpClient.on('error', function (err) {
  console.error('Error: ', err);
  console.log('Attempting to reconnect in 2 seconds.');
  setTimeout(() => {
    tcpClient.connect(TCP_SRV_PORT);
  }, 2000);
});

tcpClient.on('end', function () {
  console.log('Stream ended.');
  console.log('Attempting to reconnect.');
  tcpClient.destroy();
  tcpClient.connect(TCP_SRV_PORT);
});

tcpClient.on('connect', function (err) {
  console.log('Connected to server.');
});

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

const sendPcmData = () => {
  let file = createReadStream(`${__dirname}/media/Rondo_Alla_Turca.wav`);
  let reader = new Reader();

  // the "format" event gets emitted at the end of the WAVE header
  reader.on('format', function (format) {
    reader.on('readable', async () => {
      let chunk;
      // Use a loop to make sure to read data
      while (null !== (chunk = reader.read(PACKET_SIZE_PER_SEC_KB/10))) {
        let fullBuffer = Buffer.concat([headersBuffer, chunk]);
        if (!tcpClient.destroyed) {
          tcpClient.write(fullBuffer, (err) => {
            if (err) {
              console.error(err.stack)
            }
          });
        }
        await sleep(2000/10);
      }
    });
  });

  file.pipe(reader);
}

sendPcmData();