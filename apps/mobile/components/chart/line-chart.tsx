import { Fragment } from 'react';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

type Point = { x: number; y: number };
type LineChartProps = { data: Point[]; height?: number; color?: string; labelColor?: string };

// Internal coordinate space; the Svg scales to the container via viewBox.
const VIEW_W = 300;
const VIEW_H = 120;
const PAD_X = 8;
const PAD_Y = 12;

// pt-BR value label: integers as-is, otherwise one decimal with a comma.
export function labelOf(y: number): string {
  return Number.isInteger(y) ? String(y) : y.toFixed(1).replace('.', ',');
}

export function LineChart({
  data,
  height = 120,
  color = '#14bfa6',
  labelColor = '#8a9a92',
}: LineChartProps) {
  if (data.length === 0) return null;

  const xs = data.map((p) => p.x);
  const ys = data.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  if (yMin === yMax) {
    // Flat series: pad so the line/dot sits mid-height instead of dividing by 0.
    yMin -= 1;
    yMax += 1;
  }

  const px = (x: number) =>
    xMax === xMin ? VIEW_W / 2 : PAD_X + ((x - xMin) / (xMax - xMin)) * (VIEW_W - 2 * PAD_X);
  const py = (y: number) => VIEW_H - PAD_Y - ((y - yMin) / (yMax - yMin)) * (VIEW_H - 2 * PAD_Y);

  const points = data.map((p) => ({ cx: px(p.x), cy: py(p.y), label: labelOf(p.y) }));
  const lastIndex = points.length - 1;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
      {[PAD_Y, VIEW_H / 2, VIEW_H - PAD_Y].map((gy, i) => (
        <Line key={i} x1={PAD_X} y1={gy} x2={VIEW_W - PAD_X} y2={gy} stroke="#243029" strokeWidth={1} />
      ))}
      {points.length >= 2 ? (
        <Path
          testID="line-chart-path"
          d={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {points.map((p, i) => {
        // Anchor edge labels inward so they don't clip at the chart's sides;
        // drop the label below the point when it sits near the top edge.
        const anchor = i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle';
        const labelY = p.cy - 8 < 10 ? p.cy + 16 : p.cy - 8;
        return (
          <Fragment key={i}>
            <Circle
              testID={i === lastIndex ? 'line-chart-dot' : undefined}
              cx={p.cx}
              cy={p.cy}
              r={3}
              fill={color}
            />
            <SvgText
              testID="line-chart-label"
              x={p.cx}
              y={labelY}
              fill={labelColor}
              fontSize={11}
              fontWeight="600"
              textAnchor={anchor}
            >
              {p.label}
            </SvgText>
          </Fragment>
        );
      })}
    </Svg>
  );
}
