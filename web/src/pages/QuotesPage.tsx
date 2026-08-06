import { useCallback, useEffect, useRef, useState } from "react";
import type { Quote } from "@quotation/shared";
import { api } from "../api/client.js";
import ConfirmDialog from "../components/ConfirmDialog.js";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconEdit,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from "../icons.js";

const PAGE_SIZE = 100;

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

interface QuoteFormValues {
  text: string;
  author: string;
  game: string;
  date: string;
}

const EMPTY_FORM: QuoteFormValues = { text: "", author: "", game: "", date: "" };

function QuoteForm({
  values,
  onChange,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  values: QuoteFormValues;
  onChange: (v: QuoteFormValues) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="inline-form">
      <div className="grid-2">
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="label">Quote text</label>
          <input
            className="input"
            value={values.text}
            onChange={(e) => onChange({ ...values, text: e.target.value })}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Author</label>
          <input
            className="input"
            placeholder="defaults to channel name"
            value={values.author}
            onChange={(e) => onChange({ ...values, author: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Game</label>
          <input
            className="input"
            placeholder="game being played"
            value={values.game}
            onChange={(e) => onChange({ ...values, game: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Date quoted</label>
          <input
            type="datetime-local"
            className="input"
            value={values.date}
            onChange={(e) => onChange({ ...values, date: e.target.value })}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={onSave} disabled={saving || !values.text.trim()}>
          {saving ? "Saving…" : saveLabel}
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function QuotesPage() {
  const [items, setItems] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addValues, setAddValues] = useState<QuoteFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<QuoteFormValues>(EMPTY_FORM);

  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api
      .listQuotes({ search: search || undefined, page, pageSize: PAGE_SIZE })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load quotes"));
  }, [search, page]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function openAdd() {
    setEditingId(null);
    setAddValues(EMPTY_FORM);
    setShowAdd(true);
  }

  async function handleAddSave() {
    setSaving(true);
    setError(null);
    try {
      await api.createQuote({
        text: addValues.text.trim(),
        author: addValues.author.trim() || undefined,
        game: addValues.game.trim() || null,
        createdAt: fromDatetimeLocal(addValues.date),
      });
      setShowAdd(false);
      setPage(1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add quote");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(q: Quote) {
    setShowAdd(false);
    setEditingId(q.id);
    setEditValues({
      text: q.text,
      author: q.author,
      game: q.game ?? "",
      date: toDatetimeLocal(q.createdAt),
    });
  }

  async function handleEditSave() {
    if (editingId === null) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateQuote(editingId, {
        text: editValues.text.trim(),
        author: editValues.author.trim(),
        game: editValues.game.trim() || null,
        createdAt: fromDatetimeLocal(editValues.date),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update quote");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteQuote(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete quote");
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    setError(null);
    try {
      const { quotes } = await api.exportQuotes();
      const blob = new Blob([JSON.stringify({ quotes }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quotes-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export quotes");
    }
  }

  function handleImportClick() {
    setImportMsg(null);
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setImportMsg(null);
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.quotes;
      if (!Array.isArray(list)) throw new Error("File doesn't look like a quotes export");
      const result = await api.importQuotes(list);
      setImportMsg(`Imported ${result.imported} quote${result.imported === 1 ? "" : "s"}.`);
      setPage(1);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import quotes");
    } finally {
      setImportBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Quotes</h1>
          <p>Everything your channel has said worth remembering.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <span className="panel-title">
            {total} quote{total === 1 ? "" : "s"}
          </span>
          <div className="toolbar">
            <button className="icon-btn" title="Export quotes as JSON" onClick={handleExport}>
              <IconDownload />
            </button>
            <button className="icon-btn" title="Import quotes from JSON" onClick={handleImportClick} disabled={importBusy}>
              <IconUpload />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <span className="toolbar-divider" />
            <button
              className="btn btn-primary"
              onClick={() => (showAdd ? setShowAdd(false) : openAdd())}
            >
              {showAdd ? <IconX style={{ width: 13, height: 13 }} /> : <IconPlus style={{ width: 13, height: 13 }} />}
              {showAdd ? "Cancel" : "Add Quote"}
            </button>
          </div>
        </div>

        <div className="search-row">
          <form className="search-group" onSubmit={handleSearchSubmit}>
            <input
              className="input"
              placeholder="Search quotes or authors…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button type="submit" className="search-btn" title="Search">
              <IconSearch style={{ width: 14, height: 14 }} />
            </button>
          </form>
        </div>

        {showAdd && (
          <QuoteForm
            values={addValues}
            onChange={setAddValues}
            onSave={handleAddSave}
            onCancel={() => setShowAdd(false)}
            saving={saving}
            saveLabel="Add quote"
          />
        )}

        {error && (
          <p className="error-text" style={{ padding: "10px 14px 0" }}>
            {error}
          </p>
        )}
        {importMsg && (
          <p className="hint" style={{ padding: "10px 14px 0" }}>
            {importMsg}
          </p>
        )}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>ID</th>
                <th>Quote</th>
                <th style={{ width: 140 }}>Author</th>
                <th style={{ width: 140 }}>Game</th>
                <th style={{ width: 110 }}>Date</th>
                <th style={{ width: 76 }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={6}>
                    {search ? "No quotes match your search." : "No quotes yet — add one above, or say something quotable and run !addquote."}
                  </td>
                </tr>
              )}
              {items.map((q) =>
                editingId === q.id ? (
                  <tr key={q.id}>
                    <td colSpan={6} style={{ padding: 0 }}>
                      <QuoteForm
                        values={editValues}
                        onChange={setEditValues}
                        onSave={handleEditSave}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                        saveLabel="Save changes"
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={q.id}>
                    <td className="col-id">#{q.id}</td>
                    <td className="quote-text-cell">{q.text}</td>
                    <td className="col-meta">{q.author}</td>
                    <td className="col-meta">{q.game || "—"}</td>
                    <td className="col-meta">{new Date(q.createdAt).toLocaleDateString()}</td>
                    <td className="col-actions">
                      <button className="icon-btn" title="Edit" onClick={() => startEdit(q)}>
                        <IconEdit />
                      </button>
                      <button className="icon-btn danger" title="Delete" onClick={() => setDeleteTarget(q)}>
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>

        <div className="table-footer table-footer-end">
          <div className="pagination">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <IconChevronLeft style={{ width: 13, height: 13 }} />
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <IconChevronRight style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this quote?"
          message={`#${deleteTarget.id}: "${deleteTarget.text.length > 120 ? `${deleteTarget.text.slice(0, 120)}…` : deleteTarget.text}" — this can't be undone.`}
          confirmLabel="Delete quote"
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
