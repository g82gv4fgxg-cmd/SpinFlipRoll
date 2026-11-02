import type { DieSides } from "../types";

type DieProps = {
  index: number;
  value: number | null;
  sides: DieSides;
  held: boolean;
  rolling: boolean;
  disabled: boolean;
  onToggle: () => void;
};

// Which cells of a 3 x 3 grid hold a pip for each face of a six-sided die.
const pipCells: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export default function Die({ index, value, sides, held, rolling, disabled, onToggle }: DieProps) {
  const showPips = sides === 6 && value !== null;
  return (
    <button
      className={`die${held ? " held" : ""}${rolling && !held ? " rolling" : ""}`}
      style={{ animationDelay: `${index * -70}ms` }}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={held}
      aria-label={`Die ${index + 1}: ${value ?? "not rolled yet"}${held ? ", held" : ""}`}
    >
      <span className={`die-face die-d${sides}`}>
        {showPips ? (
          <span className="pips" aria-hidden="true">
            {Array.from({ length: 9 }, (_, cell) => (
              <i key={cell} className={pipCells[value].includes(cell) ? "pip" : undefined} />
            ))}
          </span>
        ) : (
          <span className="die-number" aria-hidden="true">
            {value ?? "?"}
          </span>
        )}
      </span>
      <small className="die-caption" aria-hidden="true">
        {held ? "Held" : `d${sides}`}
      </small>
    </button>
  );
}
