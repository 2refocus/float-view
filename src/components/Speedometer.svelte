<script lang="ts">
  import { formatFloat } from '../lib/misc';
  import { type Props } from './Speedometer';

  let {
    min,
    max,
    value,
    formatAsFloat = false,
    redlineThresholdPct = 0.8,
    step = 10,
    title = '',
    arcColor = 'white',
    mainTickColor = 'white',
    miniTickColor = 'grey',
    needleColor = 'red',
    tickLabelColor = 'white',
    titleColor = 'white',
  }: Props = $props();
  let tickCount = $derived(Math.floor((max - min) / step));

  const getTicks = (count: number) => new Array(count + 1).fill(0).map((_, i) => (i * 180) / count);

  let mainTicks = $derived(getTicks(tickCount));
  let miniTicks = $derived(getTicks(tickCount * step));

  // TODO: would be awesome to show a live graph of historical values just underneath the speedometer
</script>

<svg version="1.1" viewBox="0 0 100 80" role="graphics-object" xmlns="http://www.w3.org/2000/svg">
  <!-- title -->
  <text x="50" y="42" fill={titleColor} font-size="5" text-anchor="middle">
    {title}
  </text>

  <!-- small ticks -->
  {#each miniTicks as degrees, i}
    <line
      x1="50"
      y1="10"
      x2="50"
      y2="15"
      stroke={i / miniTicks.length > redlineThresholdPct ? 'red' : miniTickColor}
      stroke-width="0.25"
      transform="rotate({degrees - 90} 50 50)"
    />
  {/each}

  <!-- large ticks -->
  {#each mainTicks as degrees, i}
    <line
      x1="50"
      y1="10"
      x2="50"
      y2="20"
      stroke={i / mainTicks.length > redlineThresholdPct ? 'red' : mainTickColor}
      stroke-width="0.5"
      transform="rotate({degrees - 90} 50 50)"
    />
  {/each}

  <!-- arc -->
  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={arcColor} stroke-width="1" />

  <!-- needle -->
  <polygon
    points="49.75,15 50.25,15 51.25,50 48.75,50"
    fill={needleColor}
    transform="rotate({((value - min) / (max - min)) * 180 - 90} 50 50)"
  />

  <!-- labels -->
  {#each mainTicks as degrees, i}
    <text
      x="50"
      y="30"
      fill={i / mainTicks.length > redlineThresholdPct ? 'red' : tickLabelColor}
      font-size="4"
      text-anchor="middle"
      transform="rotate({degrees - 90} 50 50) translate(0, -5)"
    >
      {Math.round((degrees / 180) * (max - min) + min)}
    </text>
  {/each}

  <!-- value -->
  <text x="50" y="68" fill="white" font-size="8" text-anchor="middle">{formatFloat(value, !formatAsFloat)}</text>
  <text x="50" y="75" fill="white" font-size="4" text-anchor="middle">TODO: units</text>
</svg>
