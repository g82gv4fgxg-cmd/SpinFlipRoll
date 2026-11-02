import { useEffect, useMemo, useRef, useState } from "react";
import GameFrame, { Lesson, PlayChipsNote } from "../components/GameFrame";
import PlayingCard, { CardSlot } from "../components/PlayingCard";
import type { Card, Suit } from "../games/cards";
import { rankName } from "../games/cards";
import { act, adviseFor, botAction, createTable, evaluate, legalActions, pot, startHand, streetLessons, streetNames } from "../games/poker";
import type { PokerAction, Table } from "../games/poker";
import { useTimers } from "../hooks";
import type { Shell } from "../shell";
import { sounds, unlockAudio } from "../sound";
import { startingChips } from "../storage";
import type { ArcadeStats } from "../types";

type PokerScreenProps = {
  shell: Shell;
  arcade: ArcadeStats;
  setArcade: (update: (current: ArcadeStats) => Partial<ArcadeStats>) => void;
  onBack: () => void;
};

const format = (value: number) => value.toLocaleString("en-AU");
const percent = (value: number) => `${Math.round(value * 100)}%`;
const roundTen = (value: number) => Math.round(value / 10) * 10;

function startingHandName(hole: Card[]) {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  if (a.rank === b.rank) return `Pocket ${rankName(a.rank, true)}`;
  return `${rankName(a.rank)}-${rankName(b.rank)} ${a.suit === b.suit ? "suited" : "offsuit"}`;
}

/** A rough beginner's guide to two-card starting hands. */
function startingHandTip(hole: Card[]) {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const suited = a.suit === b.suit;
  if (a.rank === b.rank) return a.rank >= 10 ? "A premium pair: play it strongly." : a.rank >= 7 ? "A middle pair: good, but watch for overcards on the flop." : "A small pair: cheap to see a flop, hoping to hit three of a kind.";
  if (a.rank === 14 && b.rank >= 11) return "Two big cards: a strong start.";
  if (a.rank >= 12 && b.rank >= 10 && suited) return "Suited high cards: good for straights, flushes and top pairs.";
  if (a.rank - b.rank === 1 && suited) return "Suited connectors: can make straights and flushes, best played cheaply.";
  if (a.rank === 14) return "An Ace with a weak kicker: careful, a pair of Aces may still lose to a better kicker.";
  if (a.rank < 10 && a.rank - b.rank > 3) return "Low, unconnected cards: usually a fold unless you can check for free.";
  return "A middling hand: play it when it's cheap.";
}

const seatStyleNotes: Record<string, string> = { tight: "plays few hands", loose: "plays lots of hands and bluffs", steady: "plays by the numbers" };

const handExamples: { name: string; cards: string; note: string }[] = [
  { name: "Royal flush", cards: "As Ks Qs Js Ts", note: "A, K, Q, J, 10, all one suit." },
  { name: "Straight flush", cards: "9h 8h 7h 6h 5h", note: "Five in a row, all one suit." },
  { name: "Four of a kind", cards: "Qc Qd Qh Qs 4d", note: "Four cards of one rank." },
  { name: "Full house", cards: "Kd Kc Ks 7h 7d", note: "Three of a kind plus a pair." },
  { name: "Flush", cards: "Ad Jd 8d 6d 2d", note: "Any five of one suit." },
  { name: "Straight", cards: "Ts 9d 8c 7h 6s", note: "Five in a row, mixed suits. A can be high or low." },
  { name: "Three of a kind", cards: "7s 7d 7c Kh 2d", note: "Three cards of one rank." },
  { name: "Two pair", cards: "Js Jd 4c 4h Ad", note: "Two different pairs." },
  { name: "Pair", cards: "Ts Td 8c 4h 2d", note: "Two cards of one rank." },
  { name: "High card", cards: "As Qd 8c 4h 2d", note: "None of the above: the highest card plays." },
];

function cardsFrom(text: string): Card[] {
  return text.split(" ").map((code) => ({ rank: "23456789TJQKA".indexOf(code[0]) + 2, suit: code[1].toUpperCase() as Suit }));
}

export default function PokerScreen({ shell, arcade, setArcade, onBack }: PokerScreenProps) {
  const [table, setTable] = useState<Table>(() => createTable(arcade.pokerChips >= 20 ? arcade.pokerChips : startingChips));
  const [feedback, setFeedback] = useState<{ match: boolean; text: string } | null>(null);
  const [showHints, setShowHints] = useState(true);
  const [raiseTo, setRaiseTo] = useState(0);
  const { later } = useTimers();
  const previous = useRef(table);
  const botDelay = shell.reducedMotion ? 250 : 850;

  const human = table.seats[0];
  const inHand = table.handNumber > 0 && table.street !== "showdown";
  const humanTurn = inHand && table.toAct === 0;
  const legal = humanTurn ? legalActions(table) : null;
  const advice = useMemo(() => (humanTurn ? adviseFor(table, 0, 900) : null), [table, humanTurn]);
  const potNow = pot(table);
  const opponentsLeft = table.seats.filter((seat, index) => index !== 0 && !seat.folded).length;
  const showdownCards = table.street === "showdown" && table.seats.filter((seat) => !seat.folded).length > 1;
  const winners = new Set((table.payouts ?? []).filter((payout) => payout.hand !== "Uncalled chips returned").map((payout) => payout.seat));
  const canDeal = !inHand && human.chips >= table.bigBlind;

  // Computer players take their turns after a short pause.
  useEffect(() => {
    if (!inHand || table.toAct === 0) return;
    const id = window.setTimeout(() => setTable(act(table, botAction(table))), botDelay);
    return () => window.clearTimeout(id);
  }, [table, inHand, botDelay]);

  // Reset the raise slider each time it becomes your turn.
  useEffect(() => {
    if (legal) setRaiseTo(legal.minRaiseTo);
    // Only when a new decision starts, not on every render.
  }, [humanTurn, table.street, table.currentBet]);

  // Sounds for new cards and the result, and saving your chips after each hand.
  useEffect(() => {
    const before = previous.current;
    previous.current = table;
    if (table.board.length > before.board.length) for (let i = 0; i < table.board.length - before.board.length; i++) later(() => sounds.cardDeal(), i * 90);
    if (table.street === "showdown" && before.street !== "showdown" && table.handNumber > 0) {
      setArcade(() => ({ pokerChips: table.seats[0].chips }));
      const won = (table.payouts ?? []).some((payout) => payout.seat === 0 && payout.hand !== "Uncalled chips returned");
      if (won) sounds.handWin(later);
      else if (!table.seats[0].folded) sounds.handLose();
    }
  }, [table, later, setArcade]);

  function deal() {
    unlockAudio();
    setFeedback(null);
    for (let i = 0; i < 8; i++) later(() => sounds.cardDeal(), i * 70);
    setTable((current) => startHand(current));
  }

  function rebuy() {
    setTable((current) => {
      const next = structuredClone(current);
      next.seats[0].chips = startingChips;
      return next;
    });
    setArcade(() => ({ pokerChips: startingChips }));
    shell.toast(`Bought back in for ${format(startingChips)} play chips.`);
  }

  function play(action: PokerAction) {
    if (!humanTurn || !legal || !advice) return;
    unlockAudio();
    const chosen = action.type === "call" && legal.toCall === 0 ? "check" : action.type;
    const match = chosen === advice.action;
    const coachPick = advice.action === "raise" ? `raise to ${format(advice.raiseTo ?? legal.minRaiseTo)}` : advice.action;
    let text = match ? `The coach agrees. ${advice.reason}` : `The coach would ${coachPick} here. ${advice.reason}`;
    if (chosen === "fold" && legal.canCheck) text = "Folding when you could check for free gives up the pot for nothing. Check instead.";
    setFeedback({ match, text });
    if (chosen !== "fold" && chosen !== "check") sounds.chips();
    setTable(act(table, action));
  }

  /** Plays out the rest of the hand straight away (handy after you fold). */
  function fastForward() {
    let next = table;
    let guard = 0;
    while (next.street !== "showdown" && next.toAct !== 0 && guard++ < 200) next = act(next, botAction(next));
    setTable(next);
  }

  function setRaiseFraction(fraction: number) {
    if (!legal) return;
    const target = table.currentBet + (potNow + legal.toCall) * fraction;
    setRaiseTo(Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, roundTen(target))));
  }

  const yourHand = human.hole.length === 2 ? (table.board.length >= 3 ? evaluate([...human.hole, ...table.board]).name : startingHandName(human.hole)) : null;

  const learn = (
    <>
      <Lesson title="The goal">
        <p>Win chips by having the best five-card hand at the end, or by betting so that everyone else folds. You make your hand from your two private cards plus five shared cards.</p>
      </Lesson>
      <Lesson title="Hand rankings (best first)">
        <ol className="rank-list">
          {handExamples.map((example) => (
            <li key={example.name}>
              <div className="rank-cards">
                {cardsFrom(example.cards).map((card, index) => (
                  <PlayingCard key={index} card={card} small />
                ))}
              </div>
              <p>
                <b>{example.name}</b> {example.note}
              </p>
            </li>
          ))}
        </ol>
        <p>If two players have the same kind of hand, the higher cards win, then the next highest (the "kicker").</p>
      </Lesson>
      <Lesson title="How a hand goes">
        <ol>
          {(["preflop", "flop", "turn", "river", "showdown"] as const).map((street) => (
            <li key={street}>
              <b>{streetNames[street]}.</b> {streetLessons[street]}
            </li>
          ))}
        </ol>
      </Lesson>
      <Lesson title="Your options">
        <ul>
          <li><b>Check</b>: pass without betting (only if nobody has bet).</li>
          <li><b>Bet or raise</b>: put in more chips. Others must match it to stay in.</li>
          <li><b>Call</b>: match the current bet.</li>
          <li><b>Fold</b>: give up the hand and any chips you've put in.</li>
          <li><b>All in</b>: bet everything. If you're called by bigger stacks, side pots keep it fair.</li>
        </ul>
      </Lesson>
      <Lesson title="Pot odds: should I call?">
        <p>Compare the price of calling with how often you'll win.</p>
        <p className="formula">chance needed = call ÷ (pot + call)</p>
        <p>
          Example: the pot is 100 and it costs 50 to call.
          <br />
          chance needed = 50 ÷ (100 + 50)
          <br />= 50 ÷ 150
          <br />≈ 33%
        </p>
        <p>If you win more often than that, calling makes chips over time. The coach estimates your win chance by dealing out the rest of the cards hundreds of times.</p>
      </Lesson>
      <Lesson title="Beginner tips">
        <ul>
          <li>Play fewer, stronger starting hands: big pairs and big cards.</li>
          <li>Acting last (being the dealer) is an advantage: you see what others do first.</li>
          <li>Don't chase draws when the price is too high for your chance.</li>
          <li>
            Your opponents: Ava {seatStyleNotes.tight}, Bo {seatStyleNotes.loose}, Cy {seatStyleNotes.steady}.
          </li>
        </ul>
        <PlayChipsNote />
      </Lesson>
    </>
  );

  const seatPosition = ["bottom", "left", "top", "right"];

  return (
    <GameFrame
      shell={shell}
      title="Texas Hold'em"
      className="poker-screen"
      onBack={onBack}
      stats={<span className="chip-count">{format(human.chips)} chips</span>}
      learn={learn}
      data={{ street: table.handNumber === 0 ? "waiting" : table.street, turn: inHand ? table.seats[table.toAct].name : "none", hand: table.handNumber, chips: human.chips }}
    >
      <div className="table-layout">
        <section className="felt poker-felt" aria-label="Poker table">
          {table.seats.map((seat, index) => {
            const faceUp = index === 0 || (showdownCards && !seat.folded);
            const acting = inHand && table.toAct === index;
            return (
              <div
                key={seat.name}
                className={`seat seat-${seatPosition[index]}${acting ? " acting" : ""}${seat.folded && table.handNumber > 0 ? " folded" : ""}${winners.has(index) && table.street === "showdown" ? " winner" : ""}`}
              >
                <div className="seat-cards">
                  {seat.hole.map((card, cardIndex) => (
                    <PlayingCard key={`${table.handNumber}-${cardIndex}-${faceUp}`} card={card} hidden={!faceUp} small={index !== 0} index={cardIndex * 4 + index} />
                  ))}
                </div>
                <div className="seat-plate">
                  {table.dealer === index && table.handNumber > 0 && (
                    <i className="dealer-button" title="Dealer">
                      D
                    </i>
                  )}
                  <b>{seat.name}</b>
                  <span>{format(seat.chips)}</span>
                </div>
                {seat.lastAction && <span className="seat-action">{seat.lastAction}</span>}
                {seat.bet > 0 && inHand && <span className="seat-bet">{format(seat.bet)}</span>}
                {showdownCards && !seat.folded && seat.hole.length === 2 && (
                  <span className="seat-hand">{evaluate([...seat.hole, ...table.board]).name}</span>
                )}
              </div>
            );
          })}
          <div className="board">
            <p className="street-name">{table.handNumber === 0 ? "Texas Hold'em" : streetNames[table.street]}</p>
            <div className="card-row">
              {Array.from({ length: 5 }, (_, index) =>
                table.board[index] ? <PlayingCard key={`${table.handNumber}-b${index}`} card={table.board[index]} index={index < 3 ? index : 0} /> : <CardSlot key={`slot-${index}`} />
              )}
            </div>
            <p className="pot">Pot {format(potNow)}</p>
          </div>
        </section>

        <section className="poker-controls" aria-label="Your move">
          {humanTurn && legal && (
            <>
              <div className="action-row">
                <button className="act-fold" onClick={() => play({ type: "fold" })}>
                  Fold
                </button>
                {legal.canCheck ? (
                  <button className="act-check" onClick={() => play({ type: "check" })}>
                    Check
                  </button>
                ) : (
                  <button className="act-call" onClick={() => play({ type: "call" })}>
                    Call {format(legal.toCall)}
                    {legal.toCall >= human.chips ? " (all in)" : ""}
                  </button>
                )}
                {legal.canRaise && (
                  <button className="act-raise" onClick={() => play({ type: "raise", to: raiseTo })}>
                    {raiseTo >= legal.maxRaiseTo ? "All in" : table.currentBet === 0 ? "Bet" : "Raise to"} {format(raiseTo)}
                  </button>
                )}
              </div>
              {legal.canRaise && legal.maxRaiseTo > legal.minRaiseTo && (
                <div className="raise-row">
                  <input
                    type="range"
                    min={legal.minRaiseTo}
                    max={legal.maxRaiseTo}
                    step={10}
                    value={raiseTo}
                    onChange={(event) => setRaiseTo(Number(event.target.value))}
                    aria-label="Raise amount"
                  />
                  <div className="raise-presets">
                    <button className="secondary" onClick={() => setRaiseTo(legal.minRaiseTo)}>
                      Min
                    </button>
                    <button className="secondary" onClick={() => setRaiseFraction(0.5)}>
                      ½ pot
                    </button>
                    <button className="secondary" onClick={() => setRaiseFraction(1)}>
                      Pot
                    </button>
                    <button className="secondary" onClick={() => setRaiseTo(legal.maxRaiseTo)}>
                      All in
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {inHand && !humanTurn && (
            <div className="action-row">
              <p className="waiting">{human.folded ? "You folded." : human.allIn ? "You're all in." : `${table.seats[table.toAct].name} is thinking…`}</p>
              {(human.folded || human.allIn) && (
                <button className="secondary" onClick={fastForward}>
                  Skip to the end
                </button>
              )}
            </div>
          )}
          {!inHand && (
            <div className="action-row">
              {canDeal ? (
                <button onClick={deal} autoFocus={table.handNumber > 0}>
                  {table.handNumber === 0 ? "Deal the first hand" : "Next hand"}
                </button>
              ) : (
                <>
                  <p className="waiting">You're out of chips. They're only pretend.</p>
                  <button onClick={rebuy}>Buy back in for {format(startingChips)}</button>
                </>
              )}
            </div>
          )}
          {table.street === "showdown" && table.payouts && (
            <ul className="results-list" role="status">
              {table.payouts.map((payout) => (
                <li key={payout.seat} className={payout.seat === 0 ? "you" : ""}>
                  <b>{table.seats[payout.seat].name}</b> {payout.hand === "Uncalled chips returned" ? `gets ${format(payout.amount)} back` : `wins ${format(payout.amount)}`}
                  {payout.hand !== "Uncalled chips returned" && <span> · {payout.hand}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="coach-card" aria-label="Coach">
          <div className="coach-head">
            <h2>Coach</h2>
            <label className="coach-toggle">
              <input type="checkbox" checked={showHints} onChange={(event) => setShowHints(event.target.checked)} /> Hints before I act
            </label>
          </div>
          {yourHand && (
            <p className="coach-hand">
              You have <b>{yourHand}</b>.{table.street === "preflop" && human.hole.length === 2 ? ` ${startingHandTip(human.hole)}` : ""}
            </p>
          )}
          {advice && legal && (
            <>
              <div className="meter" aria-label={`Win chance about ${percent(advice.chance)}`}>
                <span style={{ width: percent(advice.chance) }} />
              </div>
              <p className="coach-numbers">
                Win chance about <b>{percent(advice.chance)}</b> against {opponentsLeft} {opponentsLeft === 1 ? "player" : "players"}
                {legal.toCall > 0 && (
                  <>
                    {" "}
                    · calling {format(legal.toCall)} into {format(potNow)} needs <b>{percent(advice.potOdds)}</b>
                  </>
                )}
              </p>
              {showHints && (
                <p className="coach-hint">
                  <b>Try: {advice.action === "raise" ? `${table.currentBet === 0 ? "bet" : "raise to"} ${format(advice.raiseTo ?? legal.minRaiseTo)}` : advice.action}.</b> {advice.reason}
                </p>
              )}
            </>
          )}
          {feedback && (
            <p className={`coach-feedback ${feedback.match ? "good" : "bad"}`} role="status">
              {feedback.text}
            </p>
          )}
          {table.handNumber > 0 && <p className="muted lesson-line">{streetLessons[table.street]}</p>}
          {table.handNumber === 0 && <p className="muted">Deal a hand and I'll show your win chance and pot odds at each decision. Open Learn for the hand rankings.</p>}
          {table.log.length > 0 && (
            <ol className="table-log" aria-label="What happened">
              {table.log.slice(-6).map((line, index) => (
                <li key={`${table.log.length}-${index}`}>{line}</li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </GameFrame>
  );
}
