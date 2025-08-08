<script lang="ts">
  import { onMount } from 'svelte';
  import { HEIGHT, WIDTH } from './Renderer.common';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import { draw } from './Renderer.draw';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';
  import Input from './Input.svelte';

  let elDevDemoCanvas = $state<HTMLCanvasElement | null>(null);
  let elProgress = $state<HTMLProgressElement | null>(null);
  let elOutput = $state<HTMLPreElement | null>(null);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let processing = $state(false);
  let interpolate = $state(false);

  const createWorker = () => new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });
  let worker = createWorker();

  // when file changes, send it to the worker
  $effect(() => {
    if (file) {
      worker.postMessage({ type: 'file', inputFile: file });
    }
  });

  worker.addEventListener('message', (e) => {
    switch (e.data.type) {
      case 'complete':
        elOutput!.textContent += `Finished rendering!\n`;
        processing = false;
        return;
      case 'progress':
        if (elProgress) {
          elProgress.max = e.data.totalFramesToGenerate;
          elProgress.value = e.data.totalFramesGenerated;
        }
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
    const outputDirectoryHandle = await window.showDirectoryPicker({
      id: 'output',
      mode: 'readwrite',
      startIn: 'videos',
    });

    const canvas = document.createElement('canvas');
    const offscreen = canvas.transferControlToOffscreen();
    processing = true;
    worker.postMessage(
      {
        type: 'start',
        outputDirectoryHandle,
        canvas: offscreen,
        interpolate,
      },
      [offscreen],
    );

    while (processing) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      worker.postMessage({ type: 'update' });
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

  onMount(() => {
    if (import.meta.env.DEV && elDevDemoCanvas) {
      elDevDemoCanvas.width = WIDTH;
      elDevDemoCanvas.height = HEIGHT;
      const ctx = elDevDemoCanvas.getContext('2d');
      if (ctx) {
        draw(elDevDemoCanvas, ctx, demoRows[50]!);
      }
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
