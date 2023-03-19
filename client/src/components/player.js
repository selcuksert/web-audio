import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

export default function Player() {
    const [volume, setVolume] = useState(20);
    const [playing, setPlaying] = useState(false);
    const AudioContext = useRef(undefined);
    const audioContextRef = useRef(undefined);
    const modGainRef = useRef(undefined);
    const audioStackRef = useRef([]);

    useEffect(() => {
        AudioContext.current = window.AudioContext || window.webkitAudioContext;
    }, []);

    useEffect(() => {
        let modGain = modGainRef.current;
        if (modGain && modGain.gain) {
            modGain.gain.value = volume / 100;
        }
    }, [volume]);

    function readSoundStream(audioContext, bypasser, modGain) {
        let audioStack = audioStackRef.current;
        audioContext.resume();
        let nextTime = 0;
        fetch('http://localhost:8090/api/stream/data').then((response) => {
            let reader = response.body.getReader();

            function read() {
                return reader.read().then(({ value, done }) => {
                    if (value && value.buffer) {
                        let dataBuffer = value.buffer;
                        if (dataBuffer.byteLength > 0) {
                            audioContext.decodeAudioData(dataBuffer, (audioBuffer) => {
                                audioStack.push(audioBuffer);
                                if (audioStack.length) {
                                    scheduleBuffers();
                                }
                            }, (err) => { });
                            if (done) {
                                console.log('done');
                                return;
                            }
                        }
                        read();
                    }
                });

            }
            read();
        });

        function scheduleBuffers() {
            while (audioStack.length) {
                var buffer = audioStack.shift();
                var source = audioContext.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContext.destination);
                if (nextTime == 0)
                    nextTime = audioContext.currentTime + 0.5;  /// add 250ms latency to work well across systems - tune this appropriately.
                source.start(nextTime);
                nextTime += source.buffer.duration; // Make the next buffer wait the length of the last buffer before being played
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
            audioStackRef.current = []
        }, (err) => console.error(err));;
    }

    async function play() {
        audioContextRef.current = new AudioContext.current({ sampleRate: 16000 });
        let audioContext = audioContextRef.current;
        await audioContext.audioWorklet.addModule('bypass-processor.js');
        let bypasser = new AudioWorkletNode(audioContext, 'bypass-processor');
        modGainRef.current = new GainNode(audioContext);
        let modGain = modGainRef.current;
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
