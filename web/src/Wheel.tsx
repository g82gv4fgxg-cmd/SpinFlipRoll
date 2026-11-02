import type { WheelEntry } from "./types";
import type { Segment } from "./wheelMath";

type WheelProps = {
  entries: WheelEntry[];
  segments: Segment[];
  rotation: number;
  winnerIndex: number | null;
};

const center = 160;
const radius = 160;
// Labels are right-aligned just inside the rim so long names run towards the hub instead of off the edge.
const labelRadius = 148;
const maxLabelLength = 15;

export default function Wheel({ entries, segments, rotation, winnerIndex }: WheelProps) {
  if (entries.length === 0) {
    return <div className="empty-wheel">Add options</div>;
  }

  const fontSize = entries.length > 24 ? 9 : entries.length > 18 ? 10 : entries.length > 12 ? 11 : 12;

  return (
    <div className="wheel-shell">
      <div className="pointer" aria-hidden="true">
        ▼
      </div>
      <svg
        className="wheel"
        viewBox="0 0 320 320"
        role="img"
        aria-label="Spinning decision wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {segments.map((segment, index) => {
          const entry = entries[index];
          const sweep = segment.end - segment.start;
          // Options with zero weight take up no space on a weighted wheel.
          if (!entry || sweep <= 0) return null;

          const isFullCircle = sweep >= 359.999;
          const label =
            entry.label.length > maxLabelLength ? `${entry.label.slice(0, maxLabelLength - 1).trimEnd()}…` : entry.label;
          const labelPoint = pointOnCircle(segment.mid, labelRadius);
          const edge = pointOnCircle(segment.start, radius);
          const className = winnerIndex === index ? "winner-segment" : undefined;

          return (
            <g key={entry.id}>
              {isFullCircle ? (
                // An SVG arc can't start and end at the same point, so a single slice is drawn as a circle.
                <circle cx={center} cy={center} r={radius} fill={`#${entry.colorHex}`} className={className} />
              ) : (
                <>
                  <path d={segmentPath(segment.start, segment.end)} fill={`#${entry.colorHex}`} className={className} />
                  <line x1={center} y1={center} x2={edge.x} y2={edge.y} className="segment-line" />
                </>
              )}
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                dy="0.35em"
                textAnchor="end"
                transform={`rotate(${segment.mid} ${labelPoint.x} ${labelPoint.y})`}
                className="wheel-label"
                style={{ fontSize }}
              >
                {label}
              </text>
            </g>
          );
        })}
        <circle cx={center} cy={center} r="30" className="wheel-hub" />
      </svg>
    </div>
  );
}

function segmentPath(start: number, end: number): string {
  const startPoint = pointOnCircle(start, radius);
  const endPoint = pointOnCircle(end, radius);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    `M ${center} ${center}`,
    `L ${startPoint.x} ${startPoint.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`,
    "Z",
  ].join(" ");
}

function pointOnCircle(degrees: number, distance: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: center + distance * Math.cos(radians),
    y: center + distance * Math.sin(radians),
  };
}
