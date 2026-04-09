import { describe, expect, test, vi, beforeEach } from 'vitest';
import { VideoSegmentManager } from './data';
import { type RowWithIndex, RowKey, empty } from '../../lib/parse/types';

// Mock self.postMessage used by the log() helper
vi.stubGlobal('postMessage', vi.fn());

function makeRow(index: number, overrides: Partial<RowWithIndex> = {}): RowWithIndex {
  return { ...empty, index, ...overrides };
}

describe('VideoSegmentManager.processDataIntoSegments', () => {
  let manager: VideoSegmentManager;

  beforeEach(() => {
    manager = new VideoSegmentManager();
    vi.mocked(postMessage).mockClear();
  });

  test('segments normal data with valid times', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: 0 }),
      makeRow(1, { time: 1 }),
      makeRow(2, { time: 2 }),
    ];

    manager.processDataIntoSegments(data);

    expect(manager.getSegmentCount()).toBe(1);
    expect(manager.getSegments()[0]!.data).toHaveLength(3);
  });

  test('filters out rows with undefined time values', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: 0 }),
      makeRow(1, { time: undefined as unknown as number }),
      makeRow(2, { time: 2 }),
      makeRow(3, { time: 3 }),
    ];

    manager.processDataIntoSegments(data);

    expect(manager.getSegmentCount()).toBe(1);
    const segment = manager.getSegments()[0]!;
    // The row with undefined time should have been filtered out
    expect(segment.data).toHaveLength(3);
    expect(segment.data.map((r) => r.index)).toEqual([0, 2, 3]);
  });

  test('filters out null rows', () => {
    const data = [
      makeRow(0, { time: 0 }),
      null as unknown as RowWithIndex,
      makeRow(2, { time: 2 }),
    ];

    manager.processDataIntoSegments(data);

    expect(manager.getSegmentCount()).toBe(1);
    expect(manager.getSegments()[0]!.data).toHaveLength(2);
  });

  test('detects pause gaps after filtering', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: 0 }),
      makeRow(1, { time: 1 }),
      makeRow(2, { time: undefined as unknown as number }),
      makeRow(3, { time: 100 }), // gap > 60s threshold
      makeRow(4, { time: 101 }),
    ];

    manager.processDataIntoSegments(data);

    expect(manager.getSegmentCount()).toBe(2);
    expect(manager.getSegments()[0]!.data.map((r) => r.index)).toEqual([0, 1]);
    expect(manager.getSegments()[1]!.data.map((r) => r.index)).toEqual([3, 4]);
  });

  test('handles all rows having missing time (produces no segments)', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: undefined as unknown as number }),
      makeRow(1, { time: undefined as unknown as number }),
    ];

    manager.processDataIntoSegments(data);

    expect(manager.getSegmentCount()).toBe(0);
  });

  test('respects startingIndex and endingIndex', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: 0 }),
      makeRow(1, { time: 1 }),
      makeRow(2, { time: 2 }),
      makeRow(3, { time: 3 }),
      makeRow(4, { time: 4 }),
    ];

    manager.processDataIntoSegments(data, 1, 4);

    expect(manager.getSegmentCount()).toBe(1);
    expect(manager.getSegments()[0]!.data.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  test('does not crash on toFixed when times are missing', () => {
    const data: RowWithIndex[] = [
      makeRow(0, { time: undefined as unknown as number }),
      makeRow(1, { time: undefined as unknown as number }),
      makeRow(2, { time: 5 }),
      makeRow(3, { time: 6 }),
    ];

    // This should not throw — the original bug
    expect(() => manager.processDataIntoSegments(data)).not.toThrow();
  });
});
