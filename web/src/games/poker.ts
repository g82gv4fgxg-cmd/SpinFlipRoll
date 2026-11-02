/**
 * Texas Hold'em: hand evaluation, win-chance simulation, a betting engine with side pots, simple
 * computer players and coaching advice. Play chips only.
 */
import { randomInt, shuffle } from "../random";
import type { Card } from "./cards";
import { newDeck, rankName } from "./cards";

// ---------- Hand evaluation ----------

export const categoryNames = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

export type HandValue = {
  category: number;
  /** Tie-break ranks, most important first. */
  ranks: number[];
  /** A single number that orders hands: higher is better. */
  score: number;
  name: string;
};

function scoreOf(category: number, ranks: number[]) {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * 16 + (ranks[i] ?? 0);
  return score;
}

/** Highest straight in a set of ranks (Ace can be low), or 0. */
function straightHigh(rankSet: Set<number>): number {
  for (let high = 14; high >= 5; high--) {
    let run = true;
    for (let r = high; r > high - 5; r--) {
      if (!rankSet.has(r === 1 ? 14 : r)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return 0;
}

/** Best five-card hand from 5 to 7 cards. */
export function evaluate(cards: Card[]): HandValue {
  const counts = new Map<number, number>();
  const bySuit = new Map<string, number[]>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
    const list = bySuit.get(card.suit) ?? [];
    list.push(card.rank);
    bySuit.set(card.suit, list);
  }

  for (const ranks of bySuit.values()) {
    if (ranks.length >= 5) {
      const high = straightHigh(new Set(ranks));
      if (high) return build(8, [high]);
      const top = [...ranks].sort((a, b) => b - a).slice(0, 5);
      return build(5, top);
    }
  }

  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const rankSet = new Set(counts.keys());
  const kickers = (exclude: number[], n: number) =>
    [...rankSet].filter((r) => !exclude.includes(r)).sort((a, b) => b - a).slice(0, n);

  if (groups[0][1] === 4) return build(7, [groups[0][0], ...kickers([groups[0][0]], 1)]);
  if (groups[0][1] === 3 && groups[1] && groups[1][1] >= 2) return build(6, [groups[0][0], groups[1][0]]);
  const straight = straightHigh(rankSet);
  if (straight) return build(4, [straight]);
  if (groups[0][1] === 3) return build(3, [groups[0][0], ...kickers([groups[0][0]], 2)]);
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const pairs = [groups[0][0], groups[1][0]];
    return build(2, [...pairs, ...kickers(pairs, 1)]);
  }
  if (groups[0][1] === 2) return build(1, [groups[0][0], ...kickers([groups[0][0]], 3)]);
  return build(0, kickers([], 5));
}

function build(category: number, ranks: number[]): HandValue {
  return { category, ranks, score: scoreOf(category, ranks), name: describe(category, ranks) };
}

function describe(category: number, ranks: number[]): string {
  const [a, b] = ranks;
  switch (category) {
    case 8:
      return a === 14 ? "Royal flush" : `Straight flush, ${rankName(a)} high`;
    case 7:
      return `Four of a kind, ${rankName(a, true)}`;
    case 6:
      return `Full house, ${rankName(a, true)} full of ${rankName(b, true)}`;
    case 5:
      return `Flush, ${rankName(a)} high`;
    case 4:
      return `Straight, ${rankName(a)} high`;
    case 3:
      return `Three of a kind, ${rankName(a, true)}`;
    case 2:
      return `Two pair, ${rankName(a, true)} and ${rankName(b, true)}`;
    case 1:
      return `Pair of ${rankName(a, true)}`;
    default:
      return `High card, ${rankName(a)}`;
  }
}

// ---------- Win chance ----------

/**
 * Share of the pot this hand wins on average against `opponents` random hands, by simulating
 * the rest of the deal many times. Ties count as a share of the pot.
 */
export function winChance(hole: Card[], board: Card[], opponents: number, trials = 800): number {
  if (opponents <= 0) return 1;
  const used = new Set([...hole, ...board].map((c) => c.rank * 4 + "SHDC".indexOf(c.suit)));
  const rest = newDeck().filter((c) => !used.has(c.rank * 4 + "SHDC".indexOf(c.suit)));
  const needed = 5 - board.length + opponents * 2;
  let total = 0;
  for (let t = 0; t < trials; t++) {
    // Partial Fisher-Yates: only shuffle the cards we need.
    for (let i = 0; i < needed; i++) {
      const j = i + randomInt(rest.length - i);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const fullBoard = board.concat(rest.slice(0, 5 - board.length));
    const mine = evaluate(hole.concat(fullBoard)).score;
    let best = mine;
    let tied = 1;
    let beaten = false;
    for (let o = 0; o < opponents; o++) {
      const start = 5 - board.length + o * 2;
      const theirs = evaluate([rest[start], rest[start + 1], ...fullBoard]).score;
      if (theirs > best) {
        beaten = true;
        break;
      }
      if (theirs === best) tied++;
    }
    if (!beaten) total += 1 / tied;
  }
  return total / trials;
}

// ---------- Table and betting ----------

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type Seat = {
  name: string;
  human: boolean;
  chips: number;
  hole: Card[];
  /** Chips put in on the current street. */
  bet: number;
  /** Chips put in over the whole hand. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  style: "tight" | "loose" | "steady";
  lastAction: string;
};

export type Payout = { seat: number; amount: number; hand: string };

export type Table = {
  seats: Seat[];
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  deck: Card[];
  board: Card[];
  street: Street;
  currentBet: number;
  minRaise: number;
  toAct: number;
  handNumber: number;
  log: string[];
  payouts: Payout[] | null;
};

export type PokerAction = { type: "fold" } | { type: "check" } | { type: "call" } | { type: "raise"; to: number };

export function createTable(humanChips: number): Table {
  const seat = (name: string, human: boolean, style: Seat["style"], chips: number): Seat => ({
    name,
    human,
    chips,
    hole: [],
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    acted: false,
    style,
    lastAction: "",
  });
  return {
    seats: [seat("You", true, "steady", humanChips), seat("Ava", false, "tight", 1000), seat("Bo", false, "loose", 1000), seat("Cy", false, "steady", 1000)],
    dealer: randomInt(4),
    smallBlind: 10,
    bigBlind: 20,
    deck: [],
    board: [],
    street: "showdown",
    currentBet: 0,
    minRaise: 20,
    toAct: 0,
    handNumber: 0,
    log: [],
    payouts: null,
  };
}

export const pot = (table: Table) => table.seats.reduce((sum, seat) => sum + seat.committed, 0);
const live = (table: Table) => table.seats.filter((seat) => !seat.folded && (seat.chips > 0 || seat.committed > 0 || seat.allIn));
const nextIndex = (table: Table, from: number, test: (seat: Seat) => boolean) => {
  for (let step = 1; step <= table.seats.length; step++) {
    const index = (from + step) % table.seats.length;
    if (test(table.seats[index])) return index;
  }
  return -1;
};

/** Starts a new hand: computer players who've run out get a fresh stack, blinds are posted, cards dealt. */
export function startHand(table: Table): Table {
  const next: Table = structuredClone(table);
  next.seats.forEach((seat) => {
    if (!seat.human && seat.chips < next.bigBlind) seat.chips = 1000;
    Object.assign(seat, { hole: [], bet: 0, committed: 0, folded: seat.chips <= 0, allIn: false, acted: false, lastAction: "" });
  });
  next.handNumber += 1;
  next.deck = shuffle(newDeck());
  next.board = [];
  next.payouts = null;
  next.log = [];
  next.dealer = nextIndex(next, next.dealer, (seat) => !seat.folded);
  const sb = nextIndex(next, next.dealer, (seat) => !seat.folded);
  const bb = nextIndex(next, sb, (seat) => !seat.folded);
  postBlind(next, sb, next.smallBlind, "small blind");
  postBlind(next, bb, next.bigBlind, "big blind");
  for (let round = 0; round < 2; round++) next.seats.forEach((seat) => !seat.folded && seat.hole.push(next.deck.pop()!));
  next.street = "preflop";
  next.currentBet = next.bigBlind;
  next.minRaise = next.bigBlind;
  next.toAct = nextIndex(next, bb, canAct);
  return next;
}

function postBlind(table: Table, index: number, amount: number, label: string) {
  const seat = table.seats[index];
  const paid = Math.min(amount, seat.chips);
  seat.chips -= paid;
  seat.bet = paid;
  seat.committed = paid;
  seat.allIn = seat.chips === 0;
  seat.lastAction = label === "small blind" ? `SB ${paid}` : `BB ${paid}`;
  table.log.push(`${says(seat, "post")} the ${label} (${paid})`);
}

const canAct = (seat: Seat) => !seat.folded && !seat.allIn;

/** "You call" but "Ava calls". */
const says = (seat: Seat, verb: string, third = `${verb}s`) => `${seat.name} ${seat.human ? verb : third}`;

export function legalActions(table: Table) {
  const seat = table.seats[table.toAct];
  const toCall = Math.min(table.currentBet - seat.bet, seat.chips);
  const minRaiseTo = Math.min(table.currentBet + table.minRaise, seat.bet + seat.chips);
  return {
    toCall,
    canCheck: toCall === 0,
    canRaise: seat.chips > toCall,
    minRaiseTo,
    maxRaiseTo: seat.bet + seat.chips,
  };
}

/** Applies the current player's action and moves the hand on (next player, next street or showdown). */
export function act(table: Table, action: PokerAction): Table {
  const next: Table = structuredClone(table);
  const seat = next.seats[next.toAct];
  const { toCall } = legalActions(next);

  if (action.type === "fold") {
    seat.folded = true;
    seat.lastAction = "Fold";
    next.log.push(says(seat, "fold"));
  } else if (action.type === "check" || (action.type === "call" && toCall === 0)) {
    seat.lastAction = "Check";
    next.log.push(says(seat, "check"));
  } else if (action.type === "call") {
    pay(seat, toCall);
    seat.lastAction = seat.allIn ? `All in ${seat.committed}` : `Call ${toCall}`;
    next.log.push(`${says(seat, "call")} ${toCall}${seat.allIn ? ` and ${seat.human ? "are" : "is"} all in` : ""}`);
  } else {
    const facing = next.currentBet;
    const target = Math.min(Math.max(action.to, next.currentBet + 1), seat.bet + seat.chips);
    const raiseBy = target - next.currentBet;
    pay(seat, target - seat.bet);
    if (raiseBy >= next.minRaise) next.minRaise = raiseBy;
    next.currentBet = Math.max(next.currentBet, seat.bet);
    // Everyone else must respond to the raise.
    next.seats.forEach((other) => {
      if (other !== seat) other.acted = false;
    });
    const verb = facing === 0 ? says(seat, "bet") : `${says(seat, "raise", "raises")} to`;
    seat.lastAction = seat.allIn ? `All in ${seat.bet}` : `${facing === 0 ? "Bet" : "Raise"} ${seat.bet}`;
    next.log.push(`${verb} ${seat.bet}${seat.allIn ? " (all in)" : ""}`);
  }
  seat.acted = true;
  return advance(next);
}

function pay(seat: Seat, amount: number) {
  const paid = Math.min(amount, seat.chips);
  seat.chips -= paid;
  seat.bet += paid;
  seat.committed += paid;
  if (seat.chips === 0) seat.allIn = true;
}

function advance(table: Table): Table {
  const remaining = table.seats.filter((seat) => !seat.folded);
  if (remaining.length === 1) return award(table);

  const roundOver = table.seats.every((seat) => !canAct(seat) || (seat.acted && seat.bet === table.currentBet));
  if (!roundOver) {
    table.toAct = nextIndex(table, table.toAct, canAct);
    return table;
  }

  // Street finished: collect bets and deal the next cards.
  table.seats.forEach((seat) => {
    seat.bet = 0;
    seat.acted = false;
  });
  table.currentBet = 0;
  table.minRaise = table.bigBlind;
  const order: Street[] = ["preflop", "flop", "turn", "river", "showdown"];
  table.street = order[order.indexOf(table.street) + 1];
  if (table.street === "flop") table.board.push(table.deck.pop()!, table.deck.pop()!, table.deck.pop()!);
  if (table.street === "turn" || table.street === "river") table.board.push(table.deck.pop()!);
  if (table.street === "showdown") return award(table);

  // If at most one player can still bet, run out the rest of the board.
  if (table.seats.filter(canAct).length <= 1) {
    while (table.board.length < 5) table.board.push(table.deck.pop()!);
    table.street = "showdown";
    return award(table);
  }
  table.toAct = nextIndex(table, table.dealer, canAct);
  return table;
}

/** Splits the pot, including side pots for players who went all in for less. */
function award(table: Table): Table {
  table.street = "showdown";
  const contenders = table.seats.map((seat, index) => ({ seat, index })).filter(({ seat }) => !seat.folded);
  const payouts = new Map<number, number>();
  const values = new Map<number, HandValue>();

  if (contenders.length === 1) {
    payouts.set(contenders[0].index, pot(table));
    table.log.push(`${says(contenders[0].seat, "win")} ${pot(table)}`);
  } else {
    contenders.forEach(({ seat, index }) => values.set(index, evaluate([...seat.hole, ...table.board])));
    const levels = [...new Set(table.seats.map((seat) => seat.committed).filter((amount) => amount > 0))].sort((a, b) => a - b);
    let previous = 0;
    for (const level of levels) {
      const parts = table.seats.map((seat) => Math.max(0, Math.min(seat.committed, level) - previous));
      const slice = parts.reduce((sum, part) => sum + part, 0);
      const eligible = contenders.filter(({ seat }) => seat.committed >= level);
      previous = level;
      if (slice === 0) continue;
      if (eligible.length === 0) {
        // Nobody still in the hand matched this much: it goes back to whoever put it in.
        parts.forEach((part, index) => part && payouts.set(index, (payouts.get(index) ?? 0) + part));
        continue;
      }
      const best = Math.max(...eligible.map(({ index }) => values.get(index)!.score));
      const winners = eligible.filter(({ index }) => values.get(index)!.score === best);
      const share = Math.floor(slice / winners.length);
      let leftover = slice - share * winners.length;
      // Odd chips go to the first winner after the dealer.
      const ordered = [...winners].sort((a, b) => ((a.index - table.dealer + 4) % 4) - ((b.index - table.dealer + 4) % 4));
      for (const { index } of ordered) {
        payouts.set(index, (payouts.get(index) ?? 0) + share + (leftover > 0 ? 1 : 0));
        if (leftover > 0) leftover--;
      }
    }
    for (const [index, amount] of payouts) {
      const value = values.get(index);
      const seat = table.seats[index];
      table.log.push(value ? `${says(seat, "win")} ${amount} with ${value.name.toLowerCase()}` : `${says(seat, "get")} ${amount} back`);
    }
  }

  table.payouts = [...payouts.entries()].map(([seat, amount]) => ({
    seat,
    amount,
    hand: values.get(seat)?.name ?? (contenders.length > 1 ? "Uncalled chips returned" : "Everyone else folded"),
  }));
  for (const { seat, amount } of table.payouts) table.seats[seat].chips += amount;
  return table;
}

// ---------- Computer players and coaching ----------

export type Advice = { action: "fold" | "check" | "call" | "raise"; raiseTo?: number; reason: string; chance: number; potOdds: number };

/** What a sensible player would do here, explained in terms of win chance and pot odds. */
export function adviseFor(table: Table, seatIndex: number, trials = 700): Advice {
  const seat = table.seats[seatIndex];
  const opponents = table.seats.filter((other, index) => index !== seatIndex && !other.folded).length;
  const chance = winChance(seat.hole, table.board, opponents, trials);
  const toCall = Math.min(table.currentBet - seat.bet, seat.chips);
  const potNow = pot(table);
  const potOdds = toCall > 0 ? toCall / (potNow + toCall) : 0;
  const fair = 1 / (opponents + 1);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const raiseTo = Math.min(seat.bet + seat.chips, Math.max(table.currentBet + table.minRaise, Math.round((table.currentBet + potNow * 0.66) / 10) * 10));

  if (chance > Math.max(0.55, fair * 1.9) && seat.chips > toCall) {
    return {
      action: "raise",
      raiseTo,
      chance,
      potOdds,
      reason: `You win about ${percent(chance)} of the time against ${opponents} ${opponents === 1 ? "player" : "players"}, well above a fair share of ${percent(fair)}. Raise to build the pot while you're ahead.`,
    };
  }
  if (toCall === 0) {
    return {
      action: "check",
      chance,
      potOdds,
      reason: `Checking is free. Your ${percent(chance)} win chance isn't strong enough to bet for value, so see the next card for nothing.`,
    };
  }
  if (chance >= potOdds) {
    return {
      action: "call",
      chance,
      potOdds,
      reason: `Calling ${toCall} to win ${potNow + toCall} needs a ${percent(potOdds)} chance to break even. You have about ${percent(chance)}, so calling pays off over time.`,
    };
  }
  return {
    action: "fold",
    chance,
    potOdds,
    reason: `Calling ${toCall} needs a ${percent(potOdds)} chance to break even, but you only win about ${percent(chance)}. Fold and wait for a better spot.`,
  };
}

/** A computer player's move: the coach's advice, nudged by personality and a little unpredictability. */
export function botAction(table: Table): PokerAction {
  const seat = table.seats[table.toAct];
  const advice = adviseFor(table, table.toAct, 300);
  const { toCall, canRaise, minRaiseTo, maxRaiseTo } = legalActions(table);
  const roll = Math.random();
  const looseness = seat.style === "loose" ? 0.12 : seat.style === "tight" ? -0.05 : 0.04;

  if (advice.action === "raise" && canRaise) {
    if (roll < 0.25) return toCall > 0 ? { type: "call" } : { type: "check" }; // slow-play sometimes
    return { type: "raise", to: Math.min(maxRaiseTo, Math.max(minRaiseTo, advice.raiseTo ?? minRaiseTo)) };
  }
  if (advice.action === "check") {
    // Occasionally bet as a bluff, more often for loose players.
    if (canRaise && roll < 0.06 + looseness) return { type: "raise", to: Math.min(maxRaiseTo, minRaiseTo) };
    return { type: "check" };
  }
  if (advice.action === "call") return { type: "call" };
  // Loose players call a little light; tight players fold more.
  if (advice.chance + looseness >= advice.potOdds && toCall <= seat.chips * 0.25) return { type: "call" };
  return { type: "fold" };
}

export const streetNames: Record<Street, string> = {
  preflop: "Before the flop",
  flop: "The flop",
  turn: "The turn",
  river: "The river",
  showdown: "Showdown",
};

export const streetLessons: Record<Street, string> = {
  preflop: "Everyone has two private cards. The two players after the dealer put in blinds so there's something to play for. Betting goes round the table.",
  flop: "Three shared cards are dealt face up. Everyone combines them with their own two cards. Another round of betting.",
  turn: "A fourth shared card. Bets usually get bigger now. Think about what hands your opponents could have.",
  river: "The fifth and last shared card. This is the final round of betting before hands are shown.",
  showdown: "Players still in show their cards. The best five-card hand from their two cards plus the five shared cards wins.",
};
