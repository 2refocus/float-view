import { RowKey, type RowWithIndex } from '../lib/parse/types';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Font configuration - change this to update fonts throughout the renderer
const FONT_FAMILY = 'Noto Sans, Arial, sans-serif';

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
  const gaugeHeight = height * 0.45;
  const valueBoxHeight = height * 0.1;
  const valueBoxWidth = (width - 4 * padding) / 3; // Three boxes with padding

  // Draw speed gauge
  drawGauge(
    ctx,
    padding,
    padding,
    width - 2 * padding,
    gaugeHeight,
    data[RowKey.Speed],
    data[RowKey.Speed].toFixed(1),
    'Speed',
    'km/h',
    0,
    50,
  );

  // Draw duty cycle gauge
  drawGauge(
    ctx,
    padding,
    padding + gaugeHeight + padding,
    width - 2 * padding,
    gaugeHeight,
    Math.abs(data[RowKey.Duty]),
    Math.abs(data[RowKey.Duty]).toFixed(0),
    'Duty Cycle',
    '%',
    0,
    100,
  );

  // Calculate y position for value boxes
  const valueBoxY = height - valueBoxHeight - padding;

  // Draw value boxes
  drawValueBox(ctx, padding, valueBoxY, valueBoxWidth, valueBoxHeight, data[RowKey.Voltage], 'Bat V', 'V');

  drawValueBox(
    ctx,
    padding + valueBoxWidth + padding,
    valueBoxY,
    valueBoxWidth,
    valueBoxHeight,
    data[RowKey.CurrentBattery],
    'Current Bat',
    'A',
  );

  drawValueBox(
    ctx,
    padding + 2 * (valueBoxWidth + padding),
    valueBoxY,
    valueBoxWidth,
    valueBoxHeight,
    data[RowKey.CurrentMotor],
    'Current Motor',
    'A',
  );
}

function drawGauge(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  valueStr: string,
  label: string,
  unit: string,
  minValue: number,
  maxValue: number,
) {
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
  ctx.font = getFont(Math.max(12, width * 0.04));
  ctx.fillText(label, centerX, y + height * 0.03);

  ctx.font = getFont(Math.max(16, width * 0.06), 'bold');
  ctx.fillText(`${valueStr} ${unit}`, centerX, centerY + radius * -0.2);

  // Draw min/max labels
  ctx.font = getFont(Math.max(10, width * 0.025));
  ctx.fillStyle = '#cccccc';
  ctx.textAlign = 'left';
  ctx.fillText(minValue.toString(), centerX - radius * 0.5, centerY + radius * 0.7);
  ctx.textAlign = 'right';
  ctx.fillText(maxValue.toString(), centerX + radius * 0.5, centerY + radius * 0.7);
}

function drawValueBox(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
  label: string,
  unit: string,
) {
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
