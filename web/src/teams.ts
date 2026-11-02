import { shuffle } from "./random";

/** Shuffles the names and deals them out one at a time, so team sizes differ by at most one. */
export function splitIntoTeams(names: readonly string[], teamCount: number): string[][] {
  const count = Math.max(1, Math.min(teamCount, names.length || 1));
  const teams: string[][] = Array.from({ length: count }, () => []);
  shuffle(names).forEach((name, index) => teams[index % count].push(name));
  return teams;
}

export function teamsAsText(teams: string[][]): string {
  return teams.map((team, index) => `Team ${index + 1}: ${team.join(", ")}`).join("\n");
}
