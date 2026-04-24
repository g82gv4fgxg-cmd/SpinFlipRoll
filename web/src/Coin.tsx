import type { CSSProperties } from "react";
import type { CoinSide } from "./types";

type CoinProps = {
  sides: [CoinSide, CoinSide];
  rotation: number;
  flipping: boolean;
};

export default function Coin({ sides, rotation, flipping }: CoinProps) {
  return (
    <div className="coin-stage" aria-live="polite">
      <div className={`coin ${flipping ? "flipping" : ""}`} style={{ transform: `rotateX(${rotation}deg)` }}>
        <CoinFace side={sides[0]} className="coin-front" />
        <CoinFace side={sides[1]} className="coin-back" />
      </div>
    </div>
  );
}

function CoinFace({ side, className }: { side: CoinSide; className: string }) {
  return (
    <div className={`coin-face ${className}`} style={{ "--coin-color": `#${side.colorHex}` } as CSSProperties}>
      <span>{side.label}</span>
    </div>
  );
}
