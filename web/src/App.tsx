import { useEffect, useMemo, useState } from "react";
import Wheel from "./Wheel";
import { buildSegments, nextColorHex, pickWinner, spinDelta } from "./wheelMath";
import { loadData, saveData } from "./storage";
import type { AppData, AppSettings, SpinResult, WheelEntry, WheelList } from "./types";

const spinDurationMs = 4400;

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selectedListId, setSelectedListId] = useState(() => data.lists[0]?.id ?? "");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [lastWinner, setLastWinner] = useState<string | undefined>();
  const [newEntry, setNewEntry] = useState("");
  const [newListName, setNewListName] = useState("");

  useEffect(() => saveData(data), [data]);

  const selectedList = useMemo(
    () => data.lists.find((list) => list.id === selectedListId) ?? data.lists[0],
    [data.lists, selectedListId]
  );

  const entries = selectedList?.entries ?? [];
  const segments = useMemo(
    () => buildSegments(entries, data.settings.weighted),
    [entries, data.settings.weighted]
  );
  const listHistory = data.history.filter((result) => result.listId === selectedList?.id).slice(0, 8);

  function updateSettings(next: Partial<AppSettings>) {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, ...next },
    }));
  }

  function addList() {
    const name = newListName.trim() || "New Wheel";
    const list: WheelList = {
      id: crypto.randomUUID(),
      name,
      entries: [],
    };
    setData((current) => ({ ...current, lists: [...current.lists, list] }));
    setSelectedListId(list.id);
    setNewListName("");
    setWinnerIndex(null);
  }

  function renameSelected(name: string) {
    if (!selectedList) return;
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) =>
        list.id === selectedList.id ? { ...list, name: name.trim() || "My Wheel" } : list
      ),
    }));
  }

  function deleteSelectedList() {
    if (!selectedList || data.lists.length <= 1) return;
    const remaining = data.lists.filter((list) => list.id !== selectedList.id);
    setData((current) => ({ ...current, lists: remaining }));
    setSelectedListId(remaining[0]?.id ?? "");
  }

  function addEntry() {
    const label = newEntry.trim();
    if (!selectedList || !label) return;

    const exists = selectedList.entries.some((entry) => entry.label.toLowerCase() === label.toLowerCase());
    if (exists) return;

    const entry: WheelEntry = {
      id: crypto.randomUUID(),
      label,
      colorHex: nextColorHex(selectedList.entries),
      weight: 1,
    };

    updateList(selectedList.id, { entries: [...selectedList.entries, entry] });
    setNewEntry("");
  }

  function updateEntry(entryId: string, patch: Partial<WheelEntry>) {
    if (!selectedList) return;
    updateList(selectedList.id, {
      entries: selectedList.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch, weight: Math.max(0, patch.weight ?? entry.weight) } : entry
      ),
    });
  }

  function removeEntry(entryId: string) {
    if (!selectedList) return;
    updateList(selectedList.id, {
      entries: selectedList.entries.filter((entry) => entry.id !== entryId),
    });
  }

  function updateList(listId: string, patch: Partial<WheelList>) {
    setData((current) => ({
      ...current,
      lists: current.lists.map((list) => (list.id === listId ? { ...list, ...patch } : list)),
    }));
  }

  function spin() {
    if (!selectedList || spinning || entries.length < 2) return;

    const chosen = pickWinner(entries, data.settings.weighted, data.settings.noRepeat ? lastWinner : undefined);
    const delta = spinDelta(segments[chosen], rotation);
    setSpinning(true);
    setWinnerIndex(null);
    setRotation((current) => current + delta);

    window.setTimeout(() => {
      const winner = entries[chosen];
      const result: SpinResult = {
        id: crypto.randomUUID(),
        label: winner.label,
        listId: selectedList.id,
        listName: selectedList.name,
        timestamp: new Date().toISOString(),
      };

      setWinnerIndex(chosen);
      setLastWinner(winner.label);
      setSpinning(false);
      setData((current) => ({
        ...current,
        history: [result, ...current.history].slice(0, 50),
        lists: data.settings.eliminate
          ? current.lists.map((list) =>
              list.id === selectedList.id
                ? { ...list, entries: list.entries.filter((entry) => entry.id !== winner.id) }
                : list
            )
          : current.lists,
      }));
    }, spinDurationMs);
  }

  function exportList() {
    if (!selectedList) return;
    const blob = new Blob([JSON.stringify(selectedList.entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedList.name.replaceAll(" ", "-").toLowerCase()}-entries.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importList(file: File) {
    if (!selectedList) return;
    const text = await file.text();
    const imported = JSON.parse(text) as WheelEntry[];
    const existing = new Set(selectedList.entries.map((entry) => entry.label.toLowerCase()));
    const entriesToAdd = imported
      .filter((entry) => entry.label?.trim() && !existing.has(entry.label.toLowerCase()))
      .map((entry) => ({
        id: crypto.randomUUID(),
        label: entry.label.trim(),
        colorHex: entry.colorHex || nextColorHex(selectedList.entries),
        weight: Math.max(0, Number(entry.weight) || 1),
      }));
    updateList(selectedList.id, { entries: [...selectedList.entries, ...entriesToAdd] });
  }

  return (
    <main className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">SFR</span>
          <div>
            <h1>SpinFlipRoll</h1>
            <p>{data.lists.length} wheel{data.lists.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        <div className="list-create">
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && addList()}
            placeholder="New wheel"
          />
          <button onClick={addList} aria-label="Add wheel">
            +
          </button>
        </div>

        <nav className="wheel-list" aria-label="Wheels">
          {data.lists.map((list) => (
            <button
              key={list.id}
              className={list.id === selectedList?.id ? "selected" : ""}
              onClick={() => {
                setSelectedListId(list.id);
                setWinnerIndex(null);
              }}
            >
              <span>{list.name}</span>
              <small>{list.entries.length}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <input
            className="title-input"
            value={selectedList?.name ?? ""}
            onChange={(event) => renameSelected(event.target.value)}
            aria-label="Wheel name"
          />
          <div className="top-actions">
            <label className="file-button">
              Import
              <input
                type="file"
                accept="application/json"
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
            <button className="danger" onClick={deleteSelectedList} disabled={data.lists.length <= 1}>
              Delete
            </button>
          </div>
        </header>

        <div className="main-grid">
          <section className="wheel-panel">
            <div className="chips" aria-label="Spin settings">
              <button
                className={data.settings.weighted ? "on" : ""}
                onClick={() => updateSettings({ weighted: !data.settings.weighted })}
              >
                Weighted
              </button>
              <button
                className={data.settings.noRepeat ? "on" : ""}
                onClick={() => updateSettings({ noRepeat: !data.settings.noRepeat })}
              >
                No repeat
              </button>
              <button
                className={data.settings.eliminate ? "on" : ""}
                onClick={() => updateSettings({ eliminate: !data.settings.eliminate })}
              >
                Eliminate
              </button>
            </div>

            <Wheel entries={entries} segments={segments} rotation={rotation} winnerIndex={winnerIndex} />

            <button className="spin-button" onClick={spin} disabled={spinning || entries.length < 2}>
              {spinning ? "Spinning..." : "Spin"}
            </button>

            {winnerIndex !== null && entries[winnerIndex] && (
              <div className="winner-banner">
                <span style={{ backgroundColor: `#${entries[winnerIndex].colorHex}` }} />
                <strong>{entries[winnerIndex].label}</strong>
              </div>
            )}
          </section>

          <section className="controls">
            <div className="entry-add">
              <input
                value={newEntry}
                onChange={(event) => setNewEntry(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && addEntry()}
                placeholder="Add option"
              />
              <button onClick={addEntry}>Add</button>
            </div>

            <div className="entry-list">
              {entries.map((entry) => (
                <div className="entry-row" key={entry.id}>
                  <input
                    type="color"
                    value={`#${entry.colorHex}`}
                    onChange={(event) => updateEntry(entry.id, { colorHex: event.target.value.slice(1).toUpperCase() })}
                    aria-label={`Color for ${entry.label}`}
                  />
                  <input value={entry.label} onChange={(event) => updateEntry(entry.id, { label: event.target.value })} />
                  <input
                    className="weight"
                    type="number"
                    min="0"
                    step="0.1"
                    value={entry.weight}
                    onChange={(event) => updateEntry(entry.id, { weight: Number(event.target.value) })}
                    aria-label={`Weight for ${entry.label}`}
                  />
                  <button className="icon-button" onClick={() => removeEntry(entry.id)} aria-label={`Remove ${entry.label}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="history">
            <h2>History</h2>
            {listHistory.length === 0 ? (
              <p>No spins yet</p>
            ) : (
              <ol>
                {listHistory.map((result) => (
                  <li key={result.id}>
                    <span>{result.label}</span>
                    <time>{new Date(result.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
