import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

export default function Player() {
    const [volume, setVolume] = useState(20);
    const [playing, setPlaying] = useState(false);
    const AudioContext = useRef(undefined);
    const audioContextRef = useRef(undefined);
    const modGainRef = useRef(undefined);
    const audioStackRef = useRef([]);
    const numOfChannels = useRef(1);
    const bitDepth = useRef(16);
    const sampleRate = useRef(16000);
    const wavHeaderSize = useRef(44);
    const packetsPerSec = useRef(10);

    useEffect(() => {
        AudioContext.current = window.AudioContext || window.webkitAudioContext;
    }, []);

    useEffect(() => {
        let modGain = modGainRef.current;
        if (modGain && modGain.gain) {
            modGain.gain.value = volume / 100;
        }
    }, [volume]);

    function getBufferSize() {
        return (sampleRate.current / packetsPerSec.current) * (bitDepth.current / 8) * numOfChannels.current + wavHeaderSize.current;
    }

    function readSoundStream(audioContext, bypasser, modGain) {
        let audioStack = audioStackRef.current;
        audioContext.resume();
        let nextTime = 0;

        fetch('http://localhost:8090/api/stream/data').then((response) => {
            // Get ReadableStreamDefaultReader from ReadableStream of response body
            let reader = response.body.getReader();

            // Buffered WAV data processing with Audio API.
            // Reference: 
            // https://gist.github.com/hillct/b1b993470f0294e818c52df730448fa2#file-create-wav-from-buffer-js
            async function read() {
                // Get next chunk in the stream's internal queue and
                // a flag to identify whether there exists a data in queue.
                const { value, done } = await reader.read();
                if (value && value.buffer) {
                    // Get ArrayBuffer within chunked response.
                    let dataBuffer = value.buffer;
                    // Only process data buffers with expected buffer size
                    // to avoid distortion.  
                    if (dataBuffer.byteLength === getBufferSize()) {
                        // Decode audio data from chunked response data
                        // and push that onto stack.  
                        audioContext.decodeAudioData(dataBuffer, (audioBuffer) => {
                            audioStack.push(audioBuffer);
                            // When stack started to fill, process audio data stack
                            if (audioStack.length) {
                                processAudioBuffer();
                            }
                        });
                    }

                    if (done) {
                        // Stream's internal queue is empty. Stop reading.
                        return;
                    }

                    // Process next data chunk. 
                    read();
                }
            }

            // Start processing ReadableStream of fetch API response.
            read();
        });

        function processAudioBuffer() {
            // Process stack until it is emptied.
            while (audioStack.length) {
                // Get and remove first chunk from stack.
                let buffer = audioStack.shift();
                // Create source node of AudioContext
                let source = audioContext.createBufferSource();
                // Set decoded audio buffer data as source node buffer
                // to inform browser with the media asset to be played.
                source.buffer = buffer;
                // Establish audio graph 
                source.connect(modGain)
                    .connect(bypasser)
                    .connect(audioContext.destination);
                if (nextTime == 0)
                    // Add 250ms latency to work well across systems.
                    // Tune this appropriately for your need.
                    nextTime = audioContext.currentTime + 0.5;
                // Start playing  
                source.start(nextTime);
                // Make the next buffer wait the length of the 
                // last buffer before being played 
                nextTime += source.buffer.duration;
            };
        }
    }

    function startSoundStream(audioContext, bypasser, modGain) {
        fetch('http://localhost:8090/api/stream/start').then(() => {
            readSoundStream(audioContext, bypasser, modGain);
        }, (err) => console.error(err));
    }

    function stopSoundStream() {
        fetch('http://localhost:8090/api/stream/stop').then(() => {
            let audioContext = audioContextRef.current;
            audioContext.suspend();
            audioStackRef.current = [];
        }, (err) => console.error(err));
    }

    async function play() {
        audioContextRef.current = new AudioContext.current({ sampleRate: sampleRate.current });
        let audioContext = audioContextRef.current;
        // Load custom audio processing script. Should be able to be loaded via [Base URL]/bypass-processor.js
        await audioContext.audioWorklet.addModule('bypass-processor.js');
        // Initiate AudioWorkletNode to bridge the worklet with app
        let bypasser = new AudioWorkletNode(audioContext, 'bypass-processor');
        modGainRef.current = new GainNode(audioContext);
        let modGain = modGainRef.current;
        if (modGain && modGain.gain) {
            modGain.gain.value = volume / 100;
        }
        setPlaying(true);
        startSoundStream(audioContext, bypasser, modGain);
    }

    function stop() {
        setPlaying(false);
        stopSoundStream(audioStackRef);
    }

    return (
        <div>
            <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4" data-bs-theme="dark">
                <div className="container-fluid">
                    <a className="navbar-brand" href="#">Sound Player</a>
                </div>
            </nav>
            <main className="container">
                <div className="bg-light p-5 rounded">
                    <h1>Player</h1>
                    <p className="lead">This player uses <Link href="https://developer.chrome.com/blog/audio-worklet/" target="_blank">AudioWorklet</Link> to play streaming PCM sound data.</p>
                    <div className="row">
                        <div className="col-auto">
                            <button type="button" className="btn btn-primary btn-lg" onClick={play} disabled={playing}><i className="bi bi-play-fill"></i>&nbsp;Play</button>
                        </div>
                        <div className="col-auto">
                            <button type="button" className="btn btn-secondary btn-lg" onClick={stop} disabled={!playing}><i className="bi bi-stop-fill"></i>&nbsp;Stop</button>
                        </div>
                    </div>
                    <div className="row">
                        <div className="form mt-4">
                            <label htmlFor="volumeRange" className="col-sm-2 col-form-label col-form-label-lg">Volume: {volume}</label>
                            <input type="range" className="form-range" min="0" max="100" defaultValue="20" onChange={(event) => setVolume(event.target.value)} step="1" id="volumeRange"></input>
                        </div>
                    </div>
                </div>
            </main >
        </div >
    );
}
