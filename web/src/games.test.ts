import { describe, expect, it } from "vitest";
import { basicStrategy, canDouble, canSplit, dealerMustHit, handValue, isBlackjack, settle, Shoe, type PlayerHand } from "./games/blackjack";
import type { Card, Suit } from "./games/cards";
import { act, botAction, createTable, evaluate, legalActions, pot, startHand, winChance, type Table } from "./games/poker";
import {
  aimGuide,
  ballRadius,
  cloneBalls,
  judge,
  legalTargets,
  newEvents,
  newPoolState,
  planShot,
  pockets,
  rack,
  rollDecel,
  simulate,
  step,
  strike,
  tableHeight,
  tableWidth,
  type Ball,
  type PoolState,
} from "./games/pool";

/** "As" = Ace of Spades, "Td" = Ten of Diamonds, "7c" = Seven of Clubs. */
function cards(text: string): Card[] {
  return text.split(" ").map((code) => ({ rank: "23456789TJQKA".indexOf(code[0]) + 2, suit: code[1].toUpperCase() as Suit }));
}

const hand = (text: string, extra: Partial<PlayerHand> = {}): PlayerHand => ({ cards: cards(text), bet: 10, doubled: false, done: false, fromSplit: false, ...extra });

describe("blackjack", () => {
  it("counts Aces as 1 or 11", () => {
    expect(handValue(cards("As 6d"))).toEqual({ total: 17, soft: true });
    expect(handValue(cards("As 6d Kc"))).toEqual({ total: 17, soft: false });
    expect(handValue(cards("As Ad"))).toEqual({ total: 12, soft: true });
    expect(handValue(cards("As Ad 9c"))).toEqual({ total: 21, soft: true });
    expect(handValue(cards("Ks Qd 5c"))).toEqual({ total: 25, soft: false });
  });

  it("only counts a two-card 21 as blackjack when it isn't from a split", () => {
    expect(isBlackjack(cards("As Kd"))).toBe(true);
    expect(isBlackjack(cards("As Kd"), true)).toBe(false);
    expect(isBlackjack(cards("7s 7d 7c"))).toBe(false);
  });

  it("makes the dealer stand on soft 17", () => {
    expect(dealerMustHit(cards("As 6d"))).toBe(false);
    expect(dealerMustHit(cards("Ts 6d"))).toBe(true);
    expect(dealerMustHit(cards("Ts 7d"))).toBe(false);
  });

  it("settles hands with the stake included", () => {
    expect(settle(hand("As Kd"), cards("Ts 9d"))).toEqual({ outcome: "blackjack", payout: 25 });
    expect(settle(hand("As Kd"), cards("Ah Qd"))).toEqual({ outcome: "push", payout: 10 });
    expect(settle(hand("Ts 9d"), cards("Ah Qd"))).toEqual({ outcome: "lose", payout: 0 });
    expect(settle(hand("Ts 5d"), cards("Th 6d 9c"))).toEqual({ outcome: "win", payout: 20 });
    expect(settle(hand("Ts 5d 8c"), cards("Th 6d 9c"))).toEqual({ outcome: "lose", payout: 0 });
    expect(settle(hand("Ts 8d"), cards("Th 8c"))).toEqual({ outcome: "push", payout: 10 });
    expect(settle(hand("As Kd", { fromSplit: true }), cards("Th 9c"))).toEqual({ outcome: "win", payout: 20 });
  });

  it("limits doubling and splitting", () => {
    expect(canDouble(hand("6s 5d"), 100)).toBe(true);
    expect(canDouble(hand("6s 5d"), 5)).toBe(false);
    expect(canDouble(hand("2s 3d 6c"), 100)).toBe(false);
    expect(canSplit(hand("8s 8d"), 1, 100)).toBe(true);
    expect(canSplit(hand("Ks Qd"), 1, 100)).toBe(true);
    expect(canSplit(hand("8s 8d"), 4, 100)).toBe(false);
    expect(canSplit(hand("As Ad", { fromSplit: true }), 2, 100)).toBe(false);
  });

  it("gives textbook basic strategy", () => {
    const both = { canDouble: true, canSplit: true };
    const neither = { canDouble: false, canSplit: false };
    const up = (code: string) => cards(code)[0];
    expect(basicStrategy(hand("6s 5d"), up("Td"), both).action).toBe("double");
    expect(basicStrategy(hand("6s 5d"), up("Ad"), both).action).toBe("hit");
    expect(basicStrategy(hand("Ts 6d"), up("Td"), neither).action).toBe("hit");
    expect(basicStrategy(hand("Ts 6d"), up("6d"), neither).action).toBe("stand");
    expect(basicStrategy(hand("Ts 2d"), up("3d"), neither).action).toBe("hit");
    expect(basicStrategy(hand("Ts 2d"), up("4d"), neither).action).toBe("stand");
    expect(basicStrategy(hand("8s 8d"), up("Ad"), both).action).toBe("split");
    expect(basicStrategy(hand("Ts Td"), up("6d"), both).action).toBe("stand");
    expect(basicStrategy(hand("9s 9d"), up("7d"), both).action).toBe("stand");
    expect(basicStrategy(hand("As 7d"), up("9d"), both).action).toBe("hit");
    expect(basicStrategy(hand("As 7d"), up("2d"), both).action).toBe("stand");
    expect(basicStrategy(hand("As 7d"), up("5d"), both).action).toBe("double");
    expect(basicStrategy(hand("As 7d"), up("5d"), neither).action).toBe("stand");
    expect(basicStrategy(hand("2s 3d 6c"), up("6d"), neither).action).toBe("hit");
    expect(basicStrategy(hand("As Ad"), up("6d"), neither).action).toBe("hit");
    for (const advice of [basicStrategy(hand("6s 5d"), up("Td"), both), basicStrategy(hand("Ts 2d"), up("4d"), neither)]) {
      expect(advice.reason.length).toBeGreaterThan(10);
    }
  });

  it("deals from a six-deck shoe and asks for a reshuffle near the end", () => {
    const shoe = new Shoe();
    expect(shoe.cards).toHaveLength(312);
    expect(shoe.needsShuffle()).toBe(false);
    while (shoe.cards.length > 77) shoe.draw();
    expect(shoe.needsShuffle()).toBe(true);
    shoe.reshuffle();
    expect(shoe.cards).toHaveLength(312);
  });
});

describe("poker hand evaluation", () => {
  it("ranks every category in order", () => {
    const ordered = [
      "Ts Js Qs Ks As",
      "5h 6h 7h 8h 9h",
      "9s 9d 9c 9h 2d",
      "Ks Kd Kc 7h 7d",
      "2c 7c 9c Jc Kc",
      "5s 6d 7c 8h 9s",
      "As 2d 3c 4h 5s",
      "Qs Qd Qc 7h 2d",
      "Js Jd 4c 4h Ad",
      "Ts Td 8c 4h 2d",
      "As Qd 8c 4h 2d",
    ].map((text) => evaluate(cards(text)));
    for (let i = 1; i < ordered.length; i++) expect(ordered[i - 1].score).toBeGreaterThan(ordered[i].score);
    expect(ordered[0].name).toBe("Royal flush");
    expect(ordered[3].name).toBe("Full house, Kings full of Sevens");
  });

  it("picks the best five of seven and uses kickers", () => {
    expect(evaluate(cards("As Ad Kc Kh 2d 2c 7s")).name).toMatch(/Two pair, Aces and Kings/);
    const strongKicker = evaluate(cards("As Kd 9c 9h 4d 3c 2s"));
    const weakKicker = evaluate(cards("As Qd 9c 9h 4d 3c 2s"));
    expect(strongKicker.score).toBeGreaterThan(weakKicker.score);
    expect(evaluate(cards("2h 3h 4h 5h 9h Ah Kd")).category).toBe(8);
    expect(evaluate(cards("Ks Kd Kc 7h 7d 7c 2s")).name).toBe("Full house, Kings full of Sevens");
  });

  it("estimates win chances sensibly", () => {
    const aces = winChance(cards("As Ad"), [], 1, 3000);
    expect(aces).toBeGreaterThan(0.79);
    expect(aces).toBeLessThan(0.91);
    expect(winChance(cards("As Ks"), cards("Qs Js Ts 2d 3c"), 3, 200)).toBe(1);
    expect(winChance(cards("7c 2d"), [], 3, 1500)).toBeLessThan(0.2);
  });
});

describe("poker table", () => {
  it("posts blinds and starts with the player after the big blind", () => {
    const table = startHand(createTable(1000));
    expect(pot(table)).toBe(30);
    expect(table.currentBet).toBe(20);
    expect(table.seats.every((seat) => seat.hole.length === 2)).toBe(true);
    const { toCall, canCheck } = legalActions(table);
    expect(toCall).toBe(20);
    expect(canCheck).toBe(false);
  });

  it("builds side pots for an all-in player", () => {
    const seat = (name: string, hole: string, committed: number, chips: number, extra: object = {}) => ({
      name,
      human: name === "You",
      chips,
      hole: cards(hole),
      bet: 0,
      committed,
      folded: false,
      allIn: chips === 0,
      acted: true,
      style: "steady" as const,
      lastAction: "",
      ...extra,
    });
    const table: Table = {
      seats: [
        seat("You", "As Ad", 100, 0),
        seat("Ava", "Ks Kd", 300, 700),
        seat("Bo", "Qs Qd", 300, 700, { acted: false }),
        seat("Cy", "3h 4h", 20, 980, { folded: true }),
      ],
      dealer: 3,
      smallBlind: 10,
      bigBlind: 20,
      deck: [],
      board: cards("2c 7d 9h Jc 4s"),
      street: "river",
      currentBet: 0,
      minRaise: 20,
      toAct: 2,
      handNumber: 1,
      log: [],
      payouts: null,
    };
    const done = act(table, { type: "check" });
    expect(done.street).toBe("showdown");
    // You win everything up to your 100 from each player (80 + 240); Ava wins the rest with Kings.
    expect(done.payouts).toEqual(
      expect.arrayContaining([
        { seat: 0, amount: 320, hand: "Pair of Aces" },
        { seat: 1, amount: 400, hand: "Pair of Kings" },
      ])
    );
    expect(done.seats.map((s) => s.chips)).toEqual([320, 1100, 700, 980]);
  });

  it("never creates or loses chips over many computer-played hands", { timeout: 60000 }, () => {
    let table = createTable(1000);
    for (let handNumber = 0; handNumber < 25; handNumber++) {
      table = startHand(table);
      const total = table.seats.reduce((sum, seat) => sum + seat.chips + seat.committed, 0);
      let guard = 0;
      while (table.street !== "showdown" && guard++ < 200) table = act(table, botAction(table));
      expect(table.street).toBe("showdown");
      expect(table.seats.reduce((sum, seat) => sum + seat.chips, 0)).toBe(total);
      expect(table.seats.every((seat) => seat.chips >= 0)).toBe(true);
      if (table.seats[0].chips === 0) table.seats[0].chips = 1000;
    }
  });
});

function ball(id: number, x: number, y: number, extra: Partial<Ball> = {}): Ball {
  return { id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, pocketed: false, q: [1, 0, 0, 0], ...extra };
}

describe("pool physics", () => {
  it("racks fifteen balls with the black in the middle and no overlaps", () => {
    const balls = rack();
    expect(balls).toHaveLength(16);
    expect(new Set(balls.map((b) => b.id)).size).toBe(16);
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        expect(Math.hypot(balls[i].x - balls[j].x, balls[i].y - balls[j].y)).toBeGreaterThanOrEqual(ballRadius * 2);
      }
    }
    const black = balls.find((b) => b.id === 8)!;
    const objectBalls = balls.filter((b) => b.id !== 0);
    const middleX = objectBalls.reduce((sum, b) => sum + b.x, 0) / 15;
    expect(Math.abs(black.x - middleX)).toBeLessThan(ballRadius * 2);
  });

  it("slows a rolling ball to a stop over v²/2a", () => {
    const speed = 700;
    const balls = [ball(0, 400, 635, { vx: speed, wy: -speed / ballRadius })];
    simulate(balls, 1 / 600);
    const expected = speed ** 2 / (2 * rollDecel);
    expect(balls[0].x - 400).toBeGreaterThan(expected * 0.97);
    expect(balls[0].x - 400).toBeLessThan(expected * 1.03);
  });

  it("turns a sliding ball into a rolling one at five sevenths of its speed", () => {
    const balls = [ball(0, 300, 635, { vx: 2000 })];
    const events = newEvents();
    for (let i = 0; i < 300; i++) step(balls, 1 / 600, events);
    expect(events.cushionHits).toBe(0);
    const rolling = Math.abs(balls[0].vx + ballRadius * balls[0].wy) < 1;
    expect(rolling).toBe(true);
    // 5/7 of 2000, less up to half a second of rolling resistance.
    expect(balls[0].vx).toBeGreaterThan(2000 * (5 / 7) - rollDecel * 0.5);
    expect(balls[0].vx).toBeLessThan(2000 * (5 / 7));
  });

  it("keeps momentum in a ball-to-ball hit and nearly stops the cue ball on a full hit", () => {
    const balls = [ball(0, 1000, 635, { vx: 2000 }), ball(1, 1000 + ballRadius * 2 + 0.5, 635)];
    const events = newEvents();
    for (let i = 0; i < 4; i++) step(balls, 1 / 2000, events);
    expect(events.firstHit).toBe(1);
    expect(balls[1].vx).toBeGreaterThan(1900);
    expect(Math.abs(balls[0].vx)).toBeLessThan(100);
    expect(balls[0].vx + balls[1].vx).toBeGreaterThan(1950);
  });

  it("follows with top spin and draws back with back spin", () => {
    // The cue ball stops dead on a full hit with no spin, so where it ends up shows the spin.
    const follow = [ball(0, 400, 635), ball(1, 900, 635)];
    strike(follow, 0, 0.08, { x: 0, y: 0.5 });
    simulate(follow);
    expect(follow[0].x).toBeGreaterThan(1000);

    const draw = [ball(0, 400, 635), ball(1, 700, 635)];
    strike(draw, 0, 0.15, { x: 0, y: -0.6 });
    simulate(draw);
    expect(draw[0].x).toBeLessThan(600);
  });

  it("bounces off cushions, and side spin changes the angle", () => {
    const plain = [ball(0, 2000, 400, { vx: 1500 })];
    const events = newEvents();
    for (let i = 0; i < 300; i++) step(plain, 1 / 600, events);
    expect(events.cushionHits).toBe(1);
    expect(plain[0].vx).toBeLessThan(0);

    const english = [ball(0, 2000, 400)];
    strike(english, 0, 0.2, { x: 0.5, y: 0 });
    for (let i = 0; i < 600; i++) step(english, 1 / 600, newEvents());
    expect(english[0].vx).toBeLessThan(0);
    expect(english[0].vy).toBeGreaterThan(20);
  });

  it("drops balls sent straight at a corner and a side pocket", () => {
    const corner = [ball(0, 600, 600)];
    strike(corner, Math.atan2(pockets[0].y - 600, pockets[0].x - 600), 0.4, { x: 0, y: 0 });
    expect(simulate(corner).pocketed).toEqual([0]);

    const side = [ball(0, tableWidth / 2, 700)];
    strike(side, Math.PI / 2, 0.3, { x: 0, y: 0 });
    expect(simulate(side).pocketed).toEqual([0]);
  });

  it("keeps every ball on the table or in a pocket after a break", () => {
    const balls = rack();
    balls[0].x = 500;
    strike(balls, 0, 1, { x: 0, y: 0 });
    simulate(balls);
    for (const b of balls) {
      if (b.pocketed) continue;
      expect(b.x).toBeGreaterThanOrEqual(ballRadius - 1);
      expect(b.x).toBeLessThanOrEqual(tableWidth - ballRadius + 1);
      expect(b.y).toBeGreaterThanOrEqual(ballRadius - 1);
      expect(b.y).toBeLessThanOrEqual(tableHeight - ballRadius + 1);
    }
  });

  it("predicts the object ball path and the 90 degree tangent line", () => {
    const straight = aimGuide([ball(0, 500, 635), ball(1, 1000, 635)], 0);
    expect(straight.target?.id).toBe(1);
    expect(straight.contact.x).toBeCloseTo(1000 - ballRadius * 2, 3);
    expect(straight.objectDirection!.x).toBeCloseTo(1, 5);
    expect(straight.cueDirection).toBeNull();

    const cut = aimGuide([ball(0, 500, 635), ball(1, 1000, 635 + ballRadius)], 0);
    expect(cut.target?.id).toBe(1);
    const { objectDirection, cueDirection } = cut;
    expect(objectDirection!.x * cueDirection!.x + objectDirection!.y * cueDirection!.y).toBeCloseTo(0, 5);
    expect(objectDirection!.y).toBeGreaterThan(0);
    expect(cueDirection!.y).toBeLessThan(0);

    expect(aimGuide([ball(0, 500, 635)], Math.PI).target).toBeNull();
  });
});

describe("8-ball rules", () => {
  const names: [string, string] = ["You", "Ava"];
  const table = (ids: number[]) => [ball(0, 300, 300), ...ids.map((id, index) => ball(id, 600 + index * 80, 600))];
  const playing = (extra: Partial<PoolState> = {}): PoolState => ({ ...newPoolState(0), breakShot: false, ballInHand: false, ...extra });
  const shot = (firstHit: number | null, pocketed: number[]) => ({ ...newEvents(), firstHit, pocketed });

  it("claims a group with the first ball potted on an open table", () => {
    const next = judge(playing(), table([1, 9, 8]), shot(9, [9]), names);
    expect(next.groups).toEqual(["stripes", "solids"]);
    expect(next.turn).toBe(0);
    expect(next.message).toContain("You are on stripes");
  });

  it("passes the turn when nothing goes in", () => {
    const next = judge(playing({ groups: ["solids", "stripes"] }), table([1, 9, 8]), shot(1, []), names);
    expect(next.turn).toBe(1);
    expect(next.ballInHand).toBe(false);
  });

  it("gives ball in hand for a scratch, a miss, or hitting the wrong ball first", () => {
    const state = playing({ groups: ["solids", "stripes"] });
    for (const events of [shot(1, [0]), shot(null, []), shot(9, [])]) {
      const next = judge(state, table([1, 9, 8]), events, names);
      expect(next.turn).toBe(1);
      expect(next.ballInHand).toBe(true);
      expect(next.message).toMatch(/^Foul/);
    }
    expect(judge(playing(), table([1, 9, 8]), shot(8, []), names).ballInHand).toBe(true);
  });

  it("only allows the black once a group is cleared", () => {
    expect(legalTargets(table([1, 9, 8]), playing({ groups: ["solids", "stripes"] }))).toEqual([1]);
    expect(legalTargets(table([9, 8]), playing({ groups: ["solids", "stripes"] }))).toEqual([8]);
  });

  it("wins or loses on the black", () => {
    const cleared = judge(playing({ groups: ["solids", "stripes"] }), table([9, 8]), shot(8, [8]), names);
    expect(cleared.winner).toBe(0);
    const early = judge(playing({ groups: ["solids", "stripes"] }), table([1, 9, 8]), shot(1, [1, 8]), names);
    expect(early.winner).toBe(1);
    const scratched = judge(playing({ groups: ["solids", "stripes"] }), table([9, 8]), shot(8, [8, 0]), names);
    expect(scratched.winner).toBe(1);
  });

  it("brings the black back if it goes in on the break", () => {
    const next = judge(newPoolState(0), table([1, 9, 8]), shot(1, [8]), names);
    expect(next.winner).toBeNull();
    expect(next.turn).toBe(0);
    expect(next.breakShot).toBe(false);
  });
});

describe("pool computer player", () => {
  it("pots a straightforward ball", () => {
    const balls = [ball(0, 1600, 900), ball(1, 2200, 300), ball(9, 600, 900), ball(8, 1270, 1000)];
    const state: PoolState = { ...newPoolState(1), breakShot: false, ballInHand: false, groups: ["stripes", "solids"] };
    const plan = planShot(balls, state, 1);
    expect(plan.note).toContain("1 (solid)");
    const trial = cloneBalls(balls);
    strike(trial, plan.angle, plan.power, plan.english);
    const events = simulate(trial);
    expect(events.firstHit).toBe(1);
    expect(events.pocketed).toContain(1);
    expect(events.pocketed).not.toContain(0);
  });
});
