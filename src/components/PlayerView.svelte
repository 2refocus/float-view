<script lang="ts">
  import { formatFloat } from '../lib/misc';
  import { type Props } from './PlayerView';

  let { speedometers, items, svg = $bindable() }: Props = $props();
  // @ts-expect-error doesn't understand the svelte @const directive
  const getSpeedoTicks = (count: number) => new Array(count + 1).fill(0).map((_, i) => (i * 180) / count);

  const speedoSize = 75;
  const gap = 5;
  const itemSize = 5;

  const totalSpeedoSize = speedometers.length * speedoSize;
  const totalItemSize = items.length * itemSize;
  const totalHeight = totalSpeedoSize + gap + totalItemSize;

  function init(node: SVGGraphicsElement) {
    svg = node;
    svg;
  }

  // TODO: would be awesome to show a live graph of historical values just underneath each speedometer
</script>

<svg version="1.1" viewBox="0 0 100 {totalHeight}" role="graphics-object" xmlns="http://www.w3.org/2000/svg" use:init>
  {#each speedometers as speedo, i}
    {@const step = speedo.step ?? 10}
    {@const tickCount = Math.floor((speedo.max - speedo.min) / step)}
    {@const getSpeedoTicks = (count: number) => new Array(count + 1).fill(0).map((_, i) => (i * 180) / count)}
    {@const mainTicks = getSpeedoTicks(tickCount)}
    {@const miniTicks = getSpeedoTicks(tickCount * step)}
    {@const redlineThreshold = speedo.redlineThresholdPct ?? 0.8}
    {@const pos = speedoSize * i}
    <g>
      <!-- title -->
      <text x="50" y={pos + 42} fill={speedo.titleColor ?? 'white'} font-size="5" text-anchor="middle">
        {speedo.title ?? ''}
      </text>

      <!-- small ticks -->
      {#each miniTicks as degrees, i}
        <line
          x1="50"
          y1={pos + 10}
          x2="50"
          y2={pos + 15}
          stroke={i / miniTicks.length > redlineThreshold ? 'red' : (speedo.miniTickColor ?? 'grey')}
          stroke-width="0.25"
          transform="rotate({degrees - 90} 50 {pos + 50})"
        />
      {/each}

      <!-- large ticks -->
      {#each mainTicks as degrees, i}
        <line
          x1="50"
          y1={pos + 10}
          x2="50"
          y2={pos + 20}
          stroke={i / mainTicks.length > redlineThreshold ? 'red' : (speedo.mainTickColor ?? 'white')}
          stroke-width="0.5"
          transform="rotate({degrees - 90} 50 {pos + 50})"
        />
      {/each}

      <!-- arc -->
      <path
        d="M 10 {pos + 50} A 40 40 0 0 1 90 {pos + 50}"
        fill="none"
        stroke={speedo.arcColor ?? 'white'}
        stroke-width="1"
      />

      <!-- needle -->
      <polygon
        points="15,{pos + 49.75} 15,{pos + 50.25} 50,{pos + 51.25} 50,{pos + 48.75}"
        fill={speedo.needleColor ?? 'red'}
        transform="rotate({((speedo.value - speedo.min) / (speedo.max - speedo.min)) * 180} 50 {pos + 50})"
      />

      <!-- labels -->
      {#each mainTicks as degrees, i}
        <text
          x="50"
          y={pos + 30}
          fill={i / mainTicks.length > redlineThreshold ? 'red' : (speedo.tickLabelColor ?? 'white')}
          font-size="4"
          text-anchor="middle"
          transform="rotate({degrees - 90} 50 {pos + 50}) translate(0, -5)"
        >
          {Math.round((degrees / 180) * (speedo.max - speedo.min) + speedo.min)}
        </text>
      {/each}

      <!-- value -->
      <text x="50" y={pos + 68} fill="white" font-size="8" text-anchor="middle"
        >{formatFloat(speedo.value, !speedo.formatAsFloat)}</text
      >
      <text x="50" y={pos + 75} fill="white" font-size="4" text-anchor="middle">TODO: units</text>
    </g>
  {/each}

  {#each items as item, i}
    {@const pos = totalSpeedoSize + gap + i * itemSize}
    {#if typeof item === 'string'}
      <text x="2" y={pos} fill="grey" font-size="2.5" text-anchor="start" font-family="monospace">{item}</text>
      <line x1="2" y1={pos + 0.5} x2="98" y2={pos + 0.5} stroke="grey" stroke-width="0.15" />
    {:else}
      <text x="5" y={pos} fill={item.color ?? 'white'} font-size="3.5" text-anchor="start" font-family="monospace">
        {item.label}
      </text>
      <text x="98" y={pos} fill={item.color ?? 'white'} font-size="3.5" text-anchor="end" font-family="monospace">
        {item.value}
      </text>
    {/if}
  {/each}
</svg>
