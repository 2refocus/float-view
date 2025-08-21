import { expect, test } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import App from './View.svelte';
import floatyJson from '../lib/parse/__fixtures__/floaty.json';

// Disable dev mode for testing.
import.meta.env.DEV = false;

const startApp = () => render(App as any, {});

test('it works', () => {
  const screen = startApp();
  expect(screen.getByTestId('map')).toBeInTheDocument();
  expect(screen.getByTestId('chart_speed')).toBeInTheDocument();
  expect(screen.getByTestId('chart_duty_cycle')).toBeInTheDocument();
  expect(screen.getByTestId('chart_battery_voltage')).toBeInTheDocument();
  expect(screen.getByTestId('chart_elevation')).toBeInTheDocument();
  expect(screen.getByTestId('chart_i-motor_/_i-battery')).toBeInTheDocument();
  expect(screen.getByTestId('chart_t-motor_/_t-controller')).toBeInTheDocument();
});

class MockFile extends File {
  constructor(
    private fileParts: BlobPart[],
    fileName: string,
    options?: FilePropertyBag,
  ) {
    super(fileParts, fileName, options);
  }

  async text() {
    return this.fileParts.map((part) => part.toString()).join('');
  }
}

const createFileList = (files: File[]) =>
  ({
    ...files,
    length: files.length,
    item: (index: number) => files[index] || null,
  }) as unknown as FileList;

test('Floaty Integration', async () => {
  const screen = startApp();

  const fileInput = screen.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(fileInput).toBeInTheDocument();

  const fileInputById = screen.container.querySelector<HTMLInputElement>('#ride-file-picker')!;
  expect(fileInput).toBe(fileInputById);

  Object.defineProperty(fileInput, 'files', {
    value: createFileList([new MockFile([JSON.stringify(floatyJson)], 'floaty.json', { type: 'application/json' })]),
    writable: true,
  });

  const event = new Event('change', {
    bubbles: true,
    cancelable: true,
  });
  fileInput.dispatchEvent(event);

  // Wait for the close-ride-button to appear
  await waitFor(() => {
    expect(screen.getByTestId('close-ride-button')).toBeInTheDocument();
  });
});
