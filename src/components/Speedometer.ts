export interface Props {
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
