import type { CSSProperties } from "react";
import type { CoinSide } from "../types";

type CoinProps = {
  sides: [CoinSide, CoinSide];
  rotation: number;
  flipping: boolean;
  /** Length of the flip animation, matched to the flip timer. */
  durationMs: number;
};

export default function Coin({ sides, rotation, flipping, durationMs }: CoinProps) {
  return (
    <div
      className={`coin-stage ${flipping ? "tossing" : ""}`}
      style={{ "--flip-duration": `${durationMs}ms` } as CSSProperties}
    >
      <div className="coin-shadow" aria-hidden="true" />
      <div className={`coin ${flipping ? "flipping" : ""}`} style={{ transform: `rotateY(${rotation}deg)` }}>
        <CoinFace side={sides[0]} className="coin-front" />
        <CoinFace side={sides[1]} className="coin-back" />
      </div>
    </div>
  );
}

function CoinFace({ side, className }: { side: CoinSide; className: string }) {
  const style = { "--coin-color": `#${side.colorHex}`, "--label-scale": labelScale(side.label) } as CSSProperties;
  return (
    <div className={`coin-face ${className}`} style={style}>
      <span>{side.label}</span>
    </div>
  );
}

/** Shrinks longer labels so words fit on the coin instead of breaking mid-word. */
function labelScale(label: string): number {
  const longestWord = Math.max(1, ...label.trim().split(/\s+/).map((word) => word.length));
  return Math.max(0.3, Math.min(1, 5.5 / longestWord, 16 / Math.max(label.length, 1)));
}
