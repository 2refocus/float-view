<script lang="ts">
  import { onMount } from 'svelte';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import { RasterImage } from './Renderer.utils';

  let elDevDemoDiv = $state<HTMLDivElement | null>(null);
  let elProgress = $state<HTMLProgressElement | null>(null);
  let elProgressText = $state<HTMLPreElement | null>(null);
  let elOutput = $state<HTMLPreElement | null>(null);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let processing = $state(false);
  let interpolate = $state(false);
  let filename = $state('');
  let startingIndex = $state('');
  let endingIndex = $state('');
  let fps = $state('');
  let width = $state('');
  let height = $state('');
  let gapThresholdSecs = $state('');

  const defaultFps = 30;
  const defaultWidth = 1440;
  const defaultHeight = 1920;
  const defaultGapThresholdSecs = 60;

  let nFps = $derived(fps ? parseInt(fps, 10) : defaultFps);
  let nWidth = $derived(width ? parseInt(width, 10) : defaultWidth);
  let nHeight = $derived(height ? parseInt(height, 10) : defaultHeight);
  let nGapThresholdSecs = $derived(gapThresholdSecs ? parseInt(gapThresholdSecs, 10) : defaultGapThresholdSecs);

  // when relevant values change, update debug
  $effect(() => {
    if (!import.meta.env.DEV) return;
    nWidth;
    nHeight;
    drawDebug();
  });

  const createWorker = () => new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });
  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (file) {
      worker.postMessage({
        type: 'file',
        inputFile: file,
        startingIndex,
        endingIndex,
        fps: nFps,
        gapThresholdSecs: nGapThresholdSecs,
      });
      filename = file.name.replace(/(\.(zip|csv|json))+$/, '');
    }
  });

  Notification.requestPermission();

  let lastProgressFrameCount = 0;
  let lastProgressUpdate = 0;
  let pendingUpdate = false;
  worker.addEventListener('message', (e) => {
    switch (e.data.type) {
      case 'complete':
        elProgress!.value = elProgress!.max;
        elOutput!.textContent += `Finished rendering!\n`;

        processing = false;

        if (Notification.permission === 'granted') {
          new Notification('Rendering complete!', { body: 'Woohoo!' });
        }
        return;
      case 'progress': {
        const { totalFramesToGenerate, totalFramesGenerated } = e.data;
        const durationSinceLastUpdate = performance.now() - lastProgressUpdate;
        const framesSinceLastUpdate = totalFramesGenerated - lastProgressFrameCount;
        const fps = Math.round(framesSinceLastUpdate / (durationSinceLastUpdate / 1000));
        const pct = ((totalFramesGenerated / totalFramesToGenerate) * 100).toFixed(2);

        elProgressText!.textContent = `${pct}% ${totalFramesGenerated}/${totalFramesToGenerate} (${fps} fps)`;
        elProgress!.max = e.data.totalFramesToGenerate;
        elProgress!.value = e.data.totalFramesGenerated;

        lastProgressFrameCount = totalFramesGenerated;
        lastProgressUpdate = performance.now();
        pendingUpdate = false;
        return;
      }
      case 'log':
        elOutput!.textContent += e.data.message + '\n';
        elOutput!.scrollTop = elOutput!.scrollHeight;
        return;
      case 'fatal':
        alert(`Error: ${e.data.message}`);
        processing = false;
        return;
      default:
        console.warn('Unknown message from worker', e.data);
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
    processing = true;
    worker.postMessage(
      {
        type: 'start',
        outputDirectoryHandle,
        fps: nFps,
        width: nWidth,
        height: nHeight,
        canvas,
        interpolate,
        filename,
      },
      [canvas],
    );

    lastProgressUpdate = performance.now();

    while (processing) {
      if (!pendingUpdate) {
        worker.postMessage({ type: 'update' });
        pendingUpdate = true;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  function stop() {
    worker.postMessage({ type: 'stop' });
    elOutput!.textContent += `Cancelled!\n`;
    processing = false;
  }

  function clear() {
    stop();
    elOutput!.textContent = '';
    file = undefined;
  }

  let ready = false;
  function drawDebug() {
    if (import.meta.env.DEV && elDevDemoDiv && ready) {
      elDevDemoDiv.innerHTML = '';
      const canvas = elDevDemoDiv.appendChild(document.createElement('canvas'));
      canvas.classList.add('h-full', 'grow');
      canvas.width = nWidth;
      canvas.height = nHeight;

      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'draw', offscreen, data: demoRows[124]! }, [offscreen]);
    }
  }

  onMount(async () => {
    // NOTE: web workers can't render SVGs, even though the spec says they should
    // so we rendering them in the UI thread here to a bitmap, and pass that to the worker
    // See: https://stackoverflow.com/a/79196371/5552584
    const sendBitmap = (name: string, image: ImageBitmap) =>
      worker.postMessage({ type: 'image', name, image }, [image]);
    sendBitmap('roll', await RasterImage.create('./src/assets/roll.svg').then((img) => img.bitmap(200, 180)));
    sendBitmap('pitch', await RasterImage.create('./src/assets/pitch.svg').then((img) => img.bitmap(500, 500)));

    ready = true;
    drawDebug();
  });
</script>

<div class="flex flex-col gap-2 p-2">
  <div>
    <p>Currently <strong>experimental</strong> and likely has bugs!</p>
    <p>Please note, this currently only works in chromium-based browsers since it uses the File System Access API.</p>
  </div>

  <Picker bind:file />
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
      onblur={(e) => (fps = e.currentTarget.value)}
    />
    <Input
      id="width"
      label="Width"
      type="number"
      placeholder={`${defaultWidth}`}
      onblur={(e) => (width = e.currentTarget.value)}
    />
    <Input
      id="height"
      label="Height"
      type="number"
      placeholder={`${defaultHeight}`}
      onblur={(e) => (height = e.currentTarget.value)}
    />
    <Input
      id="gapThresholdSecs"
      label="Seconds needed between datapoint before splitting segment"
      type="number"
      placeholder={`${defaultGapThresholdSecs}`}
      onblur={(e) => (gapThresholdSecs = e.currentTarget.value)}
    />
    <Input
      id="startingIndex"
      label="Starting index"
      type="number"
      placeholder="0"
      onblur={(e) => (startingIndex = e.currentTarget.value)}
    />
    <Input
      id="endingIndex"
      label="Ending index (optional, set to 0 for end of file)"
      type="number"
      placeholder="0"
      onblur={(e) => (endingIndex = e.currentTarget.value)}
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
      <progress bind:this={elProgress} class="w-full grow"></progress>
      <pre bind:this={elProgressText}>...</pre>
    </div>
  </div>
  <div class="flex flex-row gap-2">
    <pre bind:this={elOutput} class="h-[540px] max-h-[540px] w-full p-2 grow overflow-y-auto border"></pre>
    {#if import.meta.env.DEV}
      <div bind:this={elDevDemoDiv} class="relative h-[540px] border"></div>
    {/if}
  </div>
</div>
