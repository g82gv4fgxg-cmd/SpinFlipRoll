import type { CSSProperties } from "react";
import { cardName, isRed, rankLabel, suitSymbols } from "../games/cards";
import type { Card } from "../games/cards";

type PlayingCardProps = {
  card?: Card | null;
  hidden?: boolean;
  /** Position in the hand, used to stagger the deal animation. */
  index?: number;
  small?: boolean;
  highlight?: boolean;
  dim?: boolean;
};

export default function PlayingCard({ card, hidden, index = 0, small, highlight, dim }: PlayingCardProps) {
  const style = { "--deal": index } as CSSProperties;
  const size = small ? " small" : "";
  if (hidden || !card) {
    return <div className={`playing-card back${size}`} style={style} role="img" aria-label="Face-down card" />;
  }
  const rank = rankLabel(card.rank);
  const suit = suitSymbols[card.suit];
  return (
    <div
      className={`playing-card ${isRed(card) ? "red" : "black"}${size}${highlight ? " highlight" : ""}${dim ? " dim" : ""}`}
      style={style}
      role="img"
      aria-label={cardName(card)}
    >
      <span className="pc-corner" aria-hidden="true">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      <span className="pc-pip" aria-hidden="true">
        {card.rank >= 11 && card.rank <= 13 ? <em>{rank}</em> : suit}
      </span>
      <span className="pc-corner pc-bottom" aria-hidden="true">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
    </div>
  );
}

/** An empty spot on the table where a card will go. */
export function CardSlot({ small }: { small?: boolean }) {
  return <div className={`playing-card slot${small ? " small" : ""}`} aria-hidden="true" />;
}
