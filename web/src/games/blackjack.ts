/**
 * Blackjack rules (a common casino set): six decks, dealer stands on soft 17, blackjack pays 3:2,
 * the dealer checks for blackjack when showing an Ace or ten, double on any two cards, double
 * after splitting, split up to four hands, split Aces get one card each. No surrender or insurance.
 */
import type { Card } from "./cards";
import { newShoe, rankName } from "./cards";

export const decks = 6;
export const minBet = 10;
/** Reshuffle when this share of the shoe is left (where the cut card would sit). */
export const reshuffleAt = 0.25;
const maxHands = 4;

export type Action = "hit" | "stand" | "double" | "split";

export type PlayerHand = {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
};

export function cardPoints(card: Card): number {
  if (card.rank === 14) return 11;
  return Math.min(card.rank, 10);
}

/** Best total, counting Aces as 11 where that doesn't bust. `soft` means an Ace is still counted as 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardPoints(card);
    if (card.rank === 14) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBust = (cards: Card[]) => handValue(cards).total > 21;
export const isBlackjack = (cards: Card[], fromSplit = false) => !fromSplit && cards.length === 2 && handValue(cards).total === 21;
export const dealerMustHit = (cards: Card[]) => handValue(cards).total < 17;

export function canSplit(hand: PlayerHand, handCount: number, chips: number): boolean {
  return (
    hand.cards.length === 2 &&
    cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]) &&
    handCount < maxHands &&
    chips >= hand.bet &&
    !(hand.fromSplit && hand.cards[0].rank === 14)
  );
}

export function canDouble(hand: PlayerHand, chips: number): boolean {
  return hand.cards.length === 2 && chips >= hand.bet && !(hand.fromSplit && hand.cards[0].rank === 14);
}

export type Outcome = "blackjack" | "win" | "push" | "lose";

/** What a finished hand pays back (stake included), and how it ended. */
export function settle(hand: PlayerHand, dealer: Card[]): { outcome: Outcome; payout: number } {
  const player = handValue(hand.cards).total;
  const dealerTotal = handValue(dealer).total;
  const playerBlackjack = isBlackjack(hand.cards, hand.fromSplit);
  const dealerBlackjack = isBlackjack(dealer);
  if (player > 21) return { outcome: "lose", payout: 0 };
  if (playerBlackjack && dealerBlackjack) return { outcome: "push", payout: hand.bet };
  // 3 to 2, rounded down to whole chips.
  if (playerBlackjack) return { outcome: "blackjack", payout: hand.bet + Math.floor(hand.bet * 1.5) };
  if (dealerBlackjack) return { outcome: "lose", payout: 0 };
  if (dealerTotal > 21 || player > dealerTotal) return { outcome: "win", payout: hand.bet * 2 };
  if (player === dealerTotal) return { outcome: "push", payout: hand.bet };
  return { outcome: "lose", payout: 0 };
}

export class Shoe {
  cards: Card[] = newShoe(decks);
  /** True right after a fresh shuffle, so the table can say so. */
  justShuffled = true;

  draw(): Card {
    if (this.cards.length === 0) this.reshuffle();
    return this.cards.pop()!;
  }

  needsShuffle() {
    return this.cards.length < decks * 52 * reshuffleAt;
  }

  reshuffle() {
    this.cards = newShoe(decks);
    this.justShuffled = true;
  }
}

export type Advice = { action: Action; reason: string };

type Code = "H" | "S" | "D" | "Ds" | "P";

// Basic strategy for 4-8 decks, dealer stands on soft 17, double after split allowed.
// Columns are the dealer's up card: 2 3 4 5 6 7 8 9 10 A.
const hardChart: Record<number, Code[]> = {
  8: ["H", "H", "H", "H", "H", "H", "H", "H", "H", "H"],
  9: ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"],
  10: ["D", "D", "D", "D", "D", "D", "D", "D", "H", "H"],
  11: ["D", "D", "D", "D", "D", "D", "D", "D", "D", "H"],
  12: ["H", "H", "S", "S", "S", "H", "H", "H", "H", "H"],
  13: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  14: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  15: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  16: ["S", "S", "S", "S", "S", "H", "H", "H", "H", "H"],
  17: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
};

const softChart: Record<number, Code[]> = {
  13: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"],
  14: ["H", "H", "H", "D", "D", "H", "H", "H", "H", "H"],
  15: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"],
  16: ["H", "H", "D", "D", "D", "H", "H", "H", "H", "H"],
  17: ["H", "D", "D", "D", "D", "H", "H", "H", "H", "H"],
  18: ["S", "Ds", "Ds", "Ds", "Ds", "S", "S", "H", "H", "H"],
  19: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
  20: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
};

// Pairs by card points (11 = Aces). "P" splits; otherwise play the hand as a normal total.
const pairChart: Record<number, (Code | null)[]> = {
  2: ["P", "P", "P", "P", "P", "P", null, null, null, null],
  3: ["P", "P", "P", "P", "P", "P", null, null, null, null],
  4: [null, null, null, "P", "P", null, null, null, null, null],
  5: [null, null, null, null, null, null, null, null, null, null],
  6: ["P", "P", "P", "P", "P", null, null, null, null, null],
  7: ["P", "P", "P", "P", "P", "P", null, null, null, null],
  8: ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"],
  9: ["P", "P", "P", "P", "P", "S", "P", "P", "S", "S"],
  10: ["S", "S", "S", "S", "S", "S", "S", "S", "S", "S"],
  11: ["P", "P", "P", "P", "P", "P", "P", "P", "P", "P"],
};

export const chartColumns = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];
export const strategyCharts = { hard: hardChart, soft: softChart, pairs: pairChart };

function column(up: Card) {
  return cardPoints(up) === 11 ? 9 : cardPoints(up) - 2;
}

/** The basic-strategy move for this hand against the dealer's up card, with a plain-English reason. */
export function basicStrategy(hand: PlayerHand, dealerUp: Card, options: { canDouble: boolean; canSplit: boolean }): Advice {
  const { total, soft } = handValue(hand.cards);
  const col = column(dealerUp);
  const up = dealerUp.rank === 14 ? "an Ace" : `a ${cardPoints(dealerUp)}`;
  const weakDealer = col <= 4;

  const isPair = hand.cards.length === 2 && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]);
  if (options.canSplit && isPair) {
    const points = cardPoints(hand.cards[0]);
    const code = pairChart[points][col];
    if (code === "P") {
      const pairName = rankName(hand.cards[0].rank, true);
      if (points === 11) return { action: "split", reason: "Always split Aces: each one starts a hand that can make 21." };
      if (points === 8) return { action: "split", reason: "Always split 8s: 16 is the worst total, but two hands starting on 8 can both do well." };
      if (points === 9) return { action: "split", reason: `Split 9s against ${up}: two hands starting on 9 beat a lone 18 here.` };
      return { action: "split", reason: `Split ${pairName} against ${up}: the dealer is weak, so put more money on two playable hands.` };
    }
    if (points === 10) return { action: "stand", reason: "Never split 10s: 20 already wins most of the time." };
  }

  let code: Code;
  if (soft && total <= 12) code = "H"; // two Aces that can't be split: another card can't bust you
  else if (soft && total <= 20) code = softChart[total][col];
  else if (soft && total >= 21) code = "S";
  else code = hardChart[Math.min(17, Math.max(8, total))][col];

  if (code === "D" && !options.canDouble) code = "H";
  if (code === "Ds") code = options.canDouble ? "D" : "S";

  if (code === "D") {
    if (!soft && total === 11) return { action: "double", reason: "11 is the best hand to double: any ten-value card (10, J, Q or K) makes 21, and those are the most common cards in the deck." };
    if (!soft && total === 10) return { action: "double", reason: `Double on 10 against ${up}: a ten gives you 20, and the dealer is behind you.` };
    if (!soft) return { action: "double", reason: `Double on 9 against ${up}: the dealer is weak enough that it's worth doubling your bet.` };
    return { action: "double", reason: `Double on soft ${total} against ${up}: you can't bust with one card, and the dealer is likely to struggle.` };
  }
  if (code === "S") {
    if (total >= 17 && !soft) return { action: "stand", reason: `Stand on ${total}: hitting would bust you too often.` };
    if (soft) return { action: "stand", reason: `Stand on soft ${total}: it's already a strong total.` };
    if (weakDealer) return { action: "stand", reason: `Stand on ${total} against ${up}: the dealer has to keep drawing and often busts, so don't risk busting first.` };
    return { action: "stand", reason: `Stand on ${total}.` };
  }
  if (total <= 11) return { action: "hit", reason: `Hit on ${total}: you can't bust with one more card.` };
  if (soft) return { action: "hit", reason: `Hit on soft ${total}: the Ace can drop to 1, so another card can't bust you.` };
  if (total === 12 && col <= 1) return { action: "hit", reason: `Hit 12 against ${up}: only a ten busts you, and the dealer isn't weak enough to wait.` };
  return { action: "hit", reason: `Hit on ${total} against ${up}: the dealer will usually reach 17 or more, so standing loses more often than hitting.` };
}

export function dealerCanPeek(up: Card) {
  return up.rank === 14 || cardPoints(up) === 10;
}
