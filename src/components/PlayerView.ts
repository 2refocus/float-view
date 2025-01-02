export interface SpeedometerProps {
  min: number;
  max: number;
  value: number;

  arcColor?: string;
  mainTickColor?: string;
  miniTickColor?: string;
  needleColor?: string;
  tickLabelColor?: string;
  titleColor?: string;

  step?: number;
  title?: string;
  redlineThresholdPct?: number;
  formatAsFloat?: boolean;
}

export interface Item {
  label: string;
  value: string;
  color?: string;
}

export interface Props {
  speedometers: SpeedometerProps[];
  items: (Item | string)[];
  svg?: SVGGraphicsElement;
}
