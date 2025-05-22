import { DataSource, State, type RowWithIndex, RowKey } from '../lib/parse/types';
import settings from '../lib/settings.svelte';
import type { PointOfInterest } from './Map';

export const RIDE_GAP_THRESHOLD_SECONDS = 60;
export const CHARGE_THRESHOLD_SECONDS = 600;
const DEFAULT_CHARGE_THRESHOLD_VOLTS = 2.5;

export const getChargeThreshold = () => {
  if (!settings.cellCount || !settings.cellMinVolt || !settings.cellMaxVolt) {
    return DEFAULT_CHARGE_THRESHOLD_VOLTS;
  }

  const maxVoltage = settings.cellCount * settings.cellMaxVolt;
  const minVoltage = settings.cellCount * settings.cellMinVolt;
  return (maxVoltage - minVoltage) * 0.1;
};

export interface GpsGap {
  index: number;
  secondsElapsed: number;
}

export function computeTimePositions(visibleRows: RowWithIndex[], gpsGaps: GpsGap[], useTimeScale: boolean): number[] {
  if (!useTimeScale) {
    console.log(visibleRows.length);
    return visibleRows.map((_, i) => (100 / visibleRows.length) * (i + 0.5));
  }

  const times = visibleRows.map((row) => row[RowKey.Time]);
  const timeSlices = gpsGaps.map(({ index }, i) => {
    const endIndex = i == gpsGaps.length - 1 ? undefined : gpsGaps[i + 1]!.index;
    return times.slice(index, endIndex);
  });

  const normalisedSlices = timeSlices.map((times) => {
    const start = Math.min(...times);
    const end = Math.max(...times);
    const size = end - start;
    return times.map((time) => (time - start) / size);
  });

  const sliceSize = 100 / gpsGaps.length;
  return normalisedSlices.flatMap((slice, i) => slice.map((x) => x * sliceSize + i * sliceSize));
}

export function extractGpsInformation(rows: RowWithIndex[], source: DataSource) {
  const gpsPoints: [number, number][] = [];

  // TODO: verify paused sessions from Floaty
  const gpsGaps: GpsGap[] = [{ index: 0, secondsElapsed: 0 }];
  for (let i = 0; i < rows.length; ++i) {
    const prev = rows[i - 1];
    const curr = rows[i]!;

    gpsPoints.push([curr.gps_latitude, curr.gps_longitude]);
    if (prev) {
      const secondsElapsed = curr.time - prev.time;
      if (secondsElapsed > RIDE_GAP_THRESHOLD_SECONDS) {
        gpsGaps.push({ index: i, secondsElapsed });
      }
    }
  }

  // When Float Control starts recording a ride, it appears that the first few data points
  // have incorrect GPS data. If it's the start of the ride, it's (0, 0), but if it's a resumed
  // ride, then it seems to be the last known point from the paused ride.
  // Either way, here we attempt to find the first "good" point and use that instead.
  if (source === DataSource.FloatControl) {
    for (let i = 0; i < gpsGaps.length; ++i) {
      const start = gpsGaps[i]!.index;
      const end = gpsGaps[i + 1];
      const curr = rows[start]!;
      const guessedGoodValue = rows.slice(start, end?.index).find((row) => {
        const samePoint = curr.gps_latitude === row.gps_latitude && curr.gps_longitude === row.gps_longitude;
        return row.gps_accuracy > 0 && !samePoint;
      });

      if (guessedGoodValue) {
        for (let j = start; j < guessedGoodValue.index; ++j) {
          gpsPoints[j] = [guessedGoodValue.gps_latitude, guessedGoodValue.gps_longitude];
        }
      }
    }
  }

  return { gpsPoints, gpsGaps };
}

export function findPointsOfInterest(rows: RowWithIndex[]): PointOfInterest[] {
  const points: PointOfInterest[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    let states: string[] = [];

    // fault from VESC
    if (row.state !== 'riding') {
      states.push(row.state);
    }

    // custom footpad faults
    if (row.speed > 2) {
      const combinedAdcVoltage = row.adc1 + row.adc2;
      if (combinedAdcVoltage < 2) {
        states.push(State.Custom_NoFootpadsAtSpeed);
      } else if (combinedAdcVoltage < 4) {
        states.push(State.Custom_OneFootpadAtSpeed);
      }
    }

    // inferred charge points
    const prevRow = rows[i - 1];
    if (prevRow !== undefined) {
      const secondsElapsed = row.time - prevRow.time;
      const voltageDifference = row.voltage - prevRow.voltage;
      if (secondsElapsed > CHARGE_THRESHOLD_SECONDS && voltageDifference > getChargeThreshold()) {
        states.push(State.Custom_ChargePoint);
      }
    }

    // SAFETY: since the enum is non-exhaustive, just check it's not in here so
    // any ones we don't know about are shown
    for (const state of states) {
      if (!settings.hiddenStates.includes(state as State)) {
        points.push({ index: i, state });
      }
    }
  }

  return points;
}
