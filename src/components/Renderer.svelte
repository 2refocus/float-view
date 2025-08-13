<script lang="ts">
  import { onMount } from 'svelte';
  import { HEIGHT, WIDTH } from './Renderer.common';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';
  import { RasterImage } from './Renderer.utils';

  let elDevDemoCanvas = $state<HTMLCanvasElement | null>(null);
  let elProgress = $state<HTMLProgressElement | null>(null);
  let elOutput = $state<HTMLPreElement | null>(null);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let processing = $state(false);
  let interpolate = $state(false);
  let filename = $state('');
  let startingIndex = $state('');
  let endingIndex = $state('');

  const createWorker = () => new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });
  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (file) {
      worker.postMessage({ type: 'file', inputFile: file, startingIndex, endingIndex });
      filename = file.name.replace(/(\.(zip|csv|json))+$/, '');
    }
  });

  let pendingUpdate = false;
  worker.addEventListener('message', (e) => {
    switch (e.data.type) {
      case 'complete':
        elProgress!.value = elProgress!.max;
        elOutput!.textContent += `Finished rendering!\n`;
        processing = false;
        return;
      case 'progress':
        pendingUpdate = false;
        elProgress!.max = e.data.totalFramesToGenerate;
        elProgress!.value = e.data.totalFramesGenerated;
        return;
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
        canvas,
        interpolate,
        filename,
      },
      [canvas],
    );

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
    elOutput!.textContent = '';
    file = undefined;
  }

  onMount(async () => {
    // NOTE: web workers can't render SVGs, even though the spec says they should
    // so we rendering them in the UI thread here to a bitmap, and pass that to the worker
    // See: https://stackoverflow.com/a/79196371/5552584
    const sendBitmap = (name: string, image: ImageBitmap) =>
      worker.postMessage({ type: 'image', name, image }, [image]);
    sendBitmap('roll', await RasterImage.create('./src/assets/roll.svg').then((img) => img.bitmap(200, 180)));
    sendBitmap('pitch', await RasterImage.create('./src/assets/pitch.svg').then((img) => img.bitmap(500, 500)));

    // in dev mode show a preview
    if (import.meta.env.DEV && elDevDemoCanvas) {
      elDevDemoCanvas.width = WIDTH;
      elDevDemoCanvas.height = HEIGHT;

      const offscreen = elDevDemoCanvas.transferControlToOffscreen();
      worker.postMessage({ type: 'draw', offscreen, data: demoRows[124]! }, [offscreen]);
    }
  });
</script>

<div>
  <p>Currently experimental and probably doesn't work!</p>
  <p>Please note, this currently only works in chromium-based browsers since it uses the File System Access API.</p>
</div>

<Picker bind:file />
<div class="flex flex-col gap-2 p-4 justify-center">
  <Input
    class="w-1/2 m-auto"
    id="filename"
    label="Output filename (without extension)"
    type="text"
    placeholder="myRide"
    bind:value={filename}
  />
  <Input
    class="w-1/2 m-auto"
    id="startingIndex"
    label="Starting index (optional, default: 0)"
    type="number"
    placeholder="0"
    onblur={(e) => (startingIndex = e.currentTarget.value)}
  />
  <Input
    class="w-1/2 m-auto"
    id="endingIndex"
    label="Ending index (optional, default: end of file)"
    type="number"
    placeholder="0"
    onblur={(e) => (endingIndex = e.currentTarget.value)}
  />
  <Input
    class="w-1/2 m-auto"
    id="interpolate"
    type="checkbox"
    bind:checked={interpolate}
    label="Interpolate between data points (smooth transitions)"
  />
  <Button onclick={() => chooseOutputAndRender()}>choose output and render!</Button>
  <Button onclick={() => stop()}>cancel</Button>
  <Button onclick={() => clear()}>clear file</Button>
  <progress bind:this={elProgress} class="w-full"></progress>
</div>
<div class="flex flex-row gap-2">
  <pre bind:this={elOutput} class="h-[640px] max-h-[640px] w-full grow overflow-y-auto border"></pre>
  {#if import.meta.env.DEV}
    <canvas bind:this={elDevDemoCanvas} class="h-[640px] border"></canvas>
  {/if}
</div>
