<script lang="ts" module>
  import type { HTMLInputAttributes } from 'svelte/elements';
  export interface Props extends HTMLInputAttributes {
    id: string;
    label: string;
    inline?: boolean;
    defaultValue?: string;
  }
</script>

<script lang="ts">
  let {
    id,
    label,
    type,
    defaultValue,
    value = $bindable(defaultValue),
    checked = $bindable(),
    title = label,
    inline = false,
    class: propClass,
    ...rest
  }: Props = $props();

  let alignClass = $derived(type === 'number' ? 'text-right' : 'text-left');
</script>

<div class="{inline ? 'inline-flex' : 'flex'} flex-row space-between {propClass}">
  <label class="grow text-left truncate select-none cursor-pointer" {title} for={id}>{label}:</label>
  {#if type === 'checkbox'}
    <input
      class="bg-slate-900 border rounded px-2 py min-w-6 cursor-pointer"
      {...rest}
      {id}
      type="checkbox"
      bind:checked
    />
  {:else}
    <input class="bg-slate-900 border rounded px-2 py min-w-24 {alignClass}" {...rest} {id} bind:value />
  {/if}
</div>
