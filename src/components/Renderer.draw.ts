import { RowKey, type RowWithIndex } from '../lib/parse/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FONT_FAMILY = 'Noto Sans, Arial, sans-serif';

interface ValueBoxConfig {
  label: string;
  dataKey: RowKey;
  unit: string;
}

const VALUE_BOX_CONFIGS: ValueBoxConfig[] = [
  { label: 'Bat V', dataKey: RowKey.Voltage, unit: 'V' },
  { label: 'Current Bat', dataKey: RowKey.CurrentBattery, unit: 'A' },
  { label: 'Current Motor', dataKey: RowKey.CurrentMotor, unit: 'A' },
  { label: 'Temp MOSFET', dataKey: RowKey.TempMosfet, unit: '°C' },
  { label: 'Temp Motor', dataKey: RowKey.TempMotor, unit: '°C' },
  { label: 'Temp Battery', dataKey: RowKey.TempBattery, unit: '°C' },
];

function getFont(size: number, weight: 'normal' | 'bold' = 'normal'): string {
  return `${weight === 'bold' ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
}

export function draw(canvas: HTMLCanvasElement | OffscreenCanvas, ctx: Ctx, data: RowWithIndex) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const width = canvas.width;
  const height = canvas.height;
  const padding = width * 0.025;

  // Calculate layout dimensions
  const gaugeHeight = height * 0.4;
  const valueBoxHeight = height * 0.1;

  // Grid layout for value boxes: 3 columns, 2 rows
  const columns = 3;
  const rows = Math.ceil(VALUE_BOX_CONFIGS.length / columns);
  const valueBoxWidth = (width - (columns + 1) * padding) / columns;
  const totalValueBoxesHeight = rows * valueBoxHeight + (rows - 1) * padding;

  const gaugeWidth = width * 0.5 - 2 * padding;

  // Draw speed gauge
  drawGauge({
    label: 'Speed',
    ctx,
    x: padding,
    y: padding,
    width: gaugeWidth,
    height: gaugeHeight,
    value: data[RowKey.Speed],
    valueStr: data[RowKey.Speed].toFixed(1),
    unit: 'km/h',
    minValue: 0,
    maxValue: 50,
  });

  // Draw duty cycle gauge
  drawGauge({
    label: 'Duty Cycle',
    ctx,
    x: padding + width * 0.5,
    y: padding,
    width: gaugeWidth,
    height: gaugeHeight,
    value: Math.abs(data[RowKey.Duty]),
    valueStr: Math.abs(data[RowKey.Duty]).toFixed(0),
    unit: '%',
    minValue: 0,
    maxValue: 100,
  });

  // Calculate y position for value boxes grid
  const valueBoxGridY = height - totalValueBoxesHeight - padding;

  // Draw value boxes in a grid
  VALUE_BOX_CONFIGS.forEach((config, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;

    const x = padding + col * (valueBoxWidth + padding);
    const y = valueBoxGridY + row * (valueBoxHeight + padding);

    const value = data[config.dataKey];
    const numericValue = typeof value === 'number' ? value : 0;

    drawValueBox({
      label: config.label,
      ctx,
      x,
      y,
      width: valueBoxWidth,
      height: valueBoxHeight,
      value: numericValue,
      unit: config.unit,
    });
  });
}

interface GaugeParams {
  label: string;
  ctx: Ctx;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  valueStr: string;
  unit: string;
  minValue: number;
  maxValue: number;
}

function drawGauge({ label, ctx, x, y, width, height, value, valueStr, unit, minValue, maxValue }: GaugeParams) {
  const centerX = x + width / 2;
  const centerY = y + height * 0.45; // Position gauge arc in lower part of area
  const radius = Math.min(width, height) * 0.35;
  const startAngle = Math.PI * 0.75; // Start at 135 degrees
  const endAngle = Math.PI * 0.25; // End at 45 degrees
  const angleRange = endAngle - startAngle + 2 * Math.PI;

  // Draw gauge background arc
  ctx.strokeStyle = '#404040';
  ctx.lineWidth = radius * 0.15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  // Calculate value position
  const normalizedValue = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  const valueAngle = startAngle + normalizedValue * angleRange;

  // Draw gauge value arc
  ctx.strokeStyle = normalizedValue > 0.8 ? '#ff6666' : normalizedValue > 0.6 ? '#ffcc66' : '#66ff66';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, valueAngle);
  ctx.stroke();

  // Draw gauge needle
  const needleLength = radius * 0.9;
  const needleX = centerX + Math.cos(valueAngle) * needleLength;
  const needleY = centerY + Math.sin(valueAngle) * needleLength;

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(needleX, needleY);
  ctx.stroke();

  // Draw center dot
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.05, 0, 2 * Math.PI);
  ctx.fill();

  // Draw labels
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = getFont(Math.max(12, width * 0.08));
  ctx.fillText(label, centerX, y + height * 0.08);

  ctx.font = getFont(Math.max(16, width * 0.06), 'bold');
  ctx.fillText(`${valueStr} ${unit}`, centerX, centerY + radius * -0.2);

  // Draw min/max labels
  ctx.font = getFont(Math.max(10, width * 0.075));
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'left';
  ctx.fillText(minValue.toString(), centerX - radius * 0.5, centerY + radius * 0.7);
  ctx.textAlign = 'right';
  ctx.fillText(maxValue.toString(), centerX + radius * 0.5, centerY + radius * 0.7);
}

interface ValueBoxParams {
  label: string;
  ctx: Ctx;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  unit: string;
}

function drawValueBox({ label, ctx, x, y, width, height, value, unit }: ValueBoxParams) {
  // Draw box border
  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Draw box background
  ctx.fillStyle = '#2d3748';
  ctx.fillRect(x, y, width, height);

  // Draw label
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'center';
  ctx.font = getFont(Math.max(10, width * 0.08));
  ctx.fillText(label, x + width / 2, y + height * 0.35);

  // Draw value
  ctx.fillStyle = '#ffffff';
  ctx.font = getFont(Math.max(14, width * 0.12), 'bold');
  const displayValue = Math.abs(value) < 0.1 ? value.toFixed(2) : value.toFixed(1);
  ctx.fillText(`${displayValue} ${unit}`, x + width / 2, y + height * 0.75);
}
