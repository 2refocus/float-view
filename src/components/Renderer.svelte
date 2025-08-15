<script lang="ts">
  import { onMount } from 'svelte';
  import { demoFile, demoRow } from '../lib/parse/float-control';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import { SvgImage } from './Renderer.utils';
  import rollSvg from '../assets/roll.svg?raw';
  import pitchSvg from '../assets/pitch.svg?raw';
  import type { WorkerCommand, WorkerMessage, TypedWorker } from './Renderer.types';

  let elDemoContainer = $state<HTMLDivElement | null>(null);
  let elProgressBar = $state<HTMLProgressElement | null>(null);
  let elProgressText = $state<HTMLPreElement | null>(null);
  let elLogOutput = $state<HTMLPreElement | null>(null);
  let isRendering = $state(false);
  let interpolate = $state(false);
  let showRemoteTilt = $state(false);
  let filename = $state('');
  let inputFile = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let inputStartingIndex = $state('');
  let inputEndingIndex = $state('');
  let inputFps = $state('');
  let inputWidth = $state('');
  let inputHeight = $state('');
  let inputGapThresholdSecs = $state('');

  const defaultFps = 20;
  const defaultWidth = 1080;
  const defaultHeight = 1440;
  const defaultGapThresholdSecs = 60;

  let startingIndex = $derived(inputStartingIndex ? parseInt(inputStartingIndex, 10) : 0);
  let endingIndex = $derived(inputEndingIndex ? parseInt(inputEndingIndex, 10) : 0);
  let fps = $derived(inputFps ? parseInt(inputFps, 10) : defaultFps);
  let width = $derived(inputWidth ? parseInt(inputWidth, 10) : defaultWidth);
  let height = $derived(inputHeight ? parseInt(inputHeight, 10) : defaultHeight);
  let gapThresholdSecs = $derived(
    inputGapThresholdSecs ? parseInt(inputGapThresholdSecs, 10) : defaultGapThresholdSecs,
  );

  // when relevant values change, update debug
  $effect(() => {
    width;
    height;
    showRemoteTilt;
    drawDebug();
  });

  const createWorker = (): TypedWorker<WorkerCommand, WorkerMessage> =>
    new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });

  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (inputFile) {
      elLogOutput!.textContent = '';
      filename = inputFile.name.replace(/(\.(zip|csv|json))+$/, '');
      worker.postMessage({ type: 'file', inputFile, startingIndex, endingIndex, fps, gapThresholdSecs });
    }
  });

  Notification.requestPermission();

  let lastProgressFrameCount = 0;
  let lastProgressUpdate = 0;
  let pendingUpdate = false;
  worker.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'complete':
        elProgressBar!.value = elProgressBar!.max;
        elLogOutput!.textContent += `Finished rendering!\n`;

        isRendering = false;

        if (Notification.permission === 'granted') {
          const humanTime = new Date(msg.totalMilliseconds).toISOString().substr(11, 8);
          new Notification('Rendering complete!', { body: `Rendered in ${humanTime} (hh:mm:ss)` });
        }
        return;
      case 'progress': {
        const { totalFramesToGenerate, totalFramesGenerated } = msg;
        const durationSinceLastUpdate = performance.now() - lastProgressUpdate;
        const framesSinceLastUpdate = totalFramesGenerated - lastProgressFrameCount;
        const fps = Math.round(framesSinceLastUpdate / (durationSinceLastUpdate / 1000));
        const pct = ((totalFramesGenerated / totalFramesToGenerate) * 100).toFixed(2);

        elProgressText!.textContent = `${pct}% ${totalFramesGenerated}/${totalFramesToGenerate} (${fps} fps)`;
        elProgressBar!.max = totalFramesToGenerate;
        elProgressBar!.value = totalFramesGenerated;

        lastProgressFrameCount = totalFramesGenerated;
        lastProgressUpdate = performance.now();
        pendingUpdate = false;
        return;
      }
      case 'log':
        elLogOutput!.textContent += msg.message + '\n';
        elLogOutput!.scrollTop = elLogOutput!.scrollHeight;
        return;
      case 'fatal':
        alert(`Error: ${msg.message}`);
        isRendering = false;
        return;
      default:
        console.warn('Unknown message from worker', msg);
        return;
    }
  });

  async function chooseOutputAndRender() {
    if (!filename) {
      alert('Please enter a filename!');
      return;
    }

    const directoryHandle = await window.showDirectoryPicker({
      id: 'output',
      mode: 'readwrite',
      startIn: 'videos',
    });

    const canvas = document.createElement('canvas').transferControlToOffscreen();
    isRendering = true;
    worker.postMessage(
      { type: 'start', directoryHandle, fps, width, height, canvas, interpolate, showRemoteTilt, filename },
      [canvas],
    );

    lastProgressUpdate = performance.now();

    while (isRendering) {
      if (!pendingUpdate) {
        worker.postMessage({ type: 'update' });
        pendingUpdate = true;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  function stop() {
    worker.postMessage({ type: 'stop' });
    elLogOutput!.textContent += `Cancelled!\n`;
    isRendering = false;
  }

  function clear() {
    stop();
    elLogOutput!.textContent = '';
    inputFile = undefined;
  }

  let ready = false;
  function drawDebug() {
    if (elDemoContainer && ready) {
      elDemoContainer.innerHTML = '';
      const canvas = elDemoContainer.appendChild(document.createElement('canvas'));
      canvas.classList.add('h-full');
      canvas.width = width;
      canvas.height = height;

      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'draw', canvas: offscreen, data: demoRow, showRemoteTilt }, [offscreen]);
    }
  }

  onMount(async () => {
    // NOTE: web workers can't render SVGs, even though the spec says they should
    // so we render them in the UI thread here to a bitmap, and pass that to the worker
    // See: https://stackoverflow.com/a/79196371/5552584
    const sendBitmap = (name: string, image: ImageBitmap) =>
      worker.postMessage({ type: 'image', name, image }, [image]);
    sendBitmap('roll', await SvgImage.create(rollSvg).then((img) => img.bitmap(200, 180)));
    sendBitmap('pitch', await SvgImage.create(pitchSvg).then((img) => img.bitmap(500, 500)));

    ready = true;
    drawDebug();
  });
</script>

<Picker bind:file={inputFile} />

<div class="bg-slate-900">
  <div class="max-w-7xl p-6 space-y-8 m-auto bg-slate-900 min-h-screen">
    <!-- Header Section -->
    <div class="bg-amber-900/20 border border-amber-700/30 rounded-lg p-4 backdrop-blur-sm">
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
        <div>
          <h3 class="text-sm font-medium text-amber-200">Experimental Feature</h3>
          <div class="mt-1 text-sm text-amber-300/80">
            <p>
              This feature is currently experimental and may have bugs. Only works in Chromium-based browsers (Chrome,
              Edge, etc.) due to File System Access API requirements.
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Left Column: Configuration -->
      <div class="space-y-6">
        <!-- Action Buttons -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">🎯 Actions</h2>
          <div class="space-y-3">
            <Button
              onclick={() => chooseOutputAndRender()}
              class="w-full bg-blue-600/80 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/25 {isRendering
                ? 'opacity-50 cursor-not-allowed'
                : ''}"
              disabled={isRendering}
            >
              {isRendering ? '🎬 Rendering...' : '🎬 Choose Output & Render'}
            </Button>
            <div class="grid grid-cols-2 gap-3">
              <Button
                onclick={() => stop()}
                class="disabled:opacity-50 disabled:cursor-not-allowed w-full bg-red-600/80 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-red-500/25"
                disabled={!isRendering}
              >
                ❌ Cancel
              </Button>
              <Button
                onclick={() => clear()}
                class="disabled:opacity-50 disabled:cursor-not-allowed w-full bg-slate-600/80 hover:bg-slate-600 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-slate-500/25"
                disabled={!inputFile}
              >
                📁 Choose another file
              </Button>
            </div>
          </div>
        </div>

        <!-- Output Settings -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">🎬 Output Settings</h2>
          <div class="space-y-4">
            <Input
              id="filename"
              label="Filename (without extension)"
              type="text"
              placeholder="myRide"
              bind:value={filename}
            />
            <Input
              id="fps"
              label="FPS"
              type="number"
              placeholder={`${defaultFps}`}
              onblur={(e) => (inputFps = e.currentTarget.value)}
            />
            <Input
              id="gapThresholdSecs"
              label="Gap threshold (seconds)"
              type="number"
              placeholder={`${defaultGapThresholdSecs}`}
              onblur={(e) => (inputGapThresholdSecs = e.currentTarget.value)}
            />
          </div>
        </div>

        <!-- Video Dimensions -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">📐 Video Dimensions</h2>
          <Input
            id="width"
            label="Width (px)"
            type="number"
            placeholder={`${defaultWidth}`}
            onblur={(e) => (inputWidth = e.currentTarget.value)}
          />
          <Input
            id="height"
            label="Height (px)"
            type="number"
            placeholder={`${defaultHeight}`}
            onblur={(e) => (inputHeight = e.currentTarget.value)}
          />
        </div>

        <!-- Data Range -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">📊 Data Range</h2>
          <Input
            id="startingIndex"
            label="Starting index"
            type="number"
            placeholder="0"
            onblur={(e) => (inputStartingIndex = e.currentTarget.value)}
          />
          <Input
            id="endingIndex"
            label="Ending index (0 = end of file)"
            type="number"
            placeholder="0"
            onblur={(e) => (inputEndingIndex = e.currentTarget.value)}
          />
        </div>

        <!-- Rendering Options -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">⚙️ Rendering Options</h2>
          <div class="space-y-3">
            <Input
              id="interpolate"
              type="checkbox"
              bind:checked={interpolate}
              label="Interpolate between data points (smooth transitions)"
            />
            <Input id="showRemoteTilt" type="checkbox" bind:checked={showRemoteTilt} label="Show Remote Tilt" />
          </div>
        </div>
      </div>

      <!-- Right Column: Preview and Progress -->
      <div class="space-y-6">
        <!-- Progress Section -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">📈 Progress</h2>
          <div class="space-y-4">
            <div class="space-y-2">
              <div class="flex justify-between items-center text-sm">
                <span class="text-slate-300">Rendering Progress</span>
                <pre
                  bind:this={elProgressText}
                  class="text-xs font-mono text-slate-300 bg-slate-700/50 px-2 py-1 rounded">...</pre>
              </div>
              <progress
                bind:this={elProgressBar}
                class="w-full h-3 rounded-lg overflow-hidden bg-slate-700/50 [&::-webkit-progress-bar]:bg-slate-700/50 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500"
              ></progress>
            </div>
          </div>
        </div>

        <!-- Log Output -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">📝 Log Output</h2>
          <pre
            bind:this={elLogOutput}
            class="h-[300px] w-full p-4 text-xs font-mono bg-slate-950/80 text-green-400 rounded-lg overflow-y-auto border border-slate-700/50 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"></pre>
        </div>

        <!-- Preview -->
        <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
          <h2 class="text-lg font-semibold text-slate-100 mb-4">🎨 Example Output</h2>
          <div
            bind:this={elDemoContainer}
            class="relative flex justify-center items-center h-[400px] bg-slate-900/50 border border-slate-600/50 rounded-lg overflow-hidden"
          >
            <!-- Preview canvas will be inserted here -->
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
