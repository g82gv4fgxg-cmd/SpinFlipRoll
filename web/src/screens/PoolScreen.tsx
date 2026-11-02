import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import GameFrame, { Lesson } from "../components/GameFrame";
import Icon from "../components/Icon";
import {
  aimGuide,
  ballName,
  ballRadius,
  canPlaceCue,
  candidateShots,
  cloneBalls,
  footSpot,
  groupOf,
  headString,
  isMoving,
  judge,
  legalTargets,
  newEvents,
  newPoolState,
  planShot,
  pockets,
  poolLessons,
  rack,
  remainingInGroup,
  respotBlack,
  step,
  strike,
  tableHeight,
  tableWidth,
} from "../games/pool";
import type { Ball, PlannedShot, PoolState, ShotEvents } from "../games/pool";
import { BallSprites, ballColours, drawBalls, drawCue, drawGuides, drawPlacement, drawTable, fitView, toScreen, toTable } from "../games/poolRender";
import type { DropAnimation, View } from "../games/poolRender";
import { useTimers } from "../hooks";
import type { Shell } from "../shell";
import { sounds, unlockAudio } from "../sound";
import type { ArcadeStats } from "../types";

type PoolScreenProps = {
  shell: Shell;
  arcade: ArcadeStats;
  setArcade: (update: (current: ArcadeStats) => Partial<ArcadeStats>) => void;
  onBack: () => void;
};

type Phase = "aim" | "stroke" | "rolling" | "ai-think" | "ai-aim" | "over";
type English = { x: number; y: number };

const names: [string, string] = ["You", "Ava"];
const physicsStep = 1 / 600;
const strokeMs = 140;
const skills = { easy: 0.4, medium: 0.7, hard: 0.92 };
type Skill = keyof typeof skills;

export default function PoolScreen({ shell, arcade, setArcade, onBack }: PoolScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tableCache = useRef<HTMLCanvasElement | null>(null);
  const sprites = useRef(new BallSprites());
  const viewRef = useRef<View | null>(null);
  const { later } = useTimers();

  // Live game state lives in a ref so the animation loop always sees the latest values.
  const sim = useRef({
    balls: rack(),
    state: newPoolState(0),
    phase: "aim" as Phase,
    aim: 0,
    power: 0.9,
    english: { x: 0, y: 0 } as English,
    shotStart: [] as Ball[],
    events: newEvents() as ShotEvents,
    time: 0,
    accumulator: 0,
    heard: { balls: 0, rails: 0, drops: 0 },
    stroke: { start: 0, angle: 0, power: 0, english: { x: 0, y: 0 } as English },
    aiAim: { start: 0, from: 0, plan: null as PlannedShot | null },
    drops: [] as DropAnimation[],
    dragging: "none" as "none" | "aim" | "cue",
    lastSound: 0,
    starter: 0 as 0 | 1,
  });

  const [phase, setPhase] = useState<Phase>("aim");
  const [state, setState] = useState<PoolState>(sim.current.state);
  const [power, setPower] = useState(90);
  const [english, setEnglish] = useState<English>({ x: 0, y: 0 });
  const [guides, setGuides] = useState(true);
  const [skill, setSkill] = useState<Skill>("medium");
  const [shots, setShots] = useState(0);
  const [tip, setTip] = useState<string | null>(null);
  const [, setFrameTick] = useState(0);
  const skillRef = useRef(skill);
  skillRef.current = skill;
  const guidesRef = useRef(guides);
  guidesRef.current = guides;

  const setLivePhase = useCallback((next: Phase) => {
    sim.current.phase = next;
    setPhase(next);
  }, []);

  // ---------- Sizing ----------
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const view = fitView(stage.clientWidth, stage.clientHeight, dpr);
      viewRef.current = view;
      canvas.width = Math.round(view.width * dpr);
      canvas.height = Math.round(view.height * dpr);
      canvas.style.width = `${view.width}px`;
      canvas.style.height = `${view.height}px`;
      const cache = tableCache.current ?? document.createElement("canvas");
      cache.width = canvas.width;
      cache.height = canvas.height;
      const cacheContext = cache.getContext("2d");
      if (cacheContext) drawTable(cacheContext, view);
      tableCache.current = cache;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // ---------- Turn handling ----------
  const aiTurn = useCallback(() => {
    const live = sim.current;
    setLivePhase("ai-think");
    later(() => {
      if (live.phase !== "ai-think") return;
      const plan = planShot(live.balls, live.state, skills[skillRef.current]);
      if (plan.place && canPlaceCue(live.balls, plan.place.x, plan.place.y, live.state.breakShot)) {
        Object.assign(live.balls[0], plan.place, { pocketed: false });
      }
      live.aiAim = { start: performance.now(), from: live.aim, plan };
      live.english = plan.english;
      setLivePhase("ai-aim");
    }, shell.reducedMotion ? 200 : 650);
  }, [later, setLivePhase, shell.reducedMotion]);

  /** Called when every ball has stopped: apply the rules and pass the turn. */
  const finishShot = useCallback(() => {
    const live = sim.current;
    const breakShot = live.state.breakShot;
    const next = judge(live.state, live.shotStart, live.events, names);
    if (breakShot && live.events.pocketed.includes(8) && next.winner === null) respotBlack(live.balls);
    if (live.balls[0].pocketed) {
      live.balls[0].pocketed = false;
      placeCueSomewhere(live.balls, headString, tableHeight / 2);
    }
    live.state = next;
    setState(next);
    setShots((count) => count + 1);
    setTip(null);
    if (next.winner !== null) {
      setLivePhase("over");
      if (next.winner === 0) {
        setArcade((current) => ({ poolWins: current.poolWins + 1 }));
        sounds.handWin(later);
      } else {
        setArcade((current) => ({ poolLosses: current.poolLosses + 1 }));
        sounds.handLose();
      }
      return;
    }
    live.english = { x: 0, y: 0 };
    setEnglish({ x: 0, y: 0 });
    if (breakShot) {
      live.power = 0.5;
      setPower(50);
    }
    if (next.turn === 0) setLivePhase("aim");
    else aiTurn();
  }, [aiTurn, later, setArcade, setLivePhase]);

  function newGame() {
    const live = sim.current;
    live.starter = live.starter === 0 ? 1 : 0;
    live.balls = rack();
    live.state = newPoolState(live.starter);
    live.drops = [];
    live.aim = 0;
    live.power = 0.9;
    setPower(90);
    setState(live.state);
    setShots(0);
    setTip(null);
    if (live.starter === 0) setLivePhase("aim");
    else aiTurn();
  }

  function shoot() {
    const live = sim.current;
    if (live.phase !== "aim") return;
    if (live.state.ballInHand && !canPlaceCue(live.balls, live.balls[0].x, live.balls[0].y, live.state.breakShot)) {
      shell.toast(live.state.breakShot ? "Put the cue ball behind the line first." : "Move the cue ball to a clear spot first.");
      return;
    }
    unlockAudio();
    beginStroke(live.aim, live.power, live.english);
  }

  function beginStroke(angle: number, strokePower: number, spin: English) {
    const live = sim.current;
    live.stroke = { start: performance.now(), angle, power: strokePower, english: spin };
    setLivePhase("stroke");
  }

  // ---------- Animation loop ----------
  // The loop is started once and reaches the latest callbacks through this ref.
  const loop = useRef({ finishShot, beginStroke, playShotSounds, draw, reducedMotion: shell.reducedMotion });
  loop.current = { finishShot, beginStroke, playShotSounds, draw, reducedMotion: shell.reducedMotion };
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const live = sim.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { finishShot: finish, beginStroke: stroke, playShotSounds: playSounds, draw: render, reducedMotion } = loop.current;
      if (live.phase === "ai-aim" && live.aiAim.plan) {
        const t = Math.min(1, (now - live.aiAim.start) / (reducedMotion ? 150 : 800));
        let delta = live.aiAim.plan.angle - live.aiAim.from;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        live.aim = live.aiAim.from + delta * eased;
        live.power = live.aiAim.plan.power;
        if (t >= 1) stroke(live.aiAim.plan.angle, live.aiAim.plan.power, live.aiAim.plan.english);
      }

      if (live.phase === "stroke" && now - live.stroke.start >= strokeMs) {
        live.shotStart = cloneBalls(live.balls);
        live.events = newEvents();
        live.time = 0;
        live.accumulator = 0;
        live.heard = { balls: 0, rails: 0, drops: 0 };
        strike(live.balls, live.stroke.angle, live.stroke.power, live.stroke.english);
        sounds.poolStrike(live.stroke.power);
        live.phase = "rolling";
        setPhase("rolling");
      }

      if (live.phase === "rolling") {
        live.accumulator += dt;
        while (live.accumulator >= physicsStep) {
          step(live.balls, physicsStep, live.events, live.time);
          live.time += physicsStep;
          live.accumulator -= physicsStep;
        }
        playSounds(now);
        if (!isMoving(live.balls) || live.time > 40) {
          live.balls.forEach((ball) => Object.assign(ball, { vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 }));
          live.phase = "aim"; // until finishShot decides whose turn it is
          finish();
        }
      }

      render(now);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  function playShotSounds(now: number) {
    const live = sim.current;
    const { ballHits, railHits, drops } = live.events;
    for (; live.heard.balls < ballHits.length; live.heard.balls++) {
      const hit = ballHits[live.heard.balls];
      if (now - live.lastSound > 25 && hit.speed > 40) {
        sounds.poolClick(hit.speed);
        live.lastSound = now;
      }
    }
    for (; live.heard.rails < railHits.length; live.heard.rails++) {
      const hit = railHits[live.heard.rails];
      if (hit.speed > 150) sounds.poolCushion(hit.speed);
    }
    for (; live.heard.drops < drops.length; live.heard.drops++) {
      const drop = drops[live.heard.drops];
      const ball = live.balls.find((b) => b.id === drop.id);
      if (ball) {
        const pocket = pockets.reduce((best, p) => (Math.hypot(p.x - ball.x, p.y - ball.y) < Math.hypot(best.x - ball.x, best.y - ball.y) ? p : best));
        live.drops.push({ id: ball.id, x: ball.x, y: ball.y, pocketX: pocket.x, pocketY: pocket.y, start: now });
      }
      sounds.poolPocket(later);
    }
  }

  function draw(now: number) {
    const canvas = canvasRef.current;
    const view = viewRef.current;
    const cache = tableCache.current;
    if (!canvas || !view || !cache) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const live = sim.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cache, 0, 0);
    const cue = live.balls[0];
    const aiming = live.phase === "aim" || live.phase === "ai-aim";
    if (live.phase === "aim" && live.state.ballInHand && live.state.turn === 0) {
      drawPlacement(ctx, view, cue, live.state.breakShot, canPlaceCue(live.balls, cue.x, cue.y, live.state.breakShot));
    }
    drawBalls(ctx, view, live.balls, sprites.current, live.drops, now);
    if (live.phase === "aim" && guidesRef.current && !cue.pocketed) drawGuides(ctx, view, cue, aimGuide(live.balls, live.aim), live.aim);
    if ((aiming || live.phase === "stroke") && !cue.pocketed) {
      let pull = 20 + live.power * 170;
      if (live.phase === "stroke") {
        const t = Math.min(1, (now - live.stroke.start) / strokeMs);
        pull = (20 + live.stroke.power * 170) * (1 - t * t);
      }
      drawCue(ctx, view, cue, live.phase === "stroke" ? live.stroke.angle : live.aim, pull);
    }
    if (live.drops.length && now - live.drops[live.drops.length - 1].start > 400) live.drops = [];
  }

  // ---------- Pointer and keyboard ----------
  function pointerToTable(event: ReactPointerEvent<HTMLCanvasElement>) {
    const view = viewRef.current;
    if (!view) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    return toTable(view, event.clientX - rect.left, event.clientY - rect.top);
  }

  function aimAt(point: { x: number; y: number }) {
    const live = sim.current;
    const cue = live.balls[0];
    if (Math.hypot(point.x - cue.x, point.y - cue.y) < 4) return;
    live.aim = Math.atan2(point.y - cue.y, point.x - cue.x);
  }

  function moveCueTo(point: { x: number; y: number }) {
    const live = sim.current;
    const limitX = live.state.breakShot ? headString : tableWidth - ballRadius;
    const x = Math.max(ballRadius, Math.min(limitX, point.x));
    const y = Math.max(ballRadius, Math.min(tableHeight - ballRadius, point.y));
    if (canPlaceCue(live.balls, x, y, live.state.breakShot)) Object.assign(live.balls[0], { x, y });
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const live = sim.current;
    if (live.phase !== "aim") return;
    const point = pointerToTable(event);
    if (!point) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not every browser allows capture here; dragging still works while over the canvas.
    }
    const cue = live.balls[0];
    if (live.state.ballInHand && Math.hypot(point.x - cue.x, point.y - cue.y) < ballRadius * 2.6) {
      live.dragging = "cue";
    } else {
      live.dragging = "aim";
      aimAt(point);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const live = sim.current;
    if (live.dragging === "none" || live.phase !== "aim") return;
    const point = pointerToTable(event);
    if (!point) return;
    if (live.dragging === "cue") moveCueTo(point);
    else aimAt(point);
  }

  function onPointerUp() {
    sim.current.dragging = "none";
  }

  function nudgeAim(degrees: number) {
    sim.current.aim += (degrees * Math.PI) / 180;
  }

  function changePower(value: number) {
    const clamped = Math.max(5, Math.min(100, Math.round(value)));
    sim.current.power = clamped / 100;
    setPower(clamped);
  }

  function changeEnglish(next: English) {
    const length = Math.hypot(next.x, next.y);
    const limited = length > 0.6 ? { x: (next.x / length) * 0.6, y: (next.y / length) * 0.6 } : next;
    sim.current.english = limited;
    setEnglish(limited);
  }

  const keyActions = useRef({ shoot, nudgeAim, changePower });
  keyActions.current = { shoot, nudgeAim, changePower };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.metaKey || event.ctrlKey || event.altKey) return;
      const { shoot: fire, nudgeAim: nudge, changePower: setStrength } = keyActions.current;
      const fine = event.shiftKey ? 0.1 : 0.6;
      if (event.key === "ArrowLeft") nudge(-fine);
      else if (event.key === "ArrowRight") nudge(fine);
      else if (event.key === "ArrowUp") setStrength(sim.current.power * 100 + 5);
      else if (event.key === "ArrowDown") setStrength(sim.current.power * 100 - 5);
      else if ((event.key === " " || event.key === "Enter") && !(event.target instanceof HTMLButtonElement)) fire();
      else return;
      event.preventDefault();
      setFrameTick((n) => n + 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ---------- Coach ----------
  function pocketName(index: number) {
    const view = viewRef.current;
    const pocket = pockets[index];
    if (!view) return "pocket";
    const point = toScreen(view, Math.max(0, Math.min(tableWidth, pocket.x)), Math.max(0, Math.min(tableHeight, pocket.y)));
    const horizontal = point.x < view.width * 0.3 ? "left" : point.x > view.width * 0.7 ? "right" : "middle";
    const vertical = point.y < view.height * 0.3 ? "top" : point.y > view.height * 0.7 ? "bottom" : "middle";
    if (horizontal === "middle") return `${vertical} side pocket`;
    if (vertical === "middle") return `${horizontal} side pocket`;
    return `${vertical}-${horizontal} corner`;
  }

  function suggest() {
    const live = sim.current;
    if (live.phase !== "aim") return;
    const cue = live.balls[0];
    if (live.state.breakShot) {
      live.aim = Math.atan2(footSpot.y - cue.y, footSpot.x - cue.x);
      changePower(100);
      setTip("Break: aim straight at the front ball and hit it as hard as you can. The aim is set for you.");
      return;
    }
    const targets = legalTargets(live.balls, live.state);
    const best = candidateShots(live.balls, targets, cue)[0];
    if (!best) {
      const nearest = live.balls.filter((b) => targets.includes(b.id) && !b.pocketed).sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
      if (nearest) live.aim = Math.atan2(nearest.y - cue.y, nearest.x - cue.x);
      changePower(30);
      setTip("No clear pot from here. Play safe: roll gently into one of your balls so the other player is left with nothing easy. Hitting your own ball first avoids a foul.");
      return;
    }
    live.aim = best.angle;
    changePower(best.power * 100);
    const cutDegrees = Math.round((best.cut * 180) / Math.PI);
    const cutText = cutDegrees < 8 ? "nearly straight" : cutDegrees < 30 ? `a gentle ${cutDegrees}° cut` : cutDegrees < 55 ? `a ${cutDegrees}° cut` : `a thin ${cutDegrees}° cut, so aim carefully`;
    setTip(`Try the ${ballName(best.target)} into the ${pocketName(best.pocket)}: ${cutText}. The aim and power are set; check the yellow line points at the pocket, then shoot.`);
  }

  // ---------- Render ----------
  const yourGroup = state.groups[0];
  const theirGroup = state.groups[1];
  const yourTurn = phase === "aim" && state.turn === 0;
  const live = sim.current;
  const coachLine = (() => {
    const nextBreak = live.starter === 0 ? "Ava breaks next game." : "You break next game.";
    if (state.winner === 0) return `Well played. ${nextBreak}`;
    if (state.winner === 1) return `Ava took this one. Tip: before each shot, check where the blue dashed line sends the cue ball so it doesn't follow a ball into a pocket. ${nextBreak}`;
    if (state.turn === 1) return phase === "ai-think" ? "Ava is lining up a shot…" : "Watch where Ava aims and how the cue ball moves after contact.";
    if (state.breakShot) return "Break: put the cue ball anywhere behind the line, aim at the front ball and hit it hard.";
    if (state.ballInHand) return "Ball in hand: drag the cue ball anywhere to set up an easy, nearly straight pot.";
    if (!yourGroup) return "The table is open: pot any ball except the black, and its group (solids or stripes) becomes yours.";
    if (remainingInGroup(live.balls, yourGroup) === 0) return "Your group is cleared. Pot the black to win, and don't let the cue ball follow it in.";
    return `You're on ${yourGroup}: ${remainingInGroup(live.balls, yourGroup)} left. Hit one of yours first.`;
  })();

  const groupBalls = (group: "solids" | "stripes" | null) =>
    group ? live.balls.filter((ball) => groupOf(ball.id) === group).map((ball) => ({ id: ball.id, down: ball.pocketed })) : [];

  const learn = (
    <>
      {poolLessons.map((lesson) => (
        <Lesson key={lesson.title} title={lesson.title}>
          <p>{lesson.text}</p>
        </Lesson>
      ))}
      <Lesson title="Controls">
        <ul>
          <li>Drag on the table to aim. The arrow keys fine-tune the aim (hold Shift for tiny steps) and up and down change power.</li>
          <li>Set power with the slider, and spin by tapping where to hit the small cue ball.</li>
          <li>With ball in hand, drag the cue ball to move it.</li>
          <li>Space or Shoot to play. "Suggest a shot" lines one up and explains it.</li>
        </ul>
      </Lesson>
      <Lesson title="The physics">
        <p>
          Balls slide at first, then friction turns the slide into a roll, which is what makes spin matter. Collisions swap the part of each ball's speed along
          the line between their centres, and cushions take away some speed and react to side spin. It's a model, so expect it to feel close to a real
          table rather than identical.
        </p>
      </Lesson>
    </>
  );

  return (
    <GameFrame
      shell={shell}
      title="8-ball pool"
      className="pool-screen"
      onBack={onBack}
      stats={
        <span className="chip-count">
          Won {arcade.poolWins} · Lost {arcade.poolLosses}
        </span>
      }
      learn={learn}
      data={{ phase, turn: state.turn === 0 ? "you" : "ava", shots, groups: `${yourGroup ?? "open"}/${theirGroup ?? "open"}` }}
    >
      <div className="pool-layout">
        <div className="pool-hud">
          <div className={`pool-player${state.turn === 0 ? " current" : ""}`}>
            <b>You</b>
            <span>{groupLabel(yourGroup)}</span>
            <BallRow balls={groupBalls(yourGroup)} />
          </div>
          <p className="pool-message" role="status">
            {state.message}
          </p>
          <div className={`pool-player right${state.turn === 1 ? " current" : ""}`}>
            <b>Ava</b>
            <span>{groupLabel(theirGroup)}</span>
            <BallRow balls={groupBalls(theirGroup)} />
          </div>
        </div>

        <div className="pool-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className="pool-canvas"
            role="img"
            aria-label="Pool table. Drag to aim, then shoot."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {phase === "over" && (
            <div className="game-overlay">
              <p className="game-kicker">{state.winner === 0 ? "You win!" : "Ava wins"}</p>
              <h2>{state.winner === 0 ? "Nice game" : "Unlucky"}</h2>
              <p className="game-best-line">{state.message}</p>
              <div className="game-overlay-actions">
                <button className="game-start" onClick={newGame} autoFocus>
                  Play again
                </button>
                <button className="game-secondary" onClick={onBack}>
                  Back to games
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pool-controls">
          <div className="pool-aim">
            <button className="icon-toggle" onClick={() => nudgeAim(-0.25)} aria-label="Aim left a little" disabled={!yourTurn}>
              <Icon name="left" />
            </button>
            <label className="power">
              <span>Power {power}%</span>
              <input type="range" min={5} max={100} value={power} onChange={(event) => changePower(Number(event.target.value))} aria-label="Power" />
            </label>
            <button className="icon-toggle" onClick={() => nudgeAim(0.25)} aria-label="Aim right a little" disabled={!yourTurn}>
              <Icon name="right" />
            </button>
          </div>
          <SpinPicker english={english} onChange={changeEnglish} disabled={!yourTurn} />
          <div className="pool-buttons">
            <button className="shoot" onClick={shoot} disabled={!yourTurn}>
              Shoot
            </button>
            <button className="secondary" onClick={suggest} disabled={!yourTurn}>
              Suggest a shot
            </button>
          </div>
          <div className="pool-options">
            <label className="coach-toggle">
              <input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} /> Aiming guides
            </label>
            <label className="coach-toggle">
              Ava:{" "}
              <select value={skill} onChange={(event) => setSkill(event.target.value as Skill)} aria-label="Computer player skill">
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <button className="secondary small" onClick={newGame}>
              New game
            </button>
          </div>
        </div>

        <aside className="coach-card pool-coach" aria-label="Coach">
          <h2>Coach</h2>
          {coachLine && <p className="coach-hint">{coachLine}</p>}
          {tip && yourTurn && (
            <p className="coach-feedback good" role="status">
              {tip}
            </p>
          )}
          {guides && yourTurn && <p className="muted">Yellow line: where the object ball goes. Blue dashes: where the cue ball goes after contact, if it has no spin.</p>}
        </aside>
      </div>
    </GameFrame>
  );
}

const groupLabel = (group: "solids" | "stripes" | null) => (group === "solids" ? "Solids (1 to 7)" : group === "stripes" ? "Stripes (9 to 15)" : "Open table");

/** Puts the cue ball at (or near) a spot that's clear of other balls. */
function placeCueSomewhere(balls: Ball[], x: number, y: number) {
  for (let ring = 0; ring < 40; ring++) {
    for (let k = 0; k < 12; k++) {
      const angle = (k / 12) * Math.PI * 2;
      const px = x + Math.cos(angle) * ring * ballRadius;
      const py = y + Math.sin(angle) * ring * ballRadius;
      if (canPlaceCue(balls, px, py, false)) {
        Object.assign(balls[0], { x: px, y: py });
        return;
      }
    }
  }
}

function BallRow({ balls }: { balls: { id: number; down: boolean }[] }) {
  if (balls.length === 0) return null;
  return (
    <span className="ball-row" aria-hidden="true">
      {balls.map((ball) => (
        <i key={ball.id} className={`${ball.down ? "down" : ""}${ball.id > 8 ? " striped" : ""}`} style={{ "--ball": ballColours[ball.id] } as CSSProperties}>
          {ball.id}
        </i>
      ))}
    </span>
  );
}

function SpinPicker({ english, onChange, disabled }: { english: English; onChange: (next: English) => void; disabled: boolean }) {
  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    onChange({ x: x * 0.75, y: y * 0.75 });
  };
  const describe = () => {
    const parts: string[] = [];
    if (english.y > 0.12) parts.push("top spin (follow)");
    if (english.y < -0.12) parts.push("back spin (draw)");
    if (english.x > 0.12) parts.push("right side");
    if (english.x < -0.12) parts.push("left side");
    return parts.length ? parts.join(", ") : "centre ball (no spin)";
  };
  return (
    <div className="spin-picker">
      <div
        className={`spin-ball${disabled ? " disabled" : ""}`}
        onPointerDown={(event) => {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // ignore
          }
          pick(event);
        }}
        onPointerMove={(event) => event.buttons && pick(event)}
        role="slider"
        aria-label="Spin"
        aria-valuetext={describe()}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          const stepSize = 0.1;
          const moves: Record<string, English> = {
            w: { x: english.x, y: english.y + stepSize },
            s: { x: english.x, y: english.y - stepSize },
            a: { x: english.x - stepSize, y: english.y },
            d: { x: english.x + stepSize, y: english.y },
          };
          const move = moves[event.key.toLowerCase()];
          if (move) {
            event.preventDefault();
            onChange(move);
          }
        }}
      >
        <i style={{ left: `${50 + (english.x / 0.75) * 50}%`, top: `${50 - (english.y / 0.75) * 50}%` }} />
      </div>
      <div className="spin-text">
        <span>Spin: {describe()}</span>
        <button className="secondary small" onClick={() => onChange({ x: 0, y: 0 })} disabled={disabled || (english.x === 0 && english.y === 0)}>
          Centre
        </button>
      </div>
    </div>
  );
}
