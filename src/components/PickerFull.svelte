<script module lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  export interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    file?: File;
    loading?: boolean;
  }
</script>

<script lang="ts">
  import riderSvg from '../assets/rider-icon.svg?raw';
  import Modal from './Modal.svelte';
  import Picker from './Picker.svelte';

  let { file = $bindable(), loading = $bindable(), ...otherProps }: Props = $props();
</script>

{#if !file}
  <Picker bind:file {...otherProps} />
{:else if loading}
  <Modal open closable={false} title="Loading...">
    <div>
      <h3 class="font-bold mb-4 animate-bounce">Parsing your ride...</h3>
      <div class="inline-block animate-spin">
        {@html riderSvg}
      </div>
    </div>
  </Modal>
{/if}
