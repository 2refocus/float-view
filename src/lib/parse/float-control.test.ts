import { beforeEach, describe, expect, test, vi } from 'vitest';

import csvMetric from './__fixtures__/fc_metric.csv?raw';
import csvMetricWithBms from './__fixtures__/fc_metric_bms.csv?raw';
import csvImperial from './__fixtures__/fc_imperial.csv?raw';
import csvImperialWithBms from './__fixtures__/fc_imperial_bms.csv?raw';
import csvWithUnknownState from './__fixtures__/fc_metric_unknown_state.csv?raw';
import csvWithBadtime from './__fixtures__/fc_metric_bad_time.csv?raw';
import csvParseErrors from './__fixtures__/fc_parse_errors.csv?raw';
import csvWithAds from './__fixtures__/fc_with_ads.csv?raw';
import { parseFloatControlCsv } from './float-control';
import { defaultBms, defaultFixture } from './__fixtures__/fixture';
import { FloatControlLimitedError, ParseError } from './errors';

describe(parseFloatControlCsv.name, () => {
  beforeEach(() => vi.restoreAllMocks());

  test('metric', async () => {
    const { units, csv, errors } = await parseFloatControlCsv(csvMetric);
    expect(errors).toEqual([]);
    expect(units).toBe('metric');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([defaultFixture]);
  });

  test('metric with bms', async () => {
    const { units, csv, errors } = await parseFloatControlCsv(csvMetricWithBms);
    expect(errors).toEqual([]);
    expect(units).toBe('metric');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([{ ...defaultFixture, ...defaultBms }]);
  });

  test('imperial', async () => {
    const { units, csv, errors } = await parseFloatControlCsv(csvImperial);
    expect(errors).toEqual([]);
    expect(units).toBe('imperial');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([defaultFixture]);
  });

  test('imperial with bms', async () => {
    const { units, csv, errors } = await parseFloatControlCsv(csvImperialWithBms);
    expect(errors).toEqual([]);
    expect(units).toBe('imperial');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([{ ...defaultFixture, ...defaultBms }]);
  });

  test('with unknown state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();
    const { units, csv, errors } = await parseFloatControlCsv(csvWithUnknownState);
    expect(errors).toEqual([]);
    expect(units).toBe('metric');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([{ ...defaultFixture, state: 'some_new_state' }]);
    expect(warnSpy).toHaveBeenCalledWith("Unknown state: 'SOME_NEW_STATE'");
  });

  test('with bad time', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockReturnValue();
    const { units, csv, errors } = await parseFloatControlCsv(csvWithBadtime);
    expect(errors).toEqual([]);
    expect(units).toBe('metric');
    expect(csv.errors).toEqual([]);
    expect(csv.data).toEqual([{ ...defaultFixture, time: 0 }]);
    expect(warnSpy).toHaveBeenCalledWith("Failed to parse CSV! Expected a number, but got: 'I am not a number'");
  });

  test('collapses parse errors', async () => {
    const { csv, errors } = await parseFloatControlCsv(csvParseErrors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ParseError);
    const parseError = errors[0] as ParseError;
    expect(parseError.cause).toHaveLength(1);

    expect(csv.data).toEqual([
      defaultFixture,
      {
        distance: 1.234,
        index: 1,
        speed: 0,
        state: 'this_row_has_wrong_fields',
        time: 1.23,
      },
    ]);
  });

  test('trims out advertisements', async () => {
    const { csv, errors } = await parseFloatControlCsv(csvWithAds.trim());
    expect(errors).toEqual([new FloatControlLimitedError()]);
    expect(csv.data).toEqual([defaultFixture]);
  });

  test('trims out advertisements - newlines', async () => {
    const { csv, errors } = await parseFloatControlCsv(csvWithAds.trim() + '\n');
    expect(errors).toEqual([new FloatControlLimitedError()]);
    expect(csv.data).toEqual([defaultFixture]);
  });
});
