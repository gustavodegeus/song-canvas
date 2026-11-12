`tone.mp3` is an original, generated test tone: 2 seconds of a 440 Hz sine wave, mono, created with FFmpeg.wasm 0.12.10 using:

```
-f lavfi -i sine=frequency=440:duration=2 -c:a libmp3lame tone.mp3
```

It contains no third-party music. Used for real browser encoding, playback, duration, download, and upload-protocol tests. It is not a ten-minute performance benchmark.
