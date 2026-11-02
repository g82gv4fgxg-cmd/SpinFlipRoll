import { shuffle } from "../random";

export type Suit = "S" | "H" | "D" | "C";
/** rank 2 to 10, then 11 Jack, 12 Queen, 13 King, 14 Ace. */
export type Card = { rank: number; suit: Suit };

export const suits: Suit[] = ["S", "H", "D", "C"];
export const suitSymbols: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const suitNames: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
const rankNames: Record<number, string> = { 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };

export function rankLabel(rank: number): string {
  return rank <= 10 ? String(rank) : ["J", "Q", "K", "A"][rank - 11];
}

export function rankName(rank: number, plural = false): string {
  const name = rank <= 10 ? (["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][rank] ?? String(rank)) : rankNames[rank];
  if (!plural) return name;
  return name === "Six" ? "Sixes" : `${name}s`;
}

export function cardName(card: Card): string {
  return `${rankName(card.rank)} of ${suitNames[card.suit]}`;
}

export const isRed = (card: Card) => card.suit === "H" || card.suit === "D";

export function newDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of suits) for (let rank = 2; rank <= 14; rank++) cards.push({ rank, suit });
  return cards;
}

/** Several decks shuffled together with the crypto-backed shuffle. */
export function newShoe(decks: number): Card[] {
  return shuffle(Array.from({ length: decks }, newDeck).flat());
}
