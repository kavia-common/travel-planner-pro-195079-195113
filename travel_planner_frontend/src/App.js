import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";

/**
 * Frontend API base:
 * - Per requirement, backend is reachable at http://localhost:3001/api
 * - For hosted environments, set REACT_APP_API_BASE_URL to override.
 */
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:3001/api";

/**
 * Parse JSON safely and surface useful error messages from FastAPI.
 */
async function parseJsonOrThrow(response) {
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    // FastAPI typically returns {"detail": "..."} for errors.
    const detail =
      (json && (json.detail || json.message)) ||
      (typeof text === "string" && text.trim() ? text.trim() : response.statusText);
    const err = new Error(detail);
    err.status = response.status;
    err.body = json;
    throw err;
  }

  return json;
}

// PUBLIC_INTERFACE
function App() {
  /** Trips state */
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState(null);

  /** Itinerary state */
  const [itinerary, setItinerary] = useState([]);

  /** UI state */
  const [activeTab, setActiveTab] = useState("itinerary"); // itinerary | trip
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [loadingItinerary, setLoadingItinerary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState("");

  /** Forms */
  const [newTripName, setNewTripName] = useState("");
  const [tripNotesDraft, setTripNotesDraft] = useState("");

  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDate, setNewItemDate] = useState("");
  const [newItemStartTime, setNewItemStartTime] = useState("");
  const [newItemEndTime, setNewItemEndTime] = useState("");
  const [newItemLocation, setNewItemLocation] = useState("");
  const [newItemNotes, setNewItemNotes] = useState("");
  const [newItemKind, setNewItemKind] = useState("activity");

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId]
  );

  const clearErrorSoon = useCallback(() => {
    // Keep banner visible briefly, but don't aggressively clear while user reads.
    window.clearTimeout(clearErrorSoon._t);
    clearErrorSoon._t = window.setTimeout(() => setErrorBanner(""), 6000);
  }, []);
  // store timeout id on function object
  // eslint-disable-next-line no-underscore-dangle
  clearErrorSoon._t = clearErrorSoon._t || null;

  const showError = useCallback(
    (err, context) => {
      const msg = `${context}: ${err?.message || "Unknown error"}`;
      setErrorBanner(msg);
      clearErrorSoon();
      // Also log for dev visibility without throwing unhandled rejections.
      // eslint-disable-next-line no-console
      console.error(msg, err);
    },
    [clearErrorSoon]
  );

  const apiGet = useCallback(async (path) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    return parseJsonOrThrow(res);
  }, []);

  const apiPost = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return parseJsonOrThrow(res);
  }, []);

  const apiPatch = useCallback(async (path, body) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    return parseJsonOrThrow(res);
  }, []);

  const apiDelete = useCallback(async (path) => {
    const res = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" });
    // DELETE returns 204 with no body in our backend; treat non-2xx as error.
    if (!res.ok) {
      await parseJsonOrThrow(res);
    }
    return null;
  }, []);

  const loadTrips = useCallback(async () => {
    setLoadingTrips(true);
    try {
      const data = await apiGet("/trips");
      setTrips(Array.isArray(data) ? data : []);
      // Auto-select first trip if none selected.
      if (Array.isArray(data) && data.length > 0) {
        setSelectedTripId((prev) => prev ?? data[0].id);
      } else {
        setSelectedTripId(null);
      }
    } catch (err) {
      showError(err, "Failed to load trips");
    } finally {
      setLoadingTrips(false);
    }
  }, [apiGet, showError]);

  const loadItinerary = useCallback(async () => {
    if (!selectedTripId) {
      setItinerary([]);
      return;
    }
    setLoadingItinerary(true);
    try {
      const data = await apiGet(`/trips/${selectedTripId}/itinerary`);
      setItinerary(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err, "Failed to load itinerary");
    } finally {
      setLoadingItinerary(false);
    }
  }, [apiGet, selectedTripId, showError]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    // When trip changes, refresh itinerary + notes draft
    loadItinerary();
    setTripNotesDraft(selectedTrip?.notes || "");
  }, [loadItinerary, selectedTrip?.notes]);

  const onCreateTrip = useCallback(
    async (e) => {
      e.preventDefault();
      const name = newTripName.trim();
      if (!name) return;

      setSaving(true);
      try {
        const created = await apiPost("/trips", { name });
        // Backend returns full Trip including id.
        setTrips((prev) => [created, ...prev]);
        setSelectedTripId(created.id);
        setNewTripName("");
        setActiveTab("itinerary");
      } catch (err) {
        showError(err, "Failed to create trip");
      } finally {
        setSaving(false);
      }
    },
    [apiPost, newTripName, showError]
  );

  const onDeleteTrip = useCallback(async () => {
    if (!selectedTripId) return;
    const trip = trips.find((t) => t.id === selectedTripId);
    const ok = window.confirm(`Delete trip "${trip?.name || "this trip"}"? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    try {
      await apiDelete(`/trips/${selectedTripId}`);
      setTrips((prev) => prev.filter((t) => t.id !== selectedTripId));
      setSelectedTripId((prev) => {
        if (prev !== selectedTripId) return prev;
        const remaining = trips.filter((t) => t.id !== selectedTripId);
        return remaining[0]?.id ?? null;
      });
      setItinerary([]);
    } catch (err) {
      showError(err, "Failed to delete trip");
    } finally {
      setSaving(false);
    }
  }, [apiDelete, selectedTripId, trips, showError]);

  const onSaveTripNotes = useCallback(async () => {
    if (!selectedTripId) return;
    setSaving(true);
    try {
      const updated = await apiPatch(`/trips/${selectedTripId}`, { notes: tripNotesDraft });
      setTrips((prev) => prev.map((t) => (t.id === selectedTripId ? updated : t)));
    } catch (err) {
      showError(err, "Failed to update trip");
    } finally {
      setSaving(false);
    }
  }, [apiPatch, selectedTripId, tripNotesDraft, showError]);

  const onCreateItineraryItem = useCallback(
    async (e) => {
      e.preventDefault();
      if (!selectedTripId) return;

      const title = newItemTitle.trim();
      if (!title) return;

      setSaving(true);
      try {
        const payload = {
          title,
          date: newItemDate ? newItemDate : null, // backend accepts ISO date string or null
          start_time: newItemStartTime || null,
          end_time: newItemEndTime || null,
          location: newItemLocation || null,
          notes: newItemNotes || null,
          kind: newItemKind || "activity",
        };

        const created = await apiPost(`/trips/${selectedTripId}/itinerary`, payload);
        setItinerary((prev) => [...prev, created]);
        setNewItemTitle("");
        setNewItemDate("");
        setNewItemStartTime("");
        setNewItemEndTime("");
        setNewItemLocation("");
        setNewItemNotes("");
        setNewItemKind("activity");
      } catch (err) {
        showError(err, "Failed to create itinerary item");
      } finally {
        setSaving(false);
      }
    },
    [
      apiPost,
      selectedTripId,
      newItemTitle,
      newItemDate,
      newItemStartTime,
      newItemEndTime,
      newItemLocation,
      newItemNotes,
      newItemKind,
      showError,
    ]
  );

  const onDeleteItineraryItem = useCallback(
    async (itemId) => {
      if (!selectedTripId) return;
      setSaving(true);
      try {
        await apiDelete(`/trips/${selectedTripId}/itinerary/${itemId}`);
        setItinerary((prev) => prev.filter((it) => it.id !== itemId));
      } catch (err) {
        showError(err, "Failed to delete itinerary item");
      } finally {
        setSaving(false);
      }
    },
    [apiDelete, selectedTripId, showError]
  );

  const onToggleKind = useCallback(
    async (item) => {
      if (!selectedTripId) return;
      const nextKind = item.kind === "activity" ? "transport" : "activity";
      setSaving(true);
      try {
        const updated = await apiPatch(`/trips/${selectedTripId}/itinerary/${item.id}`, {
          kind: nextKind,
        });
        setItinerary((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      } catch (err) {
        showError(err, "Failed to update itinerary item");
      } finally {
        setSaving(false);
      }
    },
    [apiPatch, selectedTripId, showError]
  );

  return (
    <div className="tp-shell">
      <nav className="tp-nav">
        <div className="tp-brand">
          <div className="tp-logo" aria-hidden="true">
            TP
          </div>
          <div className="tp-titleblock">
            <div className="tp-title">Travel Planner</div>
            <div className="tp-subtitle">Trips + itinerary (FastAPI + SQLite)</div>
          </div>
        </div>

        <div className="tp-navmeta">
          <span className="tp-pill">API: {API_BASE_URL}</span>
        </div>
      </nav>

      {errorBanner ? (
        <div className="tp-error" role="alert">
          {errorBanner}
        </div>
      ) : null}

      <div className="tp-body">
        <aside className="tp-sidebar">
          <div className="tp-sidebar-header">
            <div className="tp-section-title">Trips</div>
            <button className="tp-btn tp-btn-secondary" onClick={loadTrips} disabled={loadingTrips}>
              Refresh
            </button>
          </div>

          <form className="tp-create" onSubmit={onCreateTrip}>
            <input
              className="tp-input"
              value={newTripName}
              onChange={(e) => setNewTripName(e.target.value)}
              placeholder="New trip name (e.g. Tokyo 2026)"
              aria-label="New trip name"
            />
            <button className="tp-btn" type="submit" disabled={saving || !newTripName.trim()}>
              Create
            </button>
          </form>

          <div className="tp-triplist" role="list">
            {loadingTrips ? <div className="tp-muted">Loading trips…</div> : null}
            {!loadingTrips && trips.length === 0 ? (
              <div className="tp-muted">No trips yet. Create one to get started.</div>
            ) : null}

            {trips.map((t) => {
              const active = t.id === selectedTripId;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tp-trip ${active ? "active" : ""}`}
                  onClick={() => setSelectedTripId(t.id)}
                  role="listitem"
                  aria-current={active ? "true" : "false"}
                >
                  <div className="tp-trip-name">{t.name}</div>
                  <div className="tp-trip-meta">
                    <span>ID #{t.id}</span>
                    {t.updated_at ? <span>• updated</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="tp-main">
          <div className="tp-main-header">
            <div>
              <div className="tp-h1">{selectedTrip ? selectedTrip.name : "Select a trip"}</div>
              {selectedTrip ? (
                <div className="tp-muted">
                  Trip ID: <strong>{selectedTrip.id}</strong>
                </div>
              ) : (
                <div className="tp-muted">Create a trip to begin planning.</div>
              )}
            </div>

            <div className="tp-tabs" role="tablist" aria-label="Trip views">
              <button
                type="button"
                className={`tp-tab ${activeTab === "itinerary" ? "active" : ""}`}
                onClick={() => setActiveTab("itinerary")}
                disabled={!selectedTrip}
                role="tab"
                aria-selected={activeTab === "itinerary"}
              >
                Itinerary
              </button>
              <button
                type="button"
                className={`tp-tab ${activeTab === "trip" ? "active" : ""}`}
                onClick={() => setActiveTab("trip")}
                disabled={!selectedTrip}
                role="tab"
                aria-selected={activeTab === "trip"}
              >
                Trip details
              </button>
            </div>
          </div>

          {activeTab === "trip" ? (
            <section className="tp-card" role="tabpanel" aria-label="Trip details">
              {!selectedTrip ? (
                <div className="tp-muted">No trip selected.</div>
              ) : (
                <>
                  <div className="tp-row tp-row-between">
                    <div className="tp-section-title">Notes</div>
                    <div className="tp-row">
                      <button className="tp-btn" onClick={onSaveTripNotes} disabled={saving}>
                        Save
                      </button>
                      <button className="tp-btn tp-btn-danger" onClick={onDeleteTrip} disabled={saving}>
                        Delete trip
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="tp-textarea"
                    value={tripNotesDraft}
                    onChange={(e) => setTripNotesDraft(e.target.value)}
                    placeholder="Add trip notes…"
                    rows={8}
                  />
                </>
              )}
            </section>
          ) : (
            <section className="tp-card" role="tabpanel" aria-label="Itinerary">
              {!selectedTrip ? (
                <div className="tp-muted">No trip selected.</div>
              ) : (
                <>
                  <div className="tp-row tp-row-between">
                    <div className="tp-section-title">Itinerary items</div>
                    <button className="tp-btn tp-btn-secondary" onClick={loadItinerary} disabled={loadingItinerary}>
                      Refresh
                    </button>
                  </div>

                  <form className="tp-grid" onSubmit={onCreateItineraryItem}>
                    <input
                      className="tp-input"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Title (e.g. Museum visit)"
                      aria-label="Itinerary title"
                    />
                    <input
                      className="tp-input"
                      type="date"
                      value={newItemDate}
                      onChange={(e) => setNewItemDate(e.target.value)}
                      aria-label="Date"
                    />
                    <input
                      className="tp-input"
                      value={newItemStartTime}
                      onChange={(e) => setNewItemStartTime(e.target.value)}
                      placeholder="Start time (optional)"
                      aria-label="Start time"
                    />
                    <input
                      className="tp-input"
                      value={newItemEndTime}
                      onChange={(e) => setNewItemEndTime(e.target.value)}
                      placeholder="End time (optional)"
                      aria-label="End time"
                    />
                    <input
                      className="tp-input"
                      value={newItemLocation}
                      onChange={(e) => setNewItemLocation(e.target.value)}
                      placeholder="Location (optional)"
                      aria-label="Location"
                    />
                    <select
                      className="tp-input"
                      value={newItemKind}
                      onChange={(e) => setNewItemKind(e.target.value)}
                      aria-label="Kind"
                    >
                      <option value="activity">activity</option>
                      <option value="transport">transport</option>
                      <option value="lodging">lodging</option>
                      <option value="meal">meal</option>
                      <option value="other">other</option>
                    </select>
                    <input
                      className="tp-input tp-grid-span"
                      value={newItemNotes}
                      onChange={(e) => setNewItemNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      aria-label="Notes"
                    />
                    <button
                      className="tp-btn tp-grid-span"
                      type="submit"
                      disabled={saving || !newItemTitle.trim()}
                    >
                      Add item
                    </button>
                  </form>

                  <div className="tp-list" role="list">
                    {loadingItinerary ? <div className="tp-muted">Loading itinerary…</div> : null}
                    {!loadingItinerary && itinerary.length === 0 ? (
                      <div className="tp-muted">No items yet. Add one above.</div>
                    ) : null}

                    {itinerary.map((it) => (
                      <div key={it.id} className="tp-item" role="listitem">
                        <div className="tp-item-main">
                          <div className="tp-item-title">{it.title}</div>
                          <div className="tp-item-meta">
                            <span>ID #{it.id}</span>
                            {it.date ? <span>• {it.date}</span> : null}
                            {it.kind ? <span>• {it.kind}</span> : null}
                            {it.location ? <span>• {it.location}</span> : null}
                          </div>
                          {it.notes ? <div className="tp-item-notes">{it.notes}</div> : null}
                        </div>

                        <div className="tp-item-actions">
                          <button
                            type="button"
                            className="tp-btn tp-btn-secondary"
                            onClick={() => onToggleKind(it)}
                            disabled={saving}
                            title="Quick-update kind (PATCH)"
                          >
                            Toggle kind
                          </button>
                          <button
                            type="button"
                            className="tp-btn tp-btn-danger"
                            onClick={() => onDeleteItineraryItem(it.id)}
                            disabled={saving}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
