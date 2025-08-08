this.importScripts('/draw.js', '/webm-writer2.js', '/node_modules/papaparse/papaparse.min.js');

this.addEventListener('message', (e) => {
  if (e.data.type === 'start') {
    this.postMessage({ type: 'log', message: 'Reading CSV...' });
    Papa.parse(e.data.inputFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        this.postMessage({ type: 'log', message: 'Finished reading CSV.' });
        generateVideo(e.data.outputDirectoryHandle, e.data.canvas, results.data);
      },
    });
  }

  if (e.data.type === 'update') {
    postUpdateMessage();
  }

  if (e.data.type === 'stop') {
    started = false;
    this.postMessage({ type: 'log', message: 'Stopping video generation...' });
  }
});

const FPS = 60;
const WIDTH = 640;
const HEIGHT = 480;
const GAP_THRESHOLD_SECS = 60;

let started = false;
let totalFramesGenerated = 0;
let totalFramesToGenerate = 0;

function postUpdateMessage() {
  this.postMessage({ type: 'log', message: `Frames rendered: ${totalFramesGenerated}` });
  this.postMessage({ type: 'progress', totalFramesGenerated, totalFramesToGenerate });
}

class Video {
  /**
   * @param {any[]} csvData
   */
  constructor(csvData) {
    if (!Array.isArray(csvData) || csvData.length < 2) {
      throw new Error('Invalid CSV data provided');
    }

    this.csvData = csvData;
  }

  frameCount() {
    const startTime = this.csvData[0]['Time(s)'];
    const endTime = this.csvData[this.csvData.length - 1]['Time(s)'];
    const totalSeconds = endTime - startTime;
    return Math.round(totalSeconds * FPS);
  }

  startTime() {
    return this.csvData[0]['Time(s)'];
  }
}

/**
 *
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @param {OffscreenCanvas} canvas
 * @param {number} index
 * @returns {Promise<{ name: string, fileWritableStream: FileSystemWritableFileStream, webmWriter: import('./webm-writer2.js') }>}
 */
async function createFileHandle(directoryHandle, canvas, index) {
  const name = `myVideo_${index + 1}.webm`;
  const fileHandle = await directoryHandle.getFileHandle(name, { create: true });
  fileWritableStream = await fileHandle.createWritable();

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

/**
 * @param {FileSystemDirectoryHandle} directoryHandle
 * @param {HTMLCanvasElement} canvas
 * @param {any[]} csvData
 */
async function generateVideo(directoryHandle, canvas, csvData) {
  this.postMessage({ type: 'log', message: 'Setting up canvas...' });

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');

  // split into segments

  this.postMessage({ type: 'log', message: 'Scanning CSV for ride segments...' });
  const videos = [];
  let lastIndex = 0;
  for (let i = 0; i < csvData.length; i++) {
    const prev = csvData[i - 1];
    const data = csvData[i];
    if (prev && data['Time(s)'] - prev['Time(s)'] > GAP_THRESHOLD_SECS) {
      // if the time difference is more than 60 seconds, we assume a pause
      this.postMessage({ type: 'log', message: `Detected pause at ${data['Time(s)']}s` });
      videos.push(new Video(csvData.slice(lastIndex, i)));
      lastIndex = i;
    }
  }
  if (lastIndex < csvData.length) {
    videos.push(new Video(csvData.slice(lastIndex)));
  }

  this.postMessage({ type: 'log', message: `Found ${videos.length} segments.` });

  // create encoder

  this.postMessage({ type: 'log', message: 'Setting up encoder...' });

  const encoderConfig = {
    codec: 'vp8',
    width: canvas.width,
    height: canvas.height,
    bitrate: 2_000_000, // 2 Mbps
    framerate: FPS,
  };

  const { supported } = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!supported) {
    this.postMessage({ type: 'fatal', message: 'VideoEncoder is not supported in this browser.' });
    return;
  }

  let currentWriter;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      currentWriter.webmWriter.addFrame(chunk);
    },
    error: (e) => {
      this.postMessage({ type: 'log', message: `Encoder error: ${e.message}` });
    },
  });
  encoder.configure(encoderConfig);

  // render frames

  this.postMessage({ type: 'log', message: 'Beginning render...' });

  totalFramesGenerated = 0;
  totalFramesToGenerate = videos.reduce((sum, video) => sum + video.frameCount(), 0);
  const start = performance.now();
  const frameDurationMicros = 1_000_000 / FPS;

  started = true;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    currentWriter = await createFileHandle(directoryHandle, canvas, i);
    this.postMessage({
      type: 'log',
      message: `Rendering segment ${i + 1} (${video.frameCount()} frames) into ${currentWriter.name}...`,
    });

    let frameNumber = 0;
    const startTime = video.startTime();
    for (let j = 0; j < video.csvData.length; j++) {
      const data = video.csvData[j];
      const timeMicros = (data['Time(s)'] - startTime) * 1_000_000;

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
  this.postMessage({
    type: 'log',
    message: `Rendered ${totalFramesGenerated} frames in ${(duration / 1_000 / 60).toFixed(2)} min(s)`,
  });
  this.postMessage({ type: 'log', message: `Average frame time: ${(duration / totalFramesGenerated).toFixed(2)} ms` });

  this.postMessage({ type: 'complete' });
}
