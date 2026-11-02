import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import ModeLayout from "../components/ModeLayout";
import ShareDialog from "../components/ShareDialog";
import TeamsDialog from "../components/TeamsDialog";
import Wheel from "../components/Wheel";
import { displayHex, fileSafeName, formatWhen, mergeHistory, plural, restoreAt, splitPasted } from "../format";
import { useEscapeKey, usePresenting, useSpaceKey, useTimers } from "../hooks";
import { blurOnEnter, onEnter } from "../keys";
import { historyLimit } from "../shell";
import type { ScreenProps } from "../shell";
import { sounds, unlockAudio } from "../sound";
import { createId, entriesToAdd, parseImportedEntries } from "../storage";
import { wheelTemplates } from "../templates";
import type { WheelTemplate } from "../templates";
import type { AppSettings, SpinResult, WheelEntry, WheelList } from "../types";
import { buildSegments, labelKey, pickWinners, spinDelta } from "../wheelMath";

const noEntries: WheelEntry[] = [];

/** The latest spin, kept apart from the list so it still shows after "Eliminate" removes the winners. */
type SpinOutcome = {
  listId: string;
  winners: WheelEntry[];
  eliminated: boolean;
};

export default function WheelScreen({ data, setData, shell }: ScreenProps) {
  const { later } = useTimers();
  const presenter = usePresenting();
  const spinMs = shell.reducedMotion ? 1200 : 4400;
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [dialog, setDialog] = useState<"share" | "teams" | null>(null);
  const [newEntry, setNewEntry] = useState("");
  const [entryError, setEntryError] = useState("");
  const [newListName, setNewListName] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [historyTab, setHistoryTab] = useState<"recent" | "stats">("recent");
  const spinButtonRef = useRef<HTMLButtonElement>(null);
  const editStartRef = useRef("");
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const { settings } = data;
  const selectedList = data.lists.find((list) => list.id === data.selectedListId) ?? data.lists[0];
  const entries = selectedList?.entries ?? noEntries;
  const displayedEntries = useMemo(
    () => entries.map((entry) => ({ ...entry, colorHex: displayHex(entry.colorHex, shell.theme, 0.74) })),
    [entries, shell.theme]
  );
  const segments = useMemo(() => buildSegments(entries, settings.weighted), [entries, settings.weighted]);
  const listHistory = useMemo(
    () => data.history.filter((result) => result.listId === selectedList?.id),
    [data.history, selectedList?.id]
  );
  const stats = useMemo(() => tally(listHistory), [listHistory]);
  const lastWinnerLabel = listHistory[0]?.label;
  const listOutcome = outcome && outcome.listId === selectedList?.id ? outcome : null;
  const winnerIndex = listOutcome ? entries.findIndex((entry) => entry.id === listOutcome.winners[0].id) : -1;
  // After "Eliminate" the winners are no longer in the list, so fall back to the saved copies.
  const bannerWinners = listOutcome
    ? listOutcome.winners.map((winner) => entries.find((entry) => entry.id === winner.id) ?? winner)
    : [];
  const maxWinners = Math.max(1, Math.min(10, entries.length));
  const winnerCount = Math.min(settings.winnerCount, maxWinners);
  const pasteCount = splitPasted(pasteText).length;

  useSpaceKey(spin, !showWinner && dialog === null);
  useEscapeKey(closeWinner, showWinner);

  function updateSettings(next: Partial<AppSettings>) {
    setData((current) => ({ ...current, settings: { ...current.settings, ...next } }));
  }

  function updateList(listId: string, patch: Partial<WheelList>) {
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) => (list.id === listId ? { ...list, ...patch } : list)),
    }));
  }

  function updateEntries(listId: string, update: (entries: WheelEntry[]) => WheelEntry[]) {
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) => (list.id === listId ? { ...list, entries: update(list.entries) } : list)),
    }));
  }

  /** Remembers a text field's value when editing starts, so it can be restored if left empty. */
  function beginEdit(value: string) {
    editStartRef.current = value;
  }

  /** On blur: trim the text, and put back the previous value (or a default) if it was left empty. */
  function finishEdit(value: string, fallback: string, apply: (next: string) => void) {
    const next = value.trim() || editStartRef.current.trim() || fallback;
    if (next !== value) apply(next);
  }

  function selectList(listId: string) {
    setData((current) => ({ ...current, selectedListId: listId }));
    setOutcome(null);
    setEntryError("");
  }

  function createList(name: string, newEntries: WheelEntry[]) {
    const list: WheelList = { id: createId(), name, entries: newEntries };
    setData((current) => ({ ...current, lists: [...current.lists, list], selectedListId: list.id }));
    setOutcome(null);
    setEntryError("");
  }

  function addListFromInput() {
    createList(newListName.trim() || "New Wheel", []);
    setNewListName("");
  }

  function addTemplate(template: WheelTemplate) {
    createList(template.name, entriesToAdd([], template.options.map((label) => ({ label, colorHex: null, weight: 1 }))));
    setTemplatesOpen(false);
    shell.toast(`Added the "${template.name}" wheel`);
  }

  function renameSelected(name: string) {
    if (selectedList) updateList(selectedList.id, { name });
  }

  function deleteSelectedList() {
    if (!selectedList || data.lists.length <= 1) return;
    const list = selectedList;
    const index = data.lists.findIndex((item) => item.id === list.id);
    const removedHistory = data.history.filter((result) => result.listId === list.id);
    const nextSelected = data.lists.find((item) => item.id !== list.id)?.id ?? "";

    setData((current) => ({
      ...current,
      lists: current.lists.filter((item) => item.id !== list.id),
      history: current.history.filter((result) => result.listId !== list.id),
      selectedListId: nextSelected,
    }));
    setOutcome(null);
    shell.toast(`Deleted "${list.name}"`, () =>
      setData((current) =>
        current.lists.some((item) => item.id === list.id)
          ? current
          : {
              ...current,
              lists: [...current.lists.slice(0, index), list, ...current.lists.slice(index)],
              history: mergeHistory(current.history, removedHistory, historyLimit),
              selectedListId: list.id,
            }
      )
    );
  }

  function addEntry() {
    const label = newEntry.trim();
    if (!selectedList || !label) return;
    if (entries.some((entry) => labelKey(entry.label) === labelKey(label))) {
      setEntryError(`"${label}" is already on this wheel.`);
      return;
    }
    const [entry] = entriesToAdd(entries, [{ label, colorHex: null, weight: 1 }]);
    appendEntries(selectedList.id, [entry]);
    setNewEntry("");
    setEntryError("");
  }

  /** Adds entries, skipping any whose label arrived on the wheel in the meantime. */
  function appendEntries(listId: string, added: WheelEntry[]) {
    updateEntries(listId, (current) => {
      const existing = new Set(current.map((entry) => labelKey(entry.label)));
      return [...current, ...added.filter((entry) => !existing.has(labelKey(entry.label)))];
    });
  }

  function removeEntriesById(listId: string, ids: string[]) {
    updateEntries(listId, (current) => current.filter((entry) => !ids.includes(entry.id)));
  }

  function addPasted() {
    if (!selectedList) return;
    const labels = splitPasted(pasteText);
    if (labels.length === 0) return;
    const added = entriesToAdd(entries, labels.map((label) => ({ label, colorHex: null, weight: 1 })));
    const skipped = labels.length - added.length;
    if (added.length === 0) {
      setEntryError(labels.length === 1 ? "That option is already on this wheel." : "Those options are all on this wheel already.");
      return;
    }
    const listId = selectedList.id;
    appendEntries(listId, added);
    setPasteText("");
    setPasteOpen(false);
    setEntryError("");
    shell.toast(
      `Added ${plural(added.length, "option")}${skipped ? `, skipped ${skipped} already on the wheel` : ""}`,
      () => removeEntriesById(listId, added.map((entry) => entry.id))
    );
  }

  function updateEntry(entryId: string, patch: Partial<WheelEntry>) {
    if (!selectedList) return;
    updateEntries(selectedList.id, (current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch, weight: Math.max(0, patch.weight ?? entry.weight) } : entry
      )
    );
  }

  /** Removes options and offers an Undo that puts them back where they were. */
  function removeWithUndo(listId: string, ids: string[], message: string) {
    const list = data.lists.find((item) => item.id === listId);
    if (!list) return;
    const removed = list.entries
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => ids.includes(item.id));
    if (removed.length === 0) return;
    removeEntriesById(listId, ids);
    shell.toast(message, () => updateEntries(listId, (current) => restoreAt(current, removed)));
  }

  function spin() {
    if (!selectedList || spinning || entries.length < 2) return;

    const listId = selectedList.id;
    const listName = selectedList.name;
    const eliminate = settings.eliminate;
    const picks = pickWinners(entries, settings.weighted, winnerCount, settings.noRepeat ? lastWinnerLabel : undefined);
    const winners = picks.map((index) => entries[index]);
    const delta = spinDelta(segments[picks[0]], rotation);

    // Options and settings are locked until the wheel stops, so `winners` stays valid.
    setSpinning(true);
    setOutcome(null);
    setShowWinner(false);
    setEntryError("");
    setRotation((current) => current + delta);
    unlockAudio();
    sounds.spinTicks(later, spinMs);

    later(() => {
      const timestamp = new Date().toISOString();
      const ids = winners.map(() => createId());
      setSpinning(false);
      setOutcome({ listId, winners, eliminated: eliminate });
      setShowWinner(true);
      sounds.wheelWin(later);
      setData((current) => {
        const name = current.lists.find((list) => list.id === listId)?.name ?? listName;
        const results: SpinResult[] = winners.map((winner, index) => ({
          id: ids[index],
          label: winner.label,
          listId,
          listName: name,
          timestamp,
        }));
        const winnerIds = new Set(winners.map((winner) => winner.id));
        return {
          ...current,
          history: [...results, ...current.history].slice(0, historyLimit),
          lists: eliminate
            ? current.lists.map((list) =>
                list.id === listId ? { ...list, entries: list.entries.filter((entry) => !winnerIds.has(entry.id)) } : list
              )
            : current.lists,
        };
      });
    }, spinMs);
  }

  function closeWinner() {
    setShowWinner(false);
    window.requestAnimationFrame(() => spinButtonRef.current?.focus());
  }

  function removeWinners() {
    if (!outcome) return;
    const labels = outcome.winners.map((winner) => winner.label);
    removeWithUndo(
      outcome.listId,
      outcome.winners.map((winner) => winner.id),
      labels.length === 1 ? `Removed "${labels[0]}"` : `Removed ${plural(labels.length, "winner")}`
    );
    setOutcome(null);
    closeWinner();
  }

  function clearHistory() {
    if (!selectedList || listHistory.length === 0) return;
    const listId = selectedList.id;
    const removed = listHistory;
    setData((current) => ({ ...current, history: current.history.filter((result) => result.listId !== listId) }));
    shell.toast("History cleared", () =>
      setData((current) => ({ ...current, history: mergeHistory(current.history, removed, historyLimit) }))
    );
  }

  function exportList() {
    if (!selectedList || selectedList.entries.length === 0) return;
    const blob = new Blob([JSON.stringify(selectedList.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileSafeName(selectedList.name)}-entries.json`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking straight away can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importList(file: File) {
    if (!selectedList) return;
    const listId = selectedList.id;

    let imported: ReturnType<typeof parseImportedEntries>;
    try {
      imported = parseImportedEntries(JSON.parse(await file.text()));
    } catch {
      shell.toast("Couldn't read that file. Choose a JSON file exported from SpinFlipRoll.");
      return;
    }
    if (!imported) {
      shell.toast("That file doesn't contain a list of options.");
      return;
    }

    const list = dataRef.current.lists.find((item) => item.id === listId);
    if (!list) return;
    const added = entriesToAdd(list.entries, imported);
    if (added.length === 0) {
      shell.toast("No new options to import. They're all on this wheel already.");
      return;
    }
    appendEntries(listId, added);
    shell.toast(`Imported ${plural(added.length, "option")}`, () =>
      removeEntriesById(listId, added.map((entry) => entry.id))
    );
  }

  const sidebar = (
    <>
      <div className="list-create">
        <input
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          onKeyDown={onEnter(addListFromInput)}
          placeholder="New wheel"
          aria-label="New wheel name"
          disabled={spinning}
        />
        <button onClick={addListFromInput} aria-label="Add wheel" disabled={spinning}>
          +
        </button>
      </div>
      <button
        className="template-toggle"
        aria-expanded={templatesOpen}
        onClick={() => setTemplatesOpen((open) => !open)}
        disabled={spinning}
      >
        Start from a template
      </button>
      {templatesOpen && (
        <div className="template-list" role="group" aria-label="Templates">
          {wheelTemplates.map((template) => (
            <button key={template.name} onClick={() => addTemplate(template)}>
              <span>{template.name}</span>
              <small>{template.options.length}</small>
            </button>
          ))}
        </div>
      )}
      <nav className="wheel-list" aria-label="Wheels">
        {data.lists.map((list) => (
          <button
            key={list.id}
            className={list.id === selectedList?.id ? "selected" : ""}
            aria-current={list.id === selectedList?.id ? "true" : undefined}
            disabled={spinning}
            onClick={() => selectList(list.id)}
          >
            <span>{list.name}</span>
            <small>{list.entries.length}</small>
          </button>
        ))}
      </nav>
    </>
  );

  const winnerOverlay =
    showWinner && outcome ? (
      <div
        className="win-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={`${outcome.winners.length > 1 ? "Winners" : "Winner"}: ${outcome.winners.map((w) => w.label).join(", ")}`}
        onClick={(event) => event.target === event.currentTarget && closeWinner()}
      >
        <Confetti />
        <section className="win-card">
          <p>{outcome.winners.length > 1 ? "Winners" : "Winner"}</p>
          <span style={{ backgroundColor: `#${displayHex(outcome.winners[0].colorHex, shell.theme, 0.74)}` }} />
          <h2>{outcome.winners[0].label}</h2>
          {outcome.winners.length > 1 && (
            <ol className="runner-ups" start={2}>
              {outcome.winners.slice(1).map((winner) => (
                <li key={winner.id}>
                  <i style={{ backgroundColor: `#${displayHex(winner.colorHex, shell.theme, 0.74)}` }} />
                  {winner.label}
                </li>
              ))}
            </ol>
          )}
          {outcome.eliminated && <small className="win-note">Removed from the wheel</small>}
          <div className={`win-actions${outcome.eliminated ? " single" : ""}`}>
            <button autoFocus onClick={closeWinner}>
              Done
            </button>
            {!outcome.eliminated && (
              <button className="remove-winner" onClick={removeWinners}>
                {outcome.winners.length > 1 ? "Remove all" : "Remove"}
              </button>
            )}
          </div>
        </section>
      </div>
    ) : null;

  const dialogOverlay =
    dialog === "share" && selectedList ? (
      <ShareDialog list={selectedList} onClose={() => setDialog(null)} toast={shell.toast} />
    ) : dialog === "teams" ? (
      <TeamsDialog names={entries.map((entry) => entry.label)} onClose={() => setDialog(null)} toast={shell.toast} />
    ) : null;

  return (
    <ModeLayout
      shell={shell}
      className="wheel-app"
      subtitle={plural(data.lists.length, "wheel")}
      presenter={presenter}
      overlay={winnerOverlay ?? dialogOverlay}
      sidebar={sidebar}
      title={
        <input
          className="title-input"
          value={selectedList?.name ?? ""}
          onChange={(event) => renameSelected(event.target.value)}
          onFocus={(event) => beginEdit(event.target.value)}
          onBlur={(event) => finishEdit(event.target.value, "My Wheel", renameSelected)}
          onKeyDown={blurOnEnter}
          aria-label="Wheel name"
        />
      }
      actions={
        <>
          <button onClick={() => setDialog("share")} disabled={!entries.length}>
            Share
          </button>
          <label className={`file-button${spinning ? " disabled" : ""}`}>
            Import
            <input
              type="file"
              accept="application/json,.json"
              disabled={spinning}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importList(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button onClick={exportList} disabled={!entries.length}>
            Export
          </button>
          <button className="danger" onClick={deleteSelectedList} disabled={spinning || data.lists.length <= 1}>
            Delete
          </button>
        </>
      }
    >
      <section className="wheel-panel">
        <div className="chips" aria-label="Spin settings">
          <button
            className={settings.weighted ? "on" : ""}
            aria-pressed={settings.weighted}
            disabled={spinning}
            onClick={() => updateSettings({ weighted: !settings.weighted })}
          >
            Weighted
          </button>
          <button
            className={settings.noRepeat ? "on" : ""}
            aria-pressed={settings.noRepeat}
            disabled={spinning}
            onClick={() => updateSettings({ noRepeat: !settings.noRepeat })}
          >
            No repeat
          </button>
          <button
            className={settings.eliminate ? "on" : ""}
            aria-pressed={settings.eliminate}
            disabled={spinning}
            onClick={() => updateSettings({ eliminate: !settings.eliminate })}
          >
            Eliminate
          </button>
          <div className="chip-stepper" role="group" aria-label="Winners per spin">
            <button
              aria-label="Fewer winners"
              disabled={spinning || winnerCount <= 1}
              onClick={() => updateSettings({ winnerCount: winnerCount - 1 })}
            >
              −
            </button>
            <span>{plural(winnerCount, "winner")}</span>
            <button
              aria-label="More winners"
              disabled={spinning || winnerCount >= maxWinners}
              onClick={() => updateSettings({ winnerCount: winnerCount + 1 })}
            >
              +
            </button>
          </div>
        </div>

        <Wheel
          entries={displayedEntries}
          segments={segments}
          rotation={rotation}
          winnerIndex={!spinning && winnerIndex >= 0 ? winnerIndex : null}
          durationMs={spinMs}
        />

        <button ref={spinButtonRef} className="spin-button" onClick={spin} disabled={spinning || entries.length < 2}>
          {spinning ? "Spinning..." : "Spin"}
        </button>

        {bannerWinners.length > 0 && (
          <div className="winner-banner">
            <span style={{ backgroundColor: `#${displayHex(bannerWinners[0].colorHex, shell.theme, 0.74)}` }} />
            <strong>{bannerWinners.map((winner) => winner.label).join(", ")}</strong>
          </div>
        )}
        <p className="shortcut-hint">Tip: press Space to spin</p>
      </section>

      <section className="controls">
        <div className="panel-heading">
          <h2>Options</h2>
          <span>{entries.length}</span>
        </div>
        <div className="entry-add">
          <input
            value={newEntry}
            onChange={(event) => {
              setNewEntry(event.target.value);
              setEntryError("");
            }}
            onKeyDown={onEnter(addEntry)}
            placeholder="Add option"
            aria-label="New option"
            aria-invalid={entryError ? true : undefined}
            aria-describedby="entry-error"
            disabled={spinning}
          />
          <button onClick={addEntry} disabled={spinning}>
            Add
          </button>
        </div>
        <p id="entry-error" className="field-error" role="status">
          {entryError}
        </p>

        <div className="panel-tools">
          <button aria-expanded={pasteOpen} onClick={() => setPasteOpen((open) => !open)} disabled={spinning}>
            Paste a list
          </button>
          <button onClick={() => setDialog("teams")} disabled={spinning || entries.length < 2}>
            Make teams
          </button>
        </div>

        {pasteOpen && (
          <div className="paste-box">
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder={"One option per line\n(or separated by commas)"}
              aria-label="Options to add, one per line"
              rows={5}
              autoFocus
            />
            <div className="paste-actions">
              <button onClick={addPasted} disabled={!pasteText.trim()}>
                {pasteCount ? `Add ${plural(pasteCount, "option")}` : "Add options"}
              </button>
              <button className="secondary" onClick={() => setPasteOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="entry-list">
          {entries.map((entry, index) => (
            <div className="entry-row" key={entry.id}>
              <input
                type="color"
                value={`#${entry.colorHex}`}
                onChange={(event) => updateEntry(entry.id, { colorHex: event.target.value.slice(1).toUpperCase() })}
                disabled={spinning}
                aria-label={`Color for ${entry.label}`}
              />
              <input
                value={entry.label}
                onChange={(event) => updateEntry(entry.id, { label: event.target.value })}
                onFocus={(event) => beginEdit(event.target.value)}
                onBlur={(event) => finishEdit(event.target.value, "Option", (label) => updateEntry(entry.id, { label }))}
                onKeyDown={blurOnEnter}
                disabled={spinning}
                aria-label={`Name of option ${index + 1}`}
              />
              <input
                className="weight"
                type="number"
                min="0"
                step="0.1"
                value={entry.weight}
                onChange={(event) => updateEntry(entry.id, { weight: Number(event.target.value) || 0 })}
                disabled={spinning}
                aria-label={`Weight for ${entry.label}`}
              />
              <button
                className="icon-button"
                onClick={() => selectedList && removeWithUndo(selectedList.id, [entry.id], `Removed "${entry.label}"`)}
                disabled={spinning}
                aria-label={`Remove ${entry.label}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="history">
        <div className="history-header">
          <div className="tabs" role="tablist" aria-label="History view">
            <button
              role="tab"
              aria-selected={historyTab === "recent"}
              className={historyTab === "recent" ? "active" : ""}
              onClick={() => setHistoryTab("recent")}
            >
              History
            </button>
            <button
              role="tab"
              aria-selected={historyTab === "stats"}
              className={historyTab === "stats" ? "active" : ""}
              onClick={() => setHistoryTab("stats")}
            >
              Stats
            </button>
          </div>
          <button onClick={clearHistory} disabled={listHistory.length === 0}>
            Clear
          </button>
        </div>
        {listHistory.length === 0 ? (
          <p>No spins yet</p>
        ) : historyTab === "recent" ? (
          <ol>
            {listHistory.slice(0, 8).map((result) => (
              <li key={result.id}>
                <span>{result.label}</span>
                <time dateTime={result.timestamp}>{formatWhen(result.timestamp)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="stats">
            <p className="stats-summary">Results from the last {plural(listHistory.length, "spin")}</p>
            <ol className="stat-bars">
              {stats.slice(0, 12).map((stat) => (
                <li key={stat.label}>
                  <span className="stat-label">{stat.label}</span>
                  <span className="stat-bar" aria-hidden="true">
                    <i style={{ width: `${(stat.count / stats[0].count) * 100}%` }} />
                  </span>
                  <span className="stat-count">{stat.count}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </ModeLayout>
  );
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 42 }).map((_, index) => (
        <i
          key={index}
          style={
            {
              "--hue": index * 37,
              "--x": `${(index * 23) % 100}%`,
              "--drift": `${((index % 7) - 3) * 18}px`,
              "--duration": `${2.3 + (index % 8) * 0.18}s`,
              "--delay": `${(index % 10) * -0.22}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function tally(results: SpinResult[]) {
  const counts = new Map<string, number>();
  results.forEach((result) => counts.set(result.label, (counts.get(result.label) ?? 0) + 1));
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
