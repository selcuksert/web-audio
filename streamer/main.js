import express from 'express';
import { createServer } from 'node:net';
import moment from 'moment';
import Stream from 'stream';
import cors from 'cors';

var corsOptions = {
    origin: 'http://localhost:3000',
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
const WEB_APP_PORT = 8090;
const webApp = express();
webApp.use(cors(corsOptions));

const TCP_SRV_PORT = 12345;
const tcpServer = createServer();

let readableStream = Stream.Readable();
readableStream._read = () => { }

const SAMPLE_RATE = 16000
const BIT_DEPTH = 16
const CHANNEL_CNT = 1;
const PACKET_CNT_PER_SEC = 10;
const WAV_HDR_SIZE = 44;
const PACKET_SIZE = (SAMPLE_RATE * (BIT_DEPTH / 8) * CHANNEL_CNT) / PACKET_CNT_PER_SEC + WAV_HDR_SIZE;

tcpServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error('Address in use');
    }
    else {
        console.error(e);
    }
});

tcpServer.on('connection', (connection) => {
    let remoteAddress = connection.remoteAddress + ':' + connection.remotePort;
    console.log('new client connection from %s', remoteAddress);

    connection.on('data', (data) => {
        if (!readableStream.isPaused() && data.length === PACKET_SIZE) {
            console.log(`[${moment().format("hh:mm:ss")}] Streaming ${data.length} bytes`);
            readableStream.push(data);
        }
    });

    connection.once('close', () => {
        readableStream.pause();
        console.log('connection from %s closed', remoteAddress);
    });

    connection.on('error', (err) => {
        readableStream.pause();
        console.log('Connection %s error: %s', remoteAddress, err.message);
    });
});

webApp.get('/api/stream/start', (req, res) => {
    res.setHeader('Content-Type', 'audio/wav');
    readableStream.resume();
    res.status(200).send('started');
});

webApp.get('/api/stream/data', (req, res) => {
    res.setHeader('Content-Type', 'audio/wav');
    if (!readableStream.isPaused()) {
        readableStream.pipe(res);
    }
});

webApp.get('/api/stream/stop', (req, res) => {
    readableStream.push(null);
    readableStream = Stream.Readable();
    readableStream._read = () => { }
    readableStream.pause();
    res.status(200).send('stopped');
});

tcpServer.listen(TCP_SRV_PORT, () => {
    let address = tcpServer.address();
    console.log(`Streamer TCP server listening on port ${address.port}`);
});

webApp.listen(WEB_APP_PORT, () => {
    console.log(`Streamer Web app listening on port ${WEB_APP_PORT}`)
})

