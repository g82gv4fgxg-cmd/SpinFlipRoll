import { useState } from "react";
import { copyText } from "../keys";
import { splitIntoTeams, teamsAsText } from "../teams";
import Dialog from "./Dialog";

type TeamsDialogProps = {
  names: string[];
  onClose: () => void;
  toast: (message: string) => void;
};

export default function TeamsDialog({ names, onClose, toast }: TeamsDialogProps) {
  const maxTeams = Math.max(2, Math.min(8, names.length));
  const [count, setCount] = useState(2);
  const [teams, setTeams] = useState(() => splitIntoTeams(names, 2));

  function reshuffle(teamCount = count) {
    setTeams(splitIntoTeams(names, teamCount));
  }

  async function copy() {
    const copied = await copyText(teamsAsText(teams));
    toast(copied ? "Teams copied" : "Couldn't copy the teams. Try selecting them instead.");
  }

  return (
    <Dialog title="Split into teams" onClose={onClose} className="teams-dialog">
      <div className="dialog-row">
        <label className="inline-field">
          Teams
          <select
            aria-label="Number of teams"
            value={count}
            onChange={(event) => {
              const next = Number(event.target.value);
              setCount(next);
              reshuffle(next);
            }}
          >
            {Array.from({ length: maxTeams - 1 }, (_, index) => index + 2).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => reshuffle()}>Shuffle again</button>
        <button className="secondary" onClick={copy}>
          Copy
        </button>
      </div>
      <div className="teams-grid">
        {teams.map((team, index) => (
          <section className="team-card" key={index}>
            <h3>
              Team {index + 1} <span>{team.length}</span>
            </h3>
            <ol>
              {team.map((name, nameIndex) => (
                <li key={`${name}-${nameIndex}`}>{name}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
