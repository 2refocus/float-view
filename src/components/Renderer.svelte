<script lang="ts">
  import { onMount } from 'svelte';
  import { HEIGHT, WIDTH } from './Renderer.common';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import { draw } from './Renderer.draw';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';

  let elDevDemoCanvas = $state<HTMLCanvasElement | null>(null);
  let elProgress = $state<HTMLProgressElement | null>(null);
  let elOutput = $state<HTMLPreElement | null>(null);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let processing = $state(false);

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
      elDevDemoCanvas.style.width = `${WIDTH}px`;
      elDevDemoCanvas.style.height = `${HEIGHT}px`;
      const ctx = elDevDemoCanvas.getContext('2d');
      if (ctx) {
        draw(elDevDemoCanvas, ctx, demoRows[50]!);
      }
    }
  });
</script>

<div>
  <p>Please note, this currently only works in chromium-based browsers since it uses the File System Access API.</p>
</div>

<Picker bind:file />
<Button onclick={() => chooseOutputAndRender()}>choose output and render!</Button>
<Button onclick={() => stop()}>cancel</Button>
<Button onclick={() => clear()}>clear file</Button>
<progress bind:this={elProgress}></progress>
<div class="flex flex-row gap-2">
  <pre bind:this={elOutput} class="h-[640px] max-h-[640px] w-full grow overflow-y-auto border"></pre>
  {#if import.meta.env.DEV}
    <canvas bind:this={elDevDemoCanvas} class="border"></canvas>
  {/if}
</div>
