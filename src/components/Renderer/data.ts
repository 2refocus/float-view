import { type RowWithIndex, RowKey } from '../../lib/parse/types';
import { log } from './messaging';

export class VideoFrameData {
  constructor(public readonly data: RowWithIndex[]) {
    if (!Array.isArray(data) || data.length < 2) {
      console.warn({ csvData: data });
      throw new Error('Invalid CSV data provided');
    }
  }

  startTime() {
    return this.data[0]![RowKey.Time];
  }

  endTime() {
    return this.data[this.data.length - 1]![RowKey.Time];
  }
}

export class VideoSegmentManager {
  private videos: VideoFrameData[] = [];

  clear(): void {
    this.videos.length = 0;
  }

  addSegment(csvData: RowWithIndex[]): void {
    if (csvData.length > 1) {
      this.videos.push(new VideoFrameData(csvData));
    }
  }

  getSegments(): VideoFrameData[] {
    return this.videos;
  }

  getSegmentCount(): number {
    return this.videos.length;
  }

  processDataIntoSegments(
    data: RowWithIndex[],
    startingIndex: number = 0,
    endingIndex: number = data.length,
    gapThresholdSecs: number = 60,
  ): void {
    this.clear();

    log('Scanning CSV for ride segments...');

    // Filter out rows with missing Time data
    const validData = data.slice(startingIndex, endingIndex).filter((row) => {
      return row != null && typeof row[RowKey.Time] === 'number';
    });

    if (validData.length !== endingIndex - startingIndex) {
      log(`Filtered out ${endingIndex - startingIndex - validData.length} rows with missing time data.`);
    }

    let lastIndex = 0;
    for (let i = 1; i < validData.length; i++) {
      const prev = validData[i - 1]!;
      const currentData = validData[i]!;
      // if the time difference is more than the threshold, we assume a pause
      if (currentData[RowKey.Time] - prev[RowKey.Time] > gapThresholdSecs) {
        const slice = validData.slice(lastIndex, i);
        if (slice.length > 1) {
          log(`Detected pause at ${currentData[RowKey.Time]}s`);
          this.addSegment(slice);
        }
        lastIndex = i;
      }
    }

    if (lastIndex < validData.length) {
      const slice = validData.slice(lastIndex);
      this.addSegment(slice);
    }

    log(
      [
        `Found ${this.getSegmentCount()} segments.`,
        ...this.getSegments().map((segment, i) => {
          const start = segment.startTime();
          const end = segment.endTime();
          if (start == null || end == null) {
            return `    ${i + 1}: <missing time data>`;
          }
          const endPlusOne = end + 1;
          const duration = (endPlusOne - start).toFixed(2);
          return [
            `    ${i + 1}: ${start.toFixed(2)}s to ${endPlusOne.toFixed(2)}s`,
            `        - duration: ${duration}s`,
            `        - at index: ${segment.data[0]!.index}`,
          ].join('\n');
        }),
      ].join('\n'),
    );
  }
}

const NUMERIC_KEYS: (keyof RowWithIndex)[] = [
  RowKey.Adc1,
  RowKey.Adc2,
  RowKey.Ah,
  RowKey.AhCharged,
  RowKey.Altitude,
  RowKey.BmsFault,
  RowKey.BmsTemp,
  RowKey.BmsTempBattery,
  RowKey.CurrentBattery,
  RowKey.CurrentBooster,
  RowKey.CurrentFieldWeakening,
  RowKey.CurrentMotor,
  RowKey.Distance,
  RowKey.Duty,
  RowKey.Erpm,
  RowKey.GpsAccuracy,
  RowKey.GpsLatitude,
  RowKey.GpsLongitude,
  RowKey.MotorFault,
  RowKey.Pitch,
  RowKey.RequestedAmps,
  RowKey.Roll,
  RowKey.Setpoint,
  RowKey.SetpointAtr,
  RowKey.SetpointBreakTilt,
  RowKey.SetpointCarve,
  RowKey.SetpointRemote,
  RowKey.SetpointTorqueTilt,
  RowKey.Speed,
  RowKey.StateRaw,
  RowKey.TempBattery,
  RowKey.TempMosfet,
  RowKey.TempMotor,
  RowKey.Time,
  RowKey.TruePitch,
  RowKey.Voltage,
  RowKey.Wh,
  RowKey.WhCharged,
];

export function interpolate(dataA: RowWithIndex, dataB: RowWithIndex, progress: number): RowWithIndex {
  // Progress should be between 0 and 1, where 0 = dataA and 1 = dataB
  progress = Math.max(0, Math.min(1, progress));

  const interpolated: RowWithIndex = { ...dataA };

  // Interpolate all numeric fields
  for (const key of NUMERIC_KEYS) {
    const valueA = dataA[key] as number | undefined;
    const valueB = dataB[key] as number | undefined;

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      (interpolated as any)[key] = valueA + (valueB - valueA) * progress;
    } else if (typeof valueA === 'number') {
      (interpolated as any)[key] = valueA;
    } else if (typeof valueB === 'number') {
      (interpolated as any)[key] = valueB;
    }
  }

  // For non-numeric fields like State, use the closest data point
  interpolated[RowKey.State] = progress < 0.5 ? dataA[RowKey.State] : dataB[RowKey.State];
  interpolated.index = progress < 0.5 ? dataA.index : dataB.index;

  return interpolated;
}
