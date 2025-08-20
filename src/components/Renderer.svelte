<script lang="ts">
  import { onMount } from 'svelte';
  import { demoFile, demoRow } from '../lib/parse/float-control';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import { SvgImage } from './Renderer/svg';
  import rollSvg from '../assets/roll.svg?raw';
  import pitchSvg from '../assets/pitch.svg?raw';
  import riderIconSvg from '../assets/rider-icon.svg?raw';
  import type { WorkerCommand, WorkerMessage, TypedWorker } from './Renderer/types';
  import { createRenderer } from './Renderer/render';
  import Pill from './Pill.svelte';

  const defaultFps = 20;
  const defaultWidth = 1080;
  const defaultHeight = 1440;
  const defaultGapThresholdSecs = 60;

  class SavedState<T> {
    private readonly k: string;
    public v = $state<T>(undefined as unknown as T);
    constructor(key: string, defaultValue: T) {
      this.k = key;
      this.v = defaultValue;

      const saved = localStorage.getItem(this.k);
      if (saved !== null) {
        try {
          this.v = JSON.parse(saved);
        } catch (e) {
          console.warn(`Failed to parse saved state for ${this.k}:`, e);
          this.v = defaultValue;
        }
      }

      $effect(() => {
        localStorage.setItem(this.k, JSON.stringify(this.v));
      });
    }
  }

  // DOM elements
  let elDemoContainer = $state<HTMLDivElement | null>(null);
  let elProgressBar1 = $state<HTMLProgressElement | null>(null);
  let elProgressBar2 = $state<HTMLProgressElement | null>(null);
  let elProgressText1 = $state<HTMLPreElement | null>(null);
  let elProgressText2 = $state<HTMLPreElement | null>(null);
  let elLogOutput = $state<HTMLPreElement | null>(null);

  // state
  let isRendering = $state(false);

  // saved user input
  let interpolate = new SavedState('interpolate', false);
  let showRemoteTilt = new SavedState('showRemoteTilt', false);
  let use3dRenderer = new SavedState('use3dRenderer', false);
  let renderInUi = import.meta.env.DEV ? new SavedState('renderInUi', false) : { v: false };
  let fullscreenPreview = import.meta.env.DEV ? new SavedState('fullscreenPreview', false) : { v: false };
  let inputFps = new SavedState('inputFps', '');
  let inputWidth = new SavedState('inputWidth', '');
  let inputHeight = new SavedState('inputHeight', '');
  let inputGapThresholdSecs = new SavedState('inputGapThresholdSecs', '');

  // other user input
  let filename = $state('');
  let inputFile = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let inputStartingIndex = $state('');
  let inputEndingIndex = $state('');

  // derived values
  let startingIndex = $derived(inputStartingIndex ? parseInt(inputStartingIndex, 10) : 0);
  let endingIndex = $derived(inputEndingIndex ? parseInt(inputEndingIndex, 10) : 0);
  let fps = $derived(inputFps.v ? parseInt(inputFps.v, 10) : defaultFps);
  let width = $derived(inputWidth.v ? parseInt(inputWidth.v, 10) : defaultWidth);
  let height = $derived(inputHeight.v ? parseInt(inputHeight.v, 10) : defaultHeight);
  let gapThresholdSecs = $derived(
    inputGapThresholdSecs.v ? parseInt(inputGapThresholdSecs.v, 10) : defaultGapThresholdSecs,
  );

  // when relevant values change, update debug
  $effect(() => {
    width;
    height;
    showRemoteTilt.v;
    use3dRenderer.v;
    renderInUi.v;
    drawDebug();
  });

  const createWorker = (): TypedWorker<WorkerCommand, WorkerMessage> =>
    new Worker(new URL('./Renderer/worker.ts', import.meta.url), { type: 'module' });

  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (inputFile) {
      if (elLogOutput) elLogOutput.textContent = '';
      filename = inputFile.name.replace(/(\.(zip|csv|json))+$/, '');
      worker.postMessage({ type: 'file', inputFile, startingIndex, endingIndex, fps, gapThresholdSecs });
    }
  });

  let lastProgressFrameCount = 0;
  let lastProgressUpdate = 0;
  let pendingUpdate = false;
  worker.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'complete':
        elProgressBar1!.value = elProgressBar1!.max;
        elProgressBar2!.value = elProgressBar2!.max;
        elLogOutput!.textContent += `Finished rendering!\n`;

        isRendering = false;

        if (Notification.permission === 'granted') {
          const humanTime = new Date(msg.totalMilliseconds).toISOString().substr(11, 8);
          new Notification('Rendering complete!', { body: `Rendered in ${humanTime} (hh:mm:ss)` });
        }
        return;
      case 'progress': {
        elProgressBar1!.value = msg.currentVideoIndex + msg.currentVideoProgress;
        elProgressBar1!.max = msg.videosTotal;

        elProgressBar2!.value = msg.currentVideoProgress;
        elProgressBar2!.max = 1;

        const durationSinceLastUpdate = performance.now() - lastProgressUpdate;
        const framesSinceLastUpdate = msg.framesGenerated - lastProgressFrameCount;
        const fps = Math.round(framesSinceLastUpdate / (durationSinceLastUpdate / 1000));
        const pct = Math.min(100, msg.currentVideoProgress * 100).toFixed(1);

        elProgressText1!.textContent = `Segment ${msg.currentVideoIndex + 1} of ${msg.videosTotal}`;
        elProgressText2!.textContent = `${pct}% (${msg.framesGenerated} frames) (${fps} fps)`;

        lastProgressFrameCount = msg.framesGenerated;
        lastProgressUpdate = performance.now();
        pendingUpdate = false;
        return;
      }
      case 'log':
        if (elLogOutput) {
          elLogOutput.textContent += msg.message + '\n';
          elLogOutput.scrollTop = elLogOutput.scrollHeight;
        } else {
          console.debug(msg.message);
        }
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
    Notification.requestPermission();

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
      {
        type: 'start',
        directoryHandle,
        fps,
        width,
        height,
        canvas,
        interpolate: interpolate.v,
        showRemoteTilt: showRemoteTilt.v,
        use3dRenderer: use3dRenderer.v,
        filename,
      },
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
  async function drawDebug() {
    if (elDemoContainer && ready) {
      elDemoContainer.innerHTML = '';
      const canvas = elDemoContainer.appendChild(document.createElement('canvas'));
      canvas.classList.add('h-full');
      canvas.width = width;
      canvas.height = height;

      if (renderInUi.v) {
        const renderer = await createRenderer(canvas, { drawRemoteTilt: showRemoteTilt.v, images }, use3dRenderer.v);
        await renderer.draw(demoRow);

        if (use3dRenderer.v) {
          requestAnimationFrame(function loop() {
            if (!renderInUi.v) return;
            renderer.draw(demoRow).then(() => requestAnimationFrame(loop));
          });
        }
      } else {
        const offscreen = canvas.transferControlToOffscreen();
        worker.postMessage(
          {
            type: 'draw',
            canvas: offscreen,
            data: demoRow,
            showRemoteTilt: showRemoteTilt.v,
            use3dRenderer: use3dRenderer.v,
          },
          [offscreen],
        );
      }
    }
  }

  const images: Record<string, ImageBitmap> = {};
  onMount(async () => {
    // NOTE: web workers can't render SVGs, even though the spec says they should
    // so we render them in the UI thread here to a bitmap, and pass that to the worker
    // See: https://stackoverflow.com/a/79196371/5552584
    const generateBitmap = async (name: string, svgXml: string, width: number, height: number) => {
      const svgImg = await SvgImage.create(svgXml);
      images[name] = await svgImg.bitmap(width, height);

      const image = await svgImg.bitmap(width, height);
      worker.postMessage({ type: 'image', name, image }, [image]);
    };

    await Promise.all([generateBitmap('roll', rollSvg, 200, 180), generateBitmap('pitch', pitchSvg, 500, 500)]);

    ready = true;
    drawDebug();
  });
</script>

<Picker bind:file={inputFile} />

{#snippet outputSettings()}
  <h2 class="text-lg font-semibold text-slate-100 mb-4">🎬 Output Settings</h2>
  <div class="space-y-1">
    <Input id="filename" label="Filename (without extension)" type="text" placeholder="myRide" bind:value={filename} />
    <Input
      id="fps"
      label="FPS"
      type="number"
      defaultValue={inputFps.v}
      placeholder={`${defaultFps}`}
      onblur={(e) => (inputFps.v = e.currentTarget.value)}
    />
    <Input
      id="gapThresholdSecs"
      label="Gap threshold (seconds)"
      type="number"
      defaultValue={inputGapThresholdSecs.v}
      placeholder={`${defaultGapThresholdSecs}`}
      onblur={(e) => (inputGapThresholdSecs.v = e.currentTarget.value)}
    />
    <Input
      id="width"
      label="Width (px)"
      type="number"
      defaultValue={inputWidth.v}
      placeholder={`${defaultWidth}`}
      onblur={(e) => (inputWidth.v = e.currentTarget.value)}
    />
    <Input
      id="height"
      label="Height (px)"
      type="number"
      defaultValue={inputHeight.v}
      placeholder={`${defaultHeight}`}
      onblur={(e) => (inputHeight.v = e.currentTarget.value)}
    />
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
    <Input
      id="interpolate"
      type="checkbox"
      bind:checked={interpolate.v}
      label="Interpolate data points (smooth transitions)"
    />
    <Input id="showRemoteTilt" type="checkbox" bind:checked={showRemoteTilt.v} label="Show Remote Tilt" />
    <div class="flex items-center justify-center space-x-2">
      <Pill text="experimental" appearance="lime" />
      <Input class="grow" id="use3dRenderer" type="checkbox" bind:checked={use3dRenderer.v} label="3D Renderer" />
    </div>
    {#if import.meta.env.DEV}
      <div class="flex items-center justify-center space-x-2">
        <Pill text="dev" appearance="amber" />
        <Input
          class="grow"
          id="renderInWorker"
          type="checkbox"
          bind:checked={renderInUi.v}
          label="Render in UI thread"
        />
      </div>
    {/if}
  </div>
{/snippet}

<div class="bg-slate-900">
  {#if fullscreenPreview.v}
    <div class="flex flex-row items-center h-screen w-screen">
      <div
        class="bg-slate-800/50 border space-y-5 min-h-[400px] m-4 w-full border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm"
      >
        <div class="flex flex-row justify-between">
          <div>
            {#if renderInUi.v}
              <Pill text="live" appearance="rose" class="animate-pulse" />
            {/if}
          </div>
          <Button onclick={() => (fullscreenPreview.v = false)}>Exit fullscreen</Button>
        </div>
        {@render outputSettings()}
      </div>
      <div class="h-screen" bind:this={elDemoContainer}></div>
    </div>
  {:else}
    <div class="max-w-7xl p-6 m-auto bg-slate-900 min-h-screen">
      <!-- Hero Section with Styled Title -->
      <div class="text-center space-y-4 pb-2">
        <div class="flex justify-center items-center space-x-4">
          <div class="self-end">{@html riderIconSvg}</div>
          <div class="relative">
            <h1
              class="text-6xl md:text-7xl font-black text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text tracking-tight leading-none"
            >
              Float Renderer
            </h1>
            <div
              class="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20 blur-2xl -z-10 rounded-full"
            ></div>
          </div>
          <div class="scale-x-[-1] self-end">{@html riderIconSvg}</div>
        </div>
        <div class="relative max-w-2xl mx-auto">
          <p class="text-xl md:text-2xl text-slate-300 font-light tracking-wide">
            Transform your
            <span class="text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text font-semibold"
              >recorded ride</span
            >
            into a
            <span class="text-transparent bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text font-semibold"
              >realtime video</span
            >
          </p>
          <div class="flex justify-center mt-4">
            <div class="flex space-x-1"></div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Left Column: Configuration -->
        <div class="space-y-3">
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
                <h3 class="text-sm font-medium text-amber-200">Please Note!</h3>
                <div class="mt-1 text-sm text-amber-300/80">
                  <p>
                    This feature is currently experimental and may have bugs. Only works in Chromium-based browsers
                    (Chrome, Edge, etc.) due to File System Access API requirements.
                  </p>
                </div>
              </div>
            </div>
          </div>
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

          <!-- Progress Section -->
          <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
            <h2 class="text-lg font-semibold text-slate-100 mb-4">📈 Progress</h2>
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-300">Segments</span>
                  <pre
                    bind:this={elProgressText1}
                    class="text-xs font-mono text-slate-300 bg-slate-700/50 px-2 py-1 rounded">...</pre>
                </div>
                <progress
                  bind:this={elProgressBar1}
                  class="w-full h-3 rounded-lg overflow-hidden bg-slate-700/50 [&::-webkit-progress-bar]:bg-slate-700/50 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500"
                ></progress>
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-300">Progress</span>
                  <pre
                    bind:this={elProgressText2}
                    class="text-xs font-mono text-slate-300 bg-slate-700/50 px-2 py-1 rounded">...</pre>
                </div>
                <progress
                  bind:this={elProgressBar2}
                  class="w-full h-3 rounded-lg overflow-hidden bg-slate-700/50 [&::-webkit-progress-bar]:bg-slate-700/50 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500"
                ></progress>
              </div>
            </div>
          </div>

          <!-- Output Settings -->
          <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
            {@render outputSettings()}
          </div>
        </div>

        <!-- Right Column -->
        <div class="space-y-3">
          <!-- Log Output -->
          <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
            <h2 class="text-lg font-semibold text-slate-100 mb-4">📝 Log Output</h2>
            <pre
              bind:this={elLogOutput}
              class="h-[300px] w-full p-4 text-xs font-mono bg-slate-950/80 text-green-400 rounded-lg overflow-y-auto border border-slate-700/50 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-slate-800"></pre>
          </div>

          <!-- Preview -->
          <div class="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 shadow-lg backdrop-blur-sm">
            <h2 class="text-lg font-semibold text-slate-100 mb-4">
              🎨 Render Preview
              {#if renderInUi.v}
                <Pill text="live" appearance="rose" class="animate-pulse" />
              {/if}
            </h2>
            {#if import.meta.env.DEV}
              <div class="flex items-center justify-between mb-2">
                <Button onclick={() => (fullscreenPreview.v = true)} class="bg-blue-600/80 hover:bg-blue-600">
                  Fullscreen Preview
                </Button>
              </div>
            {/if}
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
  {/if}
</div>
