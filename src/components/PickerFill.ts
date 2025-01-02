import type { HTMLAttributes } from 'svelte/elements';

export interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  file?: File;
  loading?: boolean;
}
