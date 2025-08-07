this.importScripts('/webm-writer2.js', '/node_modules/papaparse/papaparse.min.js');

this.addEventListener('message', (e) => {
  if (e.data.type === 'start') {
    this.postMessage({ type: 'log', message: 'Reading CSV...' });
    Papa.parse(e.data.inputFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        this.postMessage({ type: 'log', message: 'Finished reading CSV.' });
        generateVideo(e.data.outputFileHandle, e.data.canvas, results.data);
      },
    });
  }

  if (e.data.type === 'update') {
    this.postMessage({ type: 'log', message: `Frames rendered: ${frameNumber}` });
  }
});

const FPS = 30;
const WIDTH = 640;
const HEIGHT = 480;

let frameNumber = 0;

/**
 *
 * @param {*} fileHandle
 * @param {HTMLCanvasElement} canvas
 */
async function generateVideo(fileHandle, canvas, csvData) {
  /** @type {HTMLCanvasElement} */
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');

  function draw(data) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText(`Speed: ${data['Speed(km/h)']} km/h`, 10, 50);
  }

  this.postMessage({ type: 'log', message: 'Setup canvas.' });

  // output

  fileWritableStream = await fileHandle.createWritable();
  const writer = new WebMWriter({
    fileWriter: fileWritableStream,
    codec: 'VP8',
    width: canvas.width,
    height: canvas.height,
    frameRate: FPS,
  });

  this.postMessage({ type: 'log', message: 'Setup file output.' });

  // create encoder

  const encoderConfig = {
    codec: 'vp8',
    width: canvas.width,
    height: canvas.height,
    bitrate: 2_000_000, // 2 Mbps
    framerate: FPS,
  };

  const { supported } = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!supported) {
    alert('VideoEncoder is not supported in this browser.');
    return;
  }

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      writer.addFrame(chunk);
    },
    error: (e) => {
      console.error(e);
    },
  });
  encoder.configure(encoderConfig);

  this.postMessage({ type: 'log', message: 'Setup encoder.' });

  // render frames
  // TODO: don't render during pauses - could be rendering hours of nothing
  // TODO: calculate total frames needed, and show progress bar

  frameNumber = 0;
  const start = performance.now();
  const frameDurationMicros = 1_000_000 / FPS;
  for (let i = 0; i < csvData.length; i++) {
    const data = csvData[i];
    const timeMicros = data['Time(s)'] * 1_000_000;

    // render frame
    draw(data);

    // encode frames until time is reached
    while (true) {
      // render as fast as the encoder can handle (otherwise we'll OOM by generating too many frames)
      while (encoder.encodeQueueSize > FPS) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      frameNumber++;

      const frameTime = Math.round(frameNumber * frameDurationMicros);
      const frame = new VideoFrame(canvas, { timestamp: frameTime });
      encoder.encode(frame, { keyFrame: frameNumber % FPS === 0 });
      frame.close();

      if (frameTime >= timeMicros) {
        break;
      }
    }
  }

  await encoder.flush();
  encoder.close();

  const duration = performance.now() - start;
  console.log(`Rendered ${frameNumber} frames in ${duration.toFixed(2)} ms`);
  console.log(`Average frame time: ${(duration / frameNumber).toFixed(2)} ms`);

  await writer.complete();
  fileWritableStream.close();
  this.postMessage({ type: 'complete' });
}
