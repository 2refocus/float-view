<script lang="ts">
  import { formatFloat } from '../lib/misc';
  import { demoFile, demoRows } from '../lib/parse/float-control';
  import type { RowWithIndex } from '../lib/parse/types';
  import settings from '../lib/settings.svelte';
  import Button from './Button.svelte';
  import { ChartColours } from './Chart';
  import List from './List.svelte';
  import PickerFull from './PickerFull.svelte';
  import SettingsModal from './SettingsModal.svelte';
  import Speedometer from './Speedometer.svelte';

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

  function save() {
    // FIXME: convert everything below to an SVG first, so we can get a reference to it, then:
    // save svg innerHTML, render it to a canvas, save the canvas as an image
    // then, save the duration of the tick, and save that
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
  <Button onclick={() => save()}>save</Button>
  <pre>Time till next update: {timeTillNextUpdate}ms</pre>
</div>

{#snippet configureButton()}
  <Button onclick={() => (settings.open = true)}>set</Button>
{/snippet}

{#if file}
  {@const row = rows[currentIdx]!}
  <div class="border">
    <div class=" flex align-center justify-center">
      <div class="w-8/12">
        <Speedometer title="Speed" min={0} max={50} value={row.speed} formatAsFloat />
        <Speedometer title="Duty Cycle" min={0} max={100} step={20} value={row.duty} />
      </div>
    </div>
    <div class=" flex align-center justify-center">
      <List
        items={[
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
          '-',
          { label: 'Temp Motor', value: `${formatFloat(row.temp_motor)}°C`, color: ChartColours.TempMotor },
          { label: 'Temp Controller', value: `${formatFloat(row.temp_mosfet)}°C`, color: ChartColours.TempMosfet },
          '-',
          {
            label: 'Spec',
            value: settings.batterySpecs.cellCount ? `${settings.batterySpecs.cellCount}S` : configureButton,
          },
          '-',
          {
            label: 'Batt V (total)',
            value: `${formatFloat(row.voltage)} V`,
            color: ChartColours.BatteryVoltage,
          },
          {
            label: 'Batt V (cell)',
            value: `${voltsPerCell ? voltsPerCell.toFixed(1) : '??'} V`,
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
          '-',
          {
            label: 'Index',
            value: (row.index + 1).toString(),
            htmlTitle: 'Line number from the CSV file, or the specific log from the JSON file',
          },
        ]}
      />
    </div>
  </div>
{/if}
