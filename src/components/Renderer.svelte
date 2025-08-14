<script lang="ts">
  import { onMount } from 'svelte';
  import { demoFile, demoRows } from '../lib/parse/float-control';
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
    drawDebug();
  });

  const createWorker = (): TypedWorker<WorkerCommand, WorkerMessage> =>
    new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });

  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (inputFile) {
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

    const outputDirectoryHandle = await window.showDirectoryPicker({
      id: 'output',
      mode: 'readwrite',
      startIn: 'videos',
    });

    const canvas = document.createElement('canvas').transferControlToOffscreen();
    isRendering = true;
    worker.postMessage({ type: 'start', outputDirectoryHandle, fps, width, height, canvas, interpolate, filename }, [
      canvas,
    ]);

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
      canvas.classList.add('h-full', 'grow');
      canvas.width = width;
      canvas.height = height;

      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'draw', canvas: offscreen, data: demoRows[124]! }, [offscreen]);
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

<div class="flex flex-col gap-2 p-2">
  <div>
    <p>Currently <strong>experimental</strong> and likely has bugs!</p>
    <p>Please note, this currently only works in chromium-based browsers since it uses the File System Access API.</p>
  </div>

  <Picker bind:file={inputFile} />
  <div class="flex flex-col gap-2 p-4 justify-center w-3/4 m-auto">
    <Input
      id="filename"
      label="Output filename (without extension)"
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
      id="width"
      label="Width"
      type="number"
      placeholder={`${defaultWidth}`}
      onblur={(e) => (inputWidth = e.currentTarget.value)}
    />
    <Input
      id="height"
      label="Height"
      type="number"
      placeholder={`${defaultHeight}`}
      onblur={(e) => (inputHeight = e.currentTarget.value)}
    />
    <Input
      id="gapThresholdSecs"
      label="Seconds needed between datapoint before splitting segment"
      type="number"
      placeholder={`${defaultGapThresholdSecs}`}
      onblur={(e) => (inputGapThresholdSecs = e.currentTarget.value)}
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
      label="Ending index (optional, set to 0 for end of file)"
      type="number"
      placeholder="0"
      onblur={(e) => (inputEndingIndex = e.currentTarget.value)}
    />
    <Input
      id="interpolate"
      type="checkbox"
      bind:checked={interpolate}
      label="Interpolate between data points (smooth transitions)"
    />
    <Button onclick={() => chooseOutputAndRender()}>choose output and render!</Button>
    <Button onclick={() => stop()}>cancel</Button>
    <Button onclick={() => clear()}>clear file</Button>
    <div class="flex flex-row justify-between items-center gap-2">
      <progress bind:this={elProgressBar} class="w-full grow"></progress>
      <pre bind:this={elProgressText}>...</pre>
    </div>
  </div>
  <div class="flex flex-row gap-2">
    <pre bind:this={elLogOutput} class="h-[540px] max-h-[540px] w-full p-2 grow overflow-y-auto border"></pre>
    <div bind:this={elDemoContainer} class="relative h-[540px] border"></div>
  </div>
</div>
