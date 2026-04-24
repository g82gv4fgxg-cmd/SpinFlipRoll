import type { WheelEntry } from "./types";
import type { Segment } from "./wheelMath";

type WheelProps = {
  entries: WheelEntry[];
  segments: Segment[];
  rotation: number;
  winnerIndex: number | null;
};

export default function Wheel({ entries, segments, rotation, winnerIndex }: WheelProps) {
  if (entries.length === 0) {
    return <div className="empty-wheel">Add options</div>;
  }

  return (
    <div className="wheel-shell">
      <div className="pointer">▼</div>
      <svg
        className="wheel"
        viewBox="0 0 320 320"
        role="img"
        aria-label="Spinning decision wheel"
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {segments.map((segment, index) => {
          const entry = entries[index];
          if (!entry) return null;
          const label = entry.label.length > 15 ? `${entry.label.slice(0, 14)}…` : entry.label;
          const labelPoint = pointOnCircle(segment.mid, 78);

          return (
            <g key={entry.id}>
              <path
                d={segmentPath(segment.start, segment.end)}
                fill={`#${entry.colorHex}`}
                className={winnerIndex === index ? "winner-segment" : undefined}
              />
              <line
                x1="160"
                y1="160"
                x2={pointOnCircle(segment.start, 160).x}
                y2={pointOnCircle(segment.start, 160).y}
                className="segment-line"
              />
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                transform={`rotate(${segment.mid} ${labelPoint.x} ${labelPoint.y})`}
                className="wheel-label"
              >
                {label}
              </text>
            </g>
          );
        })}
        <circle cx="160" cy="160" r="30" className="wheel-hub" />
      </svg>
    </div>
  );
}

function segmentPath(start: number, end: number): string {
  const center = { x: 160, y: 160 };
  const radius = 160;
  const startPoint = pointOnCircle(start, radius);
  const endPoint = pointOnCircle(end, radius);
  const largeArc = end - start > 180 ? 1 : 0;

  return [
    `M ${center.x} ${center.y}`,
    `L ${startPoint.x} ${startPoint.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${endPoint.x} ${endPoint.y}`,
    "Z",
  ].join(" ");
}

function pointOnCircle(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: 160 + radius * Math.cos(radians),
    y: 160 + radius * Math.sin(radians),
  };
}
