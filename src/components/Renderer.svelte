<script lang="ts">
  import { onMount } from 'svelte';
  import { HEIGHT, WIDTH } from './Renderer.common';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import { draw } from './Renderer.draw';
  import Picker from './Picker.svelte';
  import Button from './Button.svelte';

  let devDemoCanvas = $state<HTMLCanvasElement | null>(null);
  let progress = $state<HTMLProgressElement | null>(null);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let output = $state('');
  let complete = $state(false);

  const createWorker = () => new Worker(new URL('./Renderer.worker.ts', import.meta.url), { type: 'module' });
  let worker = createWorker();

  worker.addEventListener('message', (e) => {
    switch (e.data.type) {
      case 'complete':
        output += `Finished rendering!\n`;
        complete = true;
        return;
      case 'progress':
        if (progress) {
          progress.max = e.data.totalFramesToGenerate;
          progress.value = e.data.totalFramesGenerated;
        }
        return;
      case 'log':
        output += e.data.message + '\n';
        return;
      default:
        console.warn('Unknown message from worker', e.data);
        return;
    }
  });

  async function chooseOutputAndRender() {
    const outputDirectoryHandle = await (window as any).showDirectoryPicker({
      id: 'output',
      mode: 'readwrite',
      startIn: 'videos',
    });

    const canvas = document.createElement('canvas');
    const offscreen = canvas.transferControlToOffscreen();
    complete = false;
    worker.postMessage(
      {
        type: 'start',
        inputFile: file,
        outputDirectoryHandle,
        canvas: offscreen,
      },
      [offscreen],
    );

    while (!complete) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      worker.postMessage({ type: 'update' });
    }
  }

  function stop() {
    worker.postMessage({ type: 'stop' });
    output += `Cancelled!\n`;
    complete = true;
  }

  onMount(() => {
    if (import.meta.env.DEV && devDemoCanvas) {
      devDemoCanvas.width = WIDTH;
      devDemoCanvas.height = HEIGHT;
      const ctx = devDemoCanvas.getContext('2d');
      if (ctx) {
        draw(devDemoCanvas, ctx, demoRows[50]!);
      }
    }
  });
</script>

{#if import.meta.env.DEV}
  <canvas bind:this={devDemoCanvas}></canvas>
{/if}

<Picker bind:file />
<Button onclick={() => chooseOutputAndRender()}>choose output and render!</Button>
<Button onclick={() => stop()}>cancel</Button>
<progress bind:this={progress}></progress>
<pre>{output}</pre>
