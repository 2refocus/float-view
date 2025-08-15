import WebMWriter from '../lib/webm-writer2.js';
import { draw } from './Renderer.draw';
import { RowKey, type RowWithIndex } from '../lib/parse/types.js';
import { parse } from '../lib/parse/index.js';
import type { WorkerCommand, WorkerCommandDef, WorkerMessage } from './Renderer.types.js';

function postMessage(message: WorkerMessage) {
  self.postMessage(message);
}

postMessage({ type: 'log', message: 'Renderer worker started.' });

let started = false;

let totalFramesGenerated = 0;
let totalFramesToGenerate = 0;

let videos: Video[] = [];
let images: Record<string, ImageBitmap> = {};

function log(message: string) {
  postMessage({ type: 'log', message });
}

function fatal(message: string) {
  postMessage({ type: 'fatal', message });
  console.error(message);
}

self.addEventListener('message', (e) => {
  const command = e.data as WorkerCommand;
  switch (command.type) {
    case 'image': {
      const { name, image } = command;
      log(`Loaded bitmap "${name}" (${image.width}x${image.height})...`);
      images[name] = image;
      return;
    }
    case 'draw':
      draw({
        canvas: command.canvas,
        ctx: command.canvas.getContext('2d')!,
        data: command.data,
        images,
        showRemoteTilt: command.showRemoteTilt,
      });
      return;

    case 'file':
      log('Reading input file...');
      parse(command.inputFile).then((result) => {
        log('Finished reading input file.');

        // split into segments

        videos.length = 0;

        log('Scanning CSV for ride segments...');

        const startingIndex = command.startingIndex ? Math.max(0, command.startingIndex) : 0;
        const endingIndex = command.endingIndex
          ? Math.min(result.data.length, command.endingIndex)
          : result.data.length;

        let lastIndex = 0;
        for (let i = startingIndex; i < endingIndex; i++) {
          const prev = result.data[i - 1];
          const data = result.data[i]!;
          // if the time difference is more than 60 seconds, we assume a pause
          if (prev && data[RowKey.Time] - prev[RowKey.Time] > command.gapThresholdSecs) {
            const slice = result.data.slice(lastIndex, i);
            if (slice.length > 1) {
              log(`Detected pause at ${data[RowKey.Time]}s`);
              videos.push(new Video(slice));
            }
            lastIndex = i;
          }
        }

        if (lastIndex < endingIndex) {
          const slice = result.data.slice(lastIndex, endingIndex);
          if (slice.length > 1) {
            videos.push(new Video(slice));
          }
        }

        log(`Found ${videos.length} segments.`);
        log(`Will generate ${videos.reduce((sum, video) => sum + video.frameCount(command.fps), 0)} frames.`);
      });
      return;
    case 'start':
      log('Reading input file...');
      if (!videos || videos.length === 0) {
        log('Error: no data available to render, please load a file.');
      } else {
        generateVideo(command);
      }
      return;
    case 'update':
      postUpdateMessage();
      return;
    case 'stop':
      started = false;
      log('Stopping video generation...');
      return;
    default:
      console.warn(`Unknown command`, command);
  }
});

function postUpdateMessage() {
  postMessage({ type: 'progress', totalFramesGenerated, totalFramesToGenerate });
}

class Video {
  constructor(public readonly csvData: RowWithIndex[]) {
    if (!Array.isArray(csvData) || csvData.length < 2) {
      console.warn({ csvData });
      throw new Error('Invalid CSV data provided');
    }
  }

  frameCount(fps: number) {
    const startTime = this.csvData[0]![RowKey.Time];
    const endTime = this.csvData[this.csvData.length - 1]![RowKey.Time];
    const totalSeconds = endTime - startTime;
    return Math.round(totalSeconds * fps);
  }

  startTime() {
    return this.csvData[0]![RowKey.Time];
  }
}

async function createFileHandle(
  directoryHandle: FileSystemDirectoryHandle,
  canvas: OffscreenCanvas,
  baseName: string,
  frameRate: number,
) {
  const name = `${baseName}.webm`;
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
      frameRate,
    }),
  };
}

function interpolateDataPoint(dataA: RowWithIndex, dataB: RowWithIndex, progress: number): RowWithIndex {
  // Progress should be between 0 and 1, where 0 = dataA and 1 = dataB
  progress = Math.max(0, Math.min(1, progress));

  const interpolated: RowWithIndex = { ...dataA };

  // Interpolate all numeric fields
  const numericKeys: (keyof RowWithIndex)[] = [
    RowKey.Adc1,
    RowKey.Adc2,
    RowKey.Ah,
    RowKey.AhCharged,
    RowKey.Altitude,
    RowKey.BmsFault,
    RowKey.BmsTemp,
    RowKey.BmsTempBattery,
    RowKey.CurrentBattery,
    RowKey.CurrentBooster,
    RowKey.CurrentFieldWeakening,
    RowKey.CurrentMotor,
    RowKey.Distance,
    RowKey.Duty,
    RowKey.Erpm,
    RowKey.GpsAccuracy,
    RowKey.GpsLatitude,
    RowKey.GpsLongitude,
    RowKey.MotorFault,
    RowKey.Pitch,
    RowKey.RequestedAmps,
    RowKey.Roll,
    RowKey.Setpoint,
    RowKey.SetpointAtr,
    RowKey.SetpointBreakTilt,
    RowKey.SetpointCarve,
    RowKey.SetpointRemote,
    RowKey.SetpointTorqueTilt,
    RowKey.Speed,
    RowKey.StateRaw,
    RowKey.TempBattery,
    RowKey.TempMosfet,
    RowKey.TempMotor,
    RowKey.Time,
    RowKey.TruePitch,
    RowKey.Voltage,
    RowKey.Wh,
    RowKey.WhCharged,
  ];

  for (const key of numericKeys) {
    const valueA = dataA[key] as number | undefined;
    const valueB = dataB[key] as number | undefined;

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      (interpolated as any)[key] = valueA + (valueB - valueA) * progress;
    } else if (typeof valueA === 'number') {
      (interpolated as any)[key] = valueA;
    } else if (typeof valueB === 'number') {
      (interpolated as any)[key] = valueB;
    }
  }

  // For non-numeric fields like State, use the closest data point
  interpolated[RowKey.State] = progress < 0.5 ? dataA[RowKey.State] : dataB[RowKey.State];
  interpolated.index = progress < 0.5 ? dataA.index : dataB.index;

  return interpolated;
}

async function generateVideo({
  directoryHandle,
  fps,
  width,
  height,
  canvas,
  filename,
  interpolate = false,
  showRemoteTilt = false,
}: WorkerCommandDef['start']) {
  log('Setting up canvas...');

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    fatal('Failed to get canvas context.');
    return;
  }

  // create encoder

  log('Setting up encoder...');

  const encoderConfig: VideoEncoderConfig = {
    codec: 'vp8',
    width: canvas.width,
    height: canvas.height,
    bitrate: 2_000_000,
    framerate: fps,
  };

  const { supported } = await VideoEncoder.isConfigSupported(encoderConfig);
  if (!supported) {
    fatal(`The chosen options are not supported: ${JSON.stringify(encoderConfig, null, 2)}`);
    return;
  }

  let currentWriter: Awaited<ReturnType<typeof createFileHandle>>;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      currentWriter.webmWriter.addFrame(chunk);
    },
    error: (e) => {
      log(`Encoder error: ${e.message}`);
    },
  });
  encoder.configure(encoderConfig);

  // render frames

  log(`Beginning render... (interpolate: ${interpolate})`);

  totalFramesGenerated = 0;
  totalFramesToGenerate = videos.reduce((sum, video) => sum + video.frameCount(fps), 0);
  const start = performance.now();
  const frameDurationMicros = 1_000_000 / fps;

  const backoffThreshold = fps * 2;

  started = true;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i]!;
    const baseName = `${filename} - segment_${(i + 1).toString().padStart(`${videos.length}`.length, '0')}`;
    currentWriter = await createFileHandle(directoryHandle, canvas, baseName, fps);
    log(`Rendering segment ${i + 1} (${video.frameCount(fps)} frames) into ${currentWriter.name}...`);

    let frameNumber = 0;
    const startTime = video.startTime();

    if (interpolate) {
      // Interpolation mode: render smooth transitions between data points
      for (let j = 0; j < video.csvData.length - 1; j++) {
        const currentData = video.csvData[j]!;
        const nextData = video.csvData[j + 1]!;
        const currentTimeMicros = (currentData[RowKey.Time] - startTime) * 1_000_000;
        const nextTimeMicros = (nextData[RowKey.Time] - startTime) * 1_000_000;

        // encode frames until we reach the next data point
        while (true) {
          if (!started) {
            return;
          }

          const frameTime = Math.round(frameNumber * frameDurationMicros);
          if (frameTime >= nextTimeMicros) {
            break;
          }

          // Calculate interpolation progress between current and next data points
          const progress =
            frameTime <= currentTimeMicros ? 0 : (frameTime - currentTimeMicros) / (nextTimeMicros - currentTimeMicros);

          const interpolatedData = interpolateDataPoint(currentData, nextData, progress);

          // render interpolated frame
          draw({ canvas, ctx, data: interpolatedData, images, showRemoteTilt });

          // render as fast as the encoder can handle (otherwise we'll OOM by generating too many frames)
          while (encoder.encodeQueueSize > backoffThreshold) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          const frame = new VideoFrame(canvas, { timestamp: frameTime });
          encoder.encode(frame, { keyFrame: frameNumber % fps === 0 });
          frame.close();

          frameNumber++;
          totalFramesGenerated++;
        }
      }

      // Handle the last data point (no interpolation needed)
      const lastData = video.csvData[video.csvData.length - 1]!;
      const lastTimeMicros = (lastData[RowKey.Time] - startTime) * 1_000_000;

      while (frameNumber * frameDurationMicros <= lastTimeMicros) {
        if (!started) {
          return;
        }

        draw({ canvas, ctx, data: lastData, images, showRemoteTilt });

        // render as fast as the encoder can handle (otherwise we'll OOM by generating too many frames)
        while (encoder.encodeQueueSize > backoffThreshold) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const frameTime = Math.round(frameNumber * frameDurationMicros);
        const frame = new VideoFrame(canvas, { timestamp: frameTime });
        encoder.encode(frame, { keyFrame: frameNumber % fps === 0 });
        frame.close();

        frameNumber++;
        totalFramesGenerated++;
      }
    } else {
      // Original mode: repeat the same frame until the next data point
      for (let j = 0; j < video.csvData.length; j++) {
        const data = video.csvData[j]!;
        const timeMicros = (data[RowKey.Time] - startTime) * 1_000_000;

        // render frame
        draw({ canvas, ctx, data, images, showRemoteTilt });

        // encode frames until time is reached
        while (true) {
          if (!started) {
            return;
          }

          // render as fast as the encoder can handle (otherwise we'll OOM by generating too many frames)
          while (encoder.encodeQueueSize > backoffThreshold) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }

          const frameTime = Math.round(frameNumber * frameDurationMicros);
          const frame = new VideoFrame(canvas, { timestamp: frameTime });
          encoder.encode(frame, { keyFrame: frameNumber % fps === 0 });
          frame.close();

          frameNumber++;
          totalFramesGenerated++;

          if (frameTime >= timeMicros) {
            break;
          }
        }
      }
    }

    await encoder.flush();
    await currentWriter.webmWriter.complete();
    await currentWriter.fileWritableStream.close();
  }

  encoder.close();

  const duration = performance.now() - start;
  log(`Rendered ${totalFramesGenerated} frames in ${(duration / 1_000 / 60).toFixed(2)} min(s)`);
  log(`Average frame time: ${(duration / totalFramesGenerated).toFixed(2)} ms`);

  postMessage({ type: 'complete', totalMilliseconds: duration });
}
