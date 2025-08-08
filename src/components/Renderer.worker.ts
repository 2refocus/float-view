import '../lib/webm-writer2.js';
interface WebmWriter2Options {
  fileWriter: FileSystemWritableFileStream;
  codec: 'VP8' | 'VP9';
  width: number;
  height: number;
  frameRate: number;
}
interface WebmWriter2Instance {
  addFrame(chunk: EncodedVideoChunk): void;
  complete(): Promise<void>;
}
declare var WebMWriter: {
  new (options: WebmWriter2Options): WebmWriter2Instance;
};

import { draw } from './Renderer.draw';
import { FPS, WIDTH, HEIGHT, GAP_THRESHOLD_SECS } from './Renderer.common';
import { RowKey, type RowWithIndex } from '../lib/parse/types.js';
import { parse } from '../lib/parse/index.js';

self.postMessage({ type: 'log', message: 'Renderer worker started.' });

let started = false;
let totalFramesGenerated = 0;
let totalFramesToGenerate = 0;
let videos: Video[] = [];

self.addEventListener('message', (e) => {
  if (e.data.type === 'file') {
    self.postMessage({ type: 'log', message: 'Reading input file...' });
    parse(e.data.inputFile).then((result) => {
      self.postMessage({ type: 'log', message: 'Finished reading input file.' });

      // split into segments

      videos.length = 0;

      self.postMessage({ type: 'log', message: 'Scanning CSV for ride segments...' });
      let lastIndex = 0;
      for (let i = 0; i < result.data.length; i++) {
        const prev = result.data[i - 1];
        const data = result.data[i]!;
        // if the time difference is more than 60 seconds, we assume a pause
        if (prev && data[RowKey.Time] - prev[RowKey.Time] > GAP_THRESHOLD_SECS) {
          const slice = result.data.slice(lastIndex, i);
          if (slice.length > 1) {
            self.postMessage({ type: 'log', message: `Detected pause at ${data[RowKey.Time]}s` });
            videos.push(new Video(slice));
          }
          lastIndex = i;
        }
      }

      if (lastIndex < result.data.length) {
        videos.push(new Video(result.data.slice(lastIndex)));
      }

      self.postMessage({ type: 'log', message: `Found ${videos.length} segments.` });
    });
  }

  if (e.data.type === 'start') {
    self.postMessage({ type: 'log', message: 'Reading input file...' });
    if (!videos || videos.length === 0) {
      self.postMessage({ type: 'log', message: 'Error: no data available to render, please load a file.' });
    } else {
      generateVideo(e.data.outputDirectoryHandle, e.data.canvas);
    }
  }

  if (e.data.type === 'update') {
    postUpdateMessage();
  }

  if (e.data.type === 'stop') {
    started = false;
    self.postMessage({ type: 'log', message: 'Stopping video generation...' });
  }
});

function postUpdateMessage() {
  self.postMessage({ type: 'log', message: `Frames rendered: ${totalFramesGenerated}` });
  self.postMessage({ type: 'progress', totalFramesGenerated, totalFramesToGenerate });
}

class Video {
  constructor(public readonly csvData: RowWithIndex[]) {
    if (!Array.isArray(csvData) || csvData.length < 2) {
      throw new Error('Invalid CSV data provided');
    }
  }

  frameCount() {
    const startTime = this.csvData[0]![RowKey.Time];
    const endTime = this.csvData[this.csvData.length - 1]![RowKey.Time];
    const totalSeconds = endTime - startTime;
    return Math.round(totalSeconds * FPS);
  }

  startTime() {
    return this.csvData[0]![RowKey.Time];
  }
}

async function createFileHandle(directoryHandle: FileSystemDirectoryHandle, canvas: OffscreenCanvas, index: number) {
  const name = `myVideo_${index + 1}.webm`;
  const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
  const fileWritableStream = await fileHandle.createWritable();

  return {
    name,
    fileWritableStream,
    webmWriter: new WebMWriter({
      fileWriter: fileWritableStream,
      codec: 'VP8',
      width: canvas.width,
      height: canvas.height,
      frameRate: FPS,
    }),
  };
}

async function generateVideo(directoryHandle: FileSystemDirectoryHandle, canvas: OffscreenCanvas) {
  self.postMessage({ type: 'log', message: 'Setting up canvas...' });

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    self.postMessage({ type: 'fatal', message: 'Failed to get canvas context.' });
    return;
  }

  // create encoder

  self.postMessage({ type: 'log', message: 'Setting up encoder...' });

  const encoderConfig: VideoEncoderConfig = {
    codec: 'vp8',
    width: canvas.width,
    height: canvas.height,
    bitrate: 2_000_000,
    framerate: FPS,
  };

  const { supported } = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!supported) {
    self.postMessage({
      type: 'fatal',
      message: `The chosen options are not supported: ${JSON.stringify(encoderConfig, null, 2)}`,
    });
    return;
  }

  let currentWriter: Awaited<ReturnType<typeof createFileHandle>>;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      currentWriter.webmWriter.addFrame(chunk);
    },
    error: (e) => {
      self.postMessage({ type: 'log', message: `Encoder error: ${e.message}` });
    },
  });
  encoder.configure(encoderConfig);

  // render frames

  self.postMessage({ type: 'log', message: 'Beginning render...' });

  totalFramesGenerated = 0;
  totalFramesToGenerate = videos.reduce((sum, video) => sum + video.frameCount(), 0);
  const start = performance.now();
  const frameDurationMicros = 1_000_000 / FPS;

  started = true;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i]!;
    currentWriter = await createFileHandle(directoryHandle, canvas, i);
    self.postMessage({
      type: 'log',
      message: `Rendering segment ${i + 1} (${video.frameCount()} frames) into ${currentWriter.name}...`,
    });

    let frameNumber = 0;
    const startTime = video.startTime();
    for (let j = 0; j < video.csvData.length; j++) {
      const data = video.csvData[j]!;
      const timeMicros = (data[RowKey.Time] - startTime) * 1_000_000;

      // render frame
      draw(canvas, ctx, data);

      // encode frames until time is reached
      while (true) {
        if (!started) {
          return;
        }

        // render as fast as the encoder can handle (otherwise we'll OOM by generating too many frames)
        while (encoder.encodeQueueSize > FPS * 10) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const frameTime = Math.round(frameNumber * frameDurationMicros);
        const frame = new VideoFrame(canvas, { timestamp: frameTime });
        encoder.encode(frame, { keyFrame: frameNumber % FPS === 0 });
        frame.close();

        frameNumber++;
        totalFramesGenerated++;

        if (frameTime >= timeMicros) {
          break;
        }
      }
    }

    await encoder.flush();
    await currentWriter.webmWriter.complete();
    await currentWriter.fileWritableStream.close();
  }

  encoder.close();

  const duration = performance.now() - start;
  self.postMessage({
    type: 'log',
    message: `Rendered ${totalFramesGenerated} frames in ${(duration / 1_000 / 60).toFixed(2)} min(s)`,
  });
  self.postMessage({ type: 'log', message: `Average frame time: ${(duration / totalFramesGenerated).toFixed(2)} ms` });

  self.postMessage({ type: 'complete' });
}
