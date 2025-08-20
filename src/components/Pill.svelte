<script lang="ts" module>
  export interface Props {
    text: string;
    appearance: 'amber' | 'lime' | 'rose';
    class?: string;
  }
</script>

<script lang="ts">
  let { appearance, text, class: propClass }: Props = $props();

  const colorMap = {
    amber: 'bg-amber-900 text-amber-300 border-amber-700',
    lime: 'bg-lime-900 text-lime-300 border-lime-700',
    rose: 'bg-rose-900 text-rose-300 border-rose-700',
  };
</script>

<span
  class="{propClass} inline-block px-2 py-0.5 rounded-full {colorMap[
    appearance
  ]} text-xs font-semibold uppercase tracking-wide border shadow-sm inline-flex items-center"
>
  {text}
</span>
