<script lang="ts">
  import { formatFloat } from '../lib/misc';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import type { RowWithIndex } from '../lib/parse/types';
  import settings from '../lib/settings.svelte';
  import Button from './Button.svelte';
  import { ChartColours } from './Chart';
  import PickerFull from './PickerFull.svelte';
  import PlayerView from './PlayerView.svelte';
  import SettingsModal from './SettingsModal.svelte';

  let loading = $state(false);
  let file = $state<File | undefined>(import.meta.env.DEV ? demoFile : undefined);
  let rows = $state<RowWithIndex[]>(demoRows);

  let playing = $state(false);
  let currentIdx = $state(0);

  let timeTillNextUpdate = $state(0);

  // TODO: make this an option
  let maxSecondsBetweenSteps = 2;
  let maxMillisecondsBetweenSteps = $derived(maxSecondsBetweenSteps * 1000);

  let voltsPerCell = $derived.by(() => {
    const row = rows[currentIdx];
    if (!row || !settings.batterySpecs.cellCount) return NaN;
    return row.voltage / settings.batterySpecs.cellCount;
  });
  let cellVoltsLow = $derived(
    voltsPerCell && settings.batterySpecs.cellMinVolt && voltsPerCell < settings.batterySpecs.cellMinVolt,
  );

  let start = 0;

  const getNextUpdateTime = () => start + rows[currentIdx + 1]!.time * 1000;

  function next() {
    const currRow = rows[currentIdx];
    const nextRow = rows[currentIdx + 1];
    if (currRow && nextRow) {
      const step = () => {
        if (!playing) return;

        const now = Date.now();
        const nextUpdateTime = getNextUpdateTime();
        timeTillNextUpdate = nextUpdateTime - now;

        if (timeTillNextUpdate > maxMillisecondsBetweenSteps) {
          start -= timeTillNextUpdate - maxMillisecondsBetweenSteps;
        }

        if (now < nextUpdateTime) {
          return requestAnimationFrame(step);
        }

        while (now >= getNextUpdateTime() && currentIdx < rows.length - 1) {
          currentIdx++;
        }

        next();
      };

      requestAnimationFrame(step);
    }
  }

  function play() {
    if (start === 0) {
      start = Date.now();
    } else {
      const offset = rows[currentIdx + 1]!.time * 1000 - timeTillNextUpdate;
      start = Date.now() - Math.max(0, offset);
    }

    playing = true;
    next();
  }

  function pause() {
    playing = false;
  }

  function reset() {
    start = 0;
    currentIdx = 0;
    timeTillNextUpdate = 0;
    playing = false;
  }

  let svg = $state<SVGGraphicsElement | undefined>(undefined);
  function save() {
    return new Promise((resolve, reject) => {
      if (!svg) {
        return reject(new Error('No SVG element found'));
      }

      const svgXml = new XMLSerializer().serializeToString(svg);
      const svgUrl = URL.createObjectURL(new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' }));

      // const boundingBox = svg.getBBox();
      const img = new Image();
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get 2d context'));
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        resolve(canvas.toDataURL('image/png'));

        // FIXME: why is it tiny and not taking up the full canvas?
        const i = document.createElement('img');
        i.src = canvas.toDataURL('image/png');
        document.body.append(i);
      };

      img.src = svgUrl;
    });
  }

  // TODO: ability to render to and save to a video file
  //  - save duration of each 'tick' on each frame
  //  - render everything as an svg
  //  - export image with svg + time
  //  - concatenate images into a video
</script>

<SettingsModal />
<PickerFull bind:loading bind:file />
<div>Player (ALPHA - not working)</div>
<div class="flex p-4 gap-4">
  <Button onclick={() => (playing ? pause() : play())}>
    {#if playing}
      pause
    {:else}
      play
    {/if}
  </Button>
  <Button onclick={() => reset()}>reset</Button>
  <Button onclick={() => save().then(console.log)}>save</Button>
</div>
<div>
  <pre>Time till next update: {timeTillNextUpdate}ms</pre>
</div>

{#if file}
  {@const row = rows[currentIdx]!}
  <div class="border">
    <PlayerView
      bind:svg
      speedometers={[
        {
          min: 0,
          max: 50,
          value: row.speed,
          formatAsFloat: true,
        },
        {
          min: 0,
          max: 100,
          step: 20,
          value: row.duty,
        },
      ]}
      items={[
        'Motor',
        {
          label: 'Motor Current',
          value: `${formatFloat(row.current_motor)} A`,
          color: ChartColours.CurrentMotor,
        },
        ...(row.current_field_weakening !== undefined
          ? [
              {
                label: 'Field Weakening',
                value: `${formatFloat(row.current_field_weakening)} A`,
                color: ChartColours.CurrentMotor,
              },
            ]
          : []),
        'Temperatures',
        {
          label: 'Temp Motor',
          value: `${formatFloat(row.temp_motor)}°C`,
          color: ChartColours.TempMotor,
        },
        {
          label: 'Temp Controller',
          value: `${formatFloat(row.temp_mosfet)}°C`,
          color: ChartColours.TempMosfet,
        },
        'Battery',
        { label: 'Spec', value: settings.batterySpecs.cellCount ? `${settings.batterySpecs.cellCount}S` : '??' },
        {
          label: 'Batt V (total)',
          value: `${formatFloat(row.voltage)} V`,
          color: ChartColours.BatteryVoltage,
        },
        {
          label: 'Batt V (per cell)',
          value: `${formatFloat(voltsPerCell)} V`,
          color: cellVoltsLow ? 'red' : ChartColours.BatteryVoltage,
        },
        {
          label: 'Batt Current',
          value: `${formatFloat(row.current_battery)} A`,
          color: ChartColours.CurrentBattery,
        },
        {
          label: 'Batt Watts',
          value: `${formatFloat(row.current_battery * row.voltage)} W`,
        },
      ]}
    />
  </div>
{/if}
