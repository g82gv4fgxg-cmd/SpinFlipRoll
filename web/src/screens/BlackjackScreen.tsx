import { useEffect, useRef, useState } from "react";
import GameFrame, { Lesson, PlayChipsNote } from "../components/GameFrame";
import PlayingCard from "../components/PlayingCard";
import {
  basicStrategy,
  canDouble,
  canSplit,
  cardPoints,
  chartColumns,
  dealerCanPeek,
  dealerMustHit,
  handValue,
  isBlackjack,
  isBust,
  minBet,
  settle,
  Shoe,
  strategyCharts,
} from "../games/blackjack";
import type { Action, Outcome, PlayerHand } from "../games/blackjack";
import type { Card } from "../games/cards";
import { useTimers } from "../hooks";
import type { Shell } from "../shell";
import { sounds, unlockAudio } from "../sound";
import { startingChips } from "../storage";
import type { ArcadeStats } from "../types";

type BlackjackScreenProps = {
  shell: Shell;
  arcade: ArcadeStats;
  setArcade: (update: (current: ArcadeStats) => Partial<ArcadeStats>) => void;
  onBack: () => void;
};

type Phase = "betting" | "player" | "dealer" | "done";
type Result = { outcome: Outcome; payout: number; bet: number };

const chipValues = [10, 25, 100, 500];
const actionNames: Record<Action, string> = { hit: "Hit", stand: "Stand", double: "Double", split: "Split" };
const outcomeNames: Record<Outcome, string> = { blackjack: "Blackjack", win: "Win", push: "Push", lose: "Lose" };
const format = (value: number) => value.toLocaleString("en-AU");

function describeTotal(cards: Card[], fromSplit = false) {
  if (cards.length === 0) return "";
  if (isBlackjack(cards, fromSplit)) return "Blackjack";
  const { total, soft } = handValue(cards);
  if (total > 21) return `Bust (${total})`;
  return soft && total < 21 ? `Soft ${total}` : String(total);
}

/** Which cell of the strategy chart applies right now, so the Learn panel can highlight it. */
function chartSpot(hand: PlayerHand, up: Card, splitAllowed: boolean) {
  const col = cardPoints(up) === 11 ? 9 : cardPoints(up) - 2;
  const { total, soft } = handValue(hand.cards);
  const pair = hand.cards.length === 2 && cardPoints(hand.cards[0]) === cardPoints(hand.cards[1]);
  if (pair && splitAllowed && strategyCharts.pairs[cardPoints(hand.cards[0])][col] === "P") return { table: "pairs", row: cardPoints(hand.cards[0]), col };
  if (soft && total >= 13 && total <= 20) return { table: "soft", row: total, col };
  if (!soft) return { table: "hard", row: Math.min(17, Math.max(8, total)), col };
  return null;
}

export default function BlackjackScreen({ shell, arcade, setArcade, onBack }: BlackjackScreenProps) {
  const shoe = useRef<Shoe | null>(null);
  const { later } = useTimers();
  const chips = arcade.blackjackChips;
  const [phase, setPhase] = useState<Phase>("betting");
  const [bet, setBet] = useState(25);
  const [hands, setHands] = useState<PlayerHand[]>([]);
  const [active, setActive] = useState(0);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [holeHidden, setHoleHidden] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [feedback, setFeedback] = useState<{ good: boolean; text: string } | null>(null);
  const [showHints, setShowHints] = useState(true);
  const [note, setNote] = useState("Pick your chips, then deal.");
  const dealerDelay = shell.reducedMotion ? 250 : 650;

  const hand = phase === "player" ? hands[active] : undefined;
  const up = dealer[0];
  const options = hand ? { canDouble: canDouble(hand, chips), canSplit: canSplit(hand, hands.length, chips) } : null;
  const advice = hand && options ? basicStrategy(hand, up, options) : null;
  const spot = hand && options ? chartSpot(hand, up, options.canSplit) : null;
  const accuracy = arcade.coachTotal ? Math.round((arcade.coachRight / arcade.coachTotal) * 100) : null;
  const bankrupt = phase !== "player" && phase !== "dealer" && chips < minBet;

  function getShoe() {
    if (!shoe.current) shoe.current = new Shoe();
    return shoe.current;
  }

  const draw = () => getShoe().draw();

  function addChip(value: number) {
    sounds.chips();
    setBet((current) => Math.min(chips, (phase === "done" ? 0 : current) + value));
    if (phase === "done") setPhase("betting");
  }

  function deal(amount = bet) {
    if (amount < minBet || amount > chips) return;
    unlockAudio();
    const currentShoe = getShoe();
    if (currentShoe.needsShuffle()) {
      currentShoe.reshuffle();
      shell.toast("The cut card came out: shuffling a fresh six-deck shoe.");
    }
    setArcade((current) => ({ blackjackChips: current.blackjackChips - amount }));
    const [p1, d1, p2, d2] = [draw(), draw(), draw(), draw()];
    for (let i = 0; i < 4; i++) later(() => sounds.cardDeal(), i * 110);
    const first: PlayerHand = { cards: [p1, p2], bet: amount, doubled: false, done: false, fromSplit: false };
    const dealerCards = [d1, d2];
    setBet(amount);
    setHands([first]);
    setActive(0);
    setDealer(dealerCards);
    setHoleHidden(true);
    setResults([]);
    setFeedback(null);

    if (dealerCanPeek(d1) && isBlackjack(dealerCards)) {
      finish([first], dealerCards, "The dealer peeked under their card and has blackjack.");
      return;
    }
    if (isBlackjack(first.cards)) {
      finish([first], dealerCards, isBlackjack(dealerCards) ? "You both have blackjack." : "Blackjack! It pays 3 to 2.");
      return;
    }
    setNote(dealerCanPeek(d1) ? "The dealer checked for blackjack and doesn't have it. Your move." : "Your move.");
    setPhase("player");
  }

  function act(action: Action) {
    if (!hand || !options || !advice) return;
    if ((action === "double" && !options.canDouble) || (action === "split" && !options.canSplit)) return;
    unlockAudio();
    const good = advice.action === action;
    setFeedback({
      good,
      text: good ? `${actionNames[action]} is right. ${advice.reason}` : `Basic strategy says ${actionNames[advice.action].toLowerCase()} here. ${advice.reason}`,
    });
    setArcade((current) => ({ coachTotal: current.coachTotal + 1, coachRight: current.coachRight + (good ? 1 : 0) }));

    const next = hands.map((h) => ({ ...h, cards: [...h.cards] }));
    const current = next[active];
    if (action === "hit") {
      current.cards.push(draw());
      sounds.cardDeal();
      if (handValue(current.cards).total >= 21) current.done = true;
    } else if (action === "stand") {
      current.done = true;
    } else if (action === "double") {
      setArcade((stats) => ({ blackjackChips: stats.blackjackChips - current.bet }));
      current.bet *= 2;
      current.doubled = true;
      current.cards.push(draw());
      sounds.chips();
      current.done = true;
    } else {
      setArcade((stats) => ({ blackjackChips: stats.blackjackChips - current.bet }));
      const [a, b] = current.cards;
      const aces = a.rank === 14;
      const split = (card: Card): PlayerHand => {
        const cards = [card, draw()];
        return { cards, bet: current.bet, doubled: false, done: aces || handValue(cards).total === 21, fromSplit: true };
      };
      next.splice(active, 1, split(a), split(b));
      sounds.chips();
      if (aces) setNote("Split Aces get one card each.");
    }

    const nextActive = next.findIndex((h) => !h.done);
    setHands(next);
    if (nextActive >= 0) {
      setActive(nextActive);
      if (next.length > 1 && nextActive !== active) setNote(`Now playing hand ${nextActive + 1}.`);
      return;
    }
    playDealer(next);
  }

  function playDealer(finalHands: PlayerHand[]) {
    setPhase("dealer");
    setHoleHidden(false);
    sounds.cardDeal();
    const everyHandBust = finalHands.every((h) => isBust(h.cards));
    setNote(everyHandBust ? "Bust. The dealer doesn't need to draw." : "The dealer turns over their card and draws to 17.");
    let cards = [...dealer];
    const stepDealer = () => {
      if (!everyHandBust && dealerMustHit(cards)) {
        cards = [...cards, draw()];
        setDealer(cards);
        sounds.cardDeal();
        later(stepDealer, dealerDelay);
      } else {
        finish(finalHands, cards);
      }
    };
    later(stepDealer, dealerDelay);
  }

  function finish(finalHands: PlayerHand[], dealerCards: Card[], message?: string) {
    setHoleHidden(false);
    setDealer(dealerCards);
    setHands(finalHands);
    const outcomes = finalHands.map((h) => ({ ...settle(h, dealerCards), bet: h.bet }));
    const payout = outcomes.reduce((sum, r) => sum + r.payout, 0);
    const staked = outcomes.reduce((sum, r) => sum + r.bet, 0);
    if (payout) setArcade((current) => ({ blackjackChips: current.blackjackChips + payout }));
    setResults(outcomes);
    const net = payout - staked;
    const dealerTotal = handValue(dealerCards).total;
    const dealerLine = isBlackjack(dealerCards) ? "Dealer has blackjack." : dealerTotal > 21 ? `Dealer busts with ${dealerTotal}.` : `Dealer has ${dealerTotal}.`;
    const netLine = net > 0 ? `You win ${format(net)}.` : net < 0 ? `You lose ${format(-net)}.` : "Push: your bet comes back.";
    setNote(`${message ?? dealerLine} ${netLine}`);
    if (net > 0) sounds.handWin(later);
    else if (net < 0) sounds.handLose();
    setPhase("done");
  }

  function topUp() {
    setArcade(() => ({ blackjackChips: startingChips }));
    setBet(25);
    setPhase("betting");
    shell.toast(`Topped up to ${format(startingChips)} play chips.`);
  }

  // Keyboard: H, S, D and P during a hand; Enter deals.
  const keys = useRef({ act, deal, phase, bet, chips });
  keys.current = { act, deal, phase, bet, chips };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
      const { act: play, deal: dealHand, phase: current, bet: amount, chips: bank } = keys.current;
      const key = event.key.toLowerCase();
      if (current === "player") {
        const map: Record<string, Action> = { h: "hit", s: "stand", d: "double", p: "split" };
        if (map[key]) {
          event.preventDefault();
          play(map[key]);
        }
      } else if ((current === "betting" || current === "done") && key === "enter" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        dealHand(Math.min(amount, bank));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dealerShown = holeHidden ? dealer.slice(0, 1) : dealer;
  const repeatBet = Math.min(bet, chips);

  const learn = (
    <>
      <Lesson title="The goal">
        <p>Get closer to 21 than the dealer without going over. Number cards count their number, J, Q and K count 10, and an Ace counts 1 or 11, whichever helps.</p>
        <p>A "soft" hand has an Ace still counting as 11, so one more card can't bust it.</p>
      </Lesson>
      <Lesson title="A hand, step by step">
        <ol>
          <li>Bet, then you and the dealer get two cards. One of the dealer's cards stays face down.</li>
          <li>An Ace and a ten-value card is blackjack and pays 3 to 2.</li>
          <li>
            On your turn: <b>Hit</b> takes a card, <b>Stand</b> stops, <b>Double</b> doubles your bet for exactly one more card, and <b>Split</b> turns a
            pair into two hands with a bet each.
          </li>
          <li>The dealer then flips their card and must draw until they reach 17 or more. At this table they stand on soft 17.</li>
          <li>Beat the dealer's total, or have them bust, to win even money. A tie is a push.</li>
        </ol>
      </Lesson>
      <Lesson title="Basic strategy">
        <p>
          Basic strategy is the mathematically best move for every hand against every dealer card. It doesn't guarantee a win, but it cuts the house edge to
          roughly half a percent with these rules (an approximate figure). The coach compares each decision with it.
        </p>
        <p>The highlighted cell shows the situation you're in right now.</p>
        <StrategyChart spot={spot} />
        <ul className="chart-key">
          <li>
            <b className="cell-H">H</b> hit
          </li>
          <li>
            <b className="cell-S">S</b> stand
          </li>
          <li>
            <b className="cell-D">D</b> double, or hit if you can't
          </li>
          <li>
            <b className="cell-Ds">Ds</b> double, or stand if you can't
          </li>
          <li>
            <b className="cell-P">P</b> split
          </li>
        </ul>
      </Lesson>
      <Lesson title="Quick rules of thumb">
        <ul>
          <li>Always split Aces and 8s. Never split 10s or 5s.</li>
          <li>Double 11 against anything but an Ace, and 10 against 9 or lower.</li>
          <li>Stand on hard 17 or more. Hit 12 to 16 against a 7 or higher.</li>
          <li>When the dealer shows 2 to 6 they bust often, so stand on hard 13 or more.</li>
        </ul>
      </Lesson>
      <Lesson title="This table">
        <p>Six decks, reshuffled when about a quarter is left. Dealer stands on soft 17 and checks for blackjack. Double on any two cards, including after a split. Up to four hands. No insurance or surrender.</p>
        <p>Keys: H hit, S stand, D double, P split, Enter deal.</p>
        <PlayChipsNote />
      </Lesson>
    </>
  );

  return (
    <GameFrame
      shell={shell}
      title="Blackjack"
      className="blackjack-screen"
      onBack={onBack}
      stats={<span className="chip-count">{format(chips)} chips</span>}
      learn={learn}
      data={{ phase, chips }}
    >
      <div className="table-layout">
        <section className="felt bj-felt" aria-label="Blackjack table">
          <div className="bj-row">
            <p className="hand-label">
              Dealer {dealer.length > 0 && <b>{holeHidden ? `shows ${describeTotal(dealer.slice(0, 1))}` : describeTotal(dealer)}</b>}
            </p>
            <div className="card-row">
              {dealerShown.map((card, index) => (
                <PlayingCard key={`d-${index}-${index === 1 ? "up" : ""}`} card={card} index={index < 2 ? index * 2 + 1 : 0} />
              ))}
              {holeHidden && dealer.length > 1 && <PlayingCard key="d-hole" hidden index={3} />}
            </div>
          </div>
          <p className="felt-print" aria-hidden="true">
            Blackjack pays 3 to 2 · Dealer stands on soft 17
          </p>
          <div className={`bj-hands${hands.length > 1 ? " split" : ""}`}>
            {hands.map((h, handIndex) => {
              const result = results[handIndex];
              const isActive = phase === "player" && handIndex === active;
              return (
                <div key={handIndex} className={`bj-hand${isActive ? " active" : ""}${result ? ` result-${result.outcome}` : ""}`}>
                  <div className="card-row">
                    {h.cards.map((card, index) => (
                      <PlayingCard key={`${handIndex}-${index}`} card={card} index={index < 2 && hands.length === 1 ? index * 2 : 0} />
                    ))}
                  </div>
                  <p className="hand-label">
                    {hands.length > 1 ? `Hand ${handIndex + 1}: ` : "You: "}
                    <b>{describeTotal(h.cards, h.fromSplit)}</b>
                    <span className="hand-bet">
                      {format(h.bet)}
                      {h.doubled ? " (doubled)" : ""}
                    </span>
                  </p>
                  {result && (
                    <p className={`result-badge ${result.outcome}`}>
                      {outcomeNames[result.outcome]}
                      {result.payout > result.bet ? ` +${format(result.payout - result.bet)}` : result.payout === 0 ? ` −${format(result.bet)}` : ""}
                    </p>
                  )}
                </div>
              );
            })}
            {hands.length === 0 && <p className="felt-empty">Your cards go here</p>}
          </div>
          <p className="table-note" role="status">
            {note}
          </p>
        </section>

        <section className="bj-controls" aria-label="Your move">
          {phase === "player" && options && (
            <div className="action-row">
              <button className="act-hit" onClick={() => act("hit")}>
                Hit <kbd>H</kbd>
              </button>
              <button className="act-stand" onClick={() => act("stand")}>
                Stand <kbd>S</kbd>
              </button>
              <button className="act-double" onClick={() => act("double")} disabled={!options.canDouble}>
                Double <kbd>D</kbd>
              </button>
              <button className="act-split" onClick={() => act("split")} disabled={!options.canSplit}>
                Split <kbd>P</kbd>
              </button>
            </div>
          )}
          {phase === "dealer" && <p className="waiting">Dealer's turn…</p>}
          {(phase === "betting" || phase === "done") && !bankrupt && (
            <div className="bet-area">
              <div className="chip-row" aria-label="Add chips to your bet">
                {chipValues.map((value) => (
                  <button key={value} className={`chip chip-${value}`} onClick={() => addChip(value)} disabled={value > chips} aria-label={`Add ${value}`}>
                    {value}
                  </button>
                ))}
              </div>
              <div className="bet-actions">
                {phase === "betting" ? (
                  <>
                    <span className="bet-amount">
                      Bet <b>{format(bet)}</b>
                    </span>
                    <button className="secondary" onClick={() => setBet(0)} disabled={bet === 0}>
                      Clear
                    </button>
                    <button onClick={() => deal()} disabled={bet < minBet || bet > chips}>
                      Deal
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => deal(repeatBet)} disabled={repeatBet < minBet} autoFocus>
                      Deal again ({format(repeatBet)})
                    </button>
                    <button className="secondary" onClick={() => setPhase("betting")}>
                      Change bet
                    </button>
                  </>
                )}
              </div>
              {phase === "betting" && bet > 0 && bet < minBet && <p className="muted">The minimum bet is {minBet}.</p>}
            </div>
          )}
          {bankrupt && (
            <div className="bet-area">
              <p>Out of chips. Luckily these are pretend.</p>
              <button onClick={topUp}>Top up to {format(startingChips)}</button>
            </div>
          )}
        </section>

        <aside className="coach-card" aria-label="Coach">
          <div className="coach-head">
            <h2>Coach</h2>
            <label className="coach-toggle">
              <input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /> Hints before I act
            </label>
          </div>
          {advice && showHints && (
            <p className="coach-hint">
              <b>Try: {actionNames[advice.action]}.</b> {advice.reason}
            </p>
          )}
          {advice && !showHints && <p className="coach-hint muted">Make your move and I'll tell you how it compares with basic strategy.</p>}
          {feedback && (
            <p className={`coach-feedback ${feedback.good ? "good" : "bad"}`} role="status">
              {feedback.text}
            </p>
          )}
          {!advice && !feedback && <p className="muted">Deal a hand and I'll talk you through it. The Learn button has the rules and the full strategy chart.</p>}
          <p className="coach-stat">
            {accuracy === null ? "No decisions yet." : `Matched basic strategy on ${arcade.coachRight} of ${arcade.coachTotal} decisions (${accuracy}%).`}
          </p>
        </aside>
      </div>
    </GameFrame>
  );
}

function StrategyChart({ spot }: { spot: { table: string; row: number; col: number } | null }) {
  const tables: { id: "hard" | "soft" | "pairs"; title: string; rows: number[]; label: (row: number) => string }[] = [
    { id: "hard", title: "Hard totals", rows: [17, 16, 15, 14, 13, 12, 11, 10, 9, 8], label: (row) => (row === 17 ? "17+" : row === 8 ? "8 or less" : String(row)) },
    { id: "soft", title: "Soft totals", rows: [20, 19, 18, 17, 16, 15, 14, 13], label: (row) => `A,${row - 11}` },
    {
      id: "pairs",
      title: "Pairs",
      rows: [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
      label: (row) => (row === 11 ? "A,A" : row === 10 ? "10,10" : `${row},${row}`),
    },
  ];
  return (
    <div className="strategy-charts">
      {tables.map((table) => (
        <table key={table.id} className="strategy-chart">
          <caption>{table.title}</caption>
          <thead>
            <tr>
              <th scope="col">You</th>
              {chartColumns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row}>
                <th scope="row">{table.label(row)}</th>
                {strategyCharts[table.id][row].map((code, col) => {
                  const here = spot && spot.table === table.id && spot.row === row && spot.col === col;
                  const shown = code ?? "·";
                  return (
                    <td key={col} className={`cell-${code ?? "none"}${here ? " here" : ""}`}>
                      {shown}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <p className="muted">Dealer's up card across the top. In the pairs table, a dot means don't split: play it as a normal total.</p>
    </div>
  );
}
