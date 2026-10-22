import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { STATUS, PRIORITY, formatDate } from "./shared.js";

const EMPTY_FORM = { title: "", description: "", status: "todo", priority: "medium", due_date: "", category_id: "" };

function TaskModal({ categories, initial, onSubmit, onClose }) {
  const [form, setForm] = useState(initial ? { ...EMPTY_FORM, ...initial, category_id: initial.category_id ?? "" } : EMPTY_FORM);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onSubmit({
        title: form.title, description: form.description, status: form.status, priority: form.priority,
        due_date: form.due_date || null, category_id: form.category_id ? Number(form.category_id) : null,
      });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={initial ? "Modifier la tâche" : "Nouvelle tâche"}>
        <h2>{initial ? "Modifier la tâche" : "Nouvelle tâche"}</h2>
        <label className="wide">Titre<input value={form.title} onChange={set("title")} placeholder="Ex. Préparer la soutenance" autoFocus /></label>
        <label className="wide">Description<textarea rows="3" value={form.description || ""} onChange={set("description")} /></label>
        <label>Statut
          <select value={form.status} onChange={set("status")}>{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label>Priorité
          <select value={form.priority} onChange={set("priority")}>{Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label>Échéance<input type="date" value={form.due_date || ""} onChange={set("due_date")} /></label>
        <label>Catégorie
          <select value={form.category_id} onChange={set("category_id")}>
            <option value="">Aucune</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {error && <p className="error wide" role="alert">{error}</p>}
        <div className="form-actions wide">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button className="btn primary">{initial ? "Enregistrer" : "Ajouter la tâche"}</button>
        </div>
      </form>
    </div>
  );
}

function TaskItem({ task, onStatus, onEdit, onDelete }) {
  return (
    <li className={`task prio-${task.priority} ${task.status === "done" ? "is-done" : ""} ${task.overdue ? "is-overdue" : ""}`}>
      <div className="task-main">
        <h3>{task.title}</h3>
        {task.description && <p className="task-desc">{task.description}</p>}
        <div className="task-meta">
          <span className={`badge prio-badge-${task.priority}`}>Priorité {PRIORITY[task.priority].toLowerCase()}</span>
          <span className={task.overdue ? "late" : "muted"}>{task.overdue ? "En retard · " : ""}{formatDate(task.due_date)}</span>
          {task.category_name && <span className="badge cat" style={{ "--cat": task.category_color }}>{task.category_name}</span>}
        </div>
      </div>
      <div className="task-actions">
        <select value={task.status} onChange={(e) => onStatus(task, e.target.value)} aria-label="Changer le statut">
          {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn" onClick={() => onEdit(task)}>Modifier</button>
        <button className="btn danger" onClick={() => onDelete(task)}>Supprimer</button>
      </div>
    </li>
  );
}

export default function Tasks({ categories, category, setCategory }) {
  const [tasks, setTasks] = useState([]);
  const [filters, setFilters] = useState({ q: "", status: "", priority: "", sort: "created" });
  const [modal, setModal] = useState(null); // null | "new" | task
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, category }).filter(([, v]) => v));
      setTasks(await api.tasks(params));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters, category]);

  useEffect(() => {
    const id = setTimeout(refresh, 200);
    return () => clearTimeout(id);
  }, [refresh]);

  const setFilter = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const save = async (data) => {
    if (modal === "new") await api.createTask(data);
    else await api.updateTask(modal.id, data);
    setModal(null);
    await refresh();
  };
  const changeStatus = async (task, status) => { await api.updateTask(task.id, { status }); await refresh(); };
  const remove = async (task) => {
    if (!window.confirm(`Supprimer « ${task.title} » ?`)) return;
    await api.deleteTask(task.id);
    await refresh();
  };
  const active = filters.q || filters.status || filters.priority || category;

  return (
    <>
      <header className="page-head">
        <div><h1>Mes tâches</h1><p className="muted">{tasks.length} tâche{tasks.length > 1 ? "s" : ""} affichée{tasks.length > 1 ? "s" : ""}</p></div>
        <button className="btn primary" onClick={() => setModal("new")}>+ Nouvelle tâche</button>
      </header>

      <div className="filters">
        <input type="search" placeholder="Rechercher par titre…" value={filters.q} onChange={setFilter("q")} aria-label="Rechercher" />
        <select value={filters.status} onChange={setFilter("status")} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filters.priority} onChange={setFilter("priority")} aria-label="Filtrer par priorité">
          <option value="">Toutes les priorités</option>
          {Object.entries(PRIORITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrer par catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filters.sort} onChange={setFilter("sort")} aria-label="Trier">
          <option value="created">Plus récentes d'abord</option>
          <option value="due">Échéance la plus proche</option>
        </select>
      </div>

      {error && <p className="error banner" role="alert">{error}</p>}
      {loading ? <p className="muted">Chargement…</p> : tasks.length === 0 ? (
        <p className="empty">{active ? "Aucune tâche ne correspond à ces filtres." : "Aucune tâche pour l'instant. Cliquez sur « Nouvelle tâche » pour commencer."}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((t) => <TaskItem key={t.id} task={t} onStatus={changeStatus} onEdit={setModal} onDelete={remove} />)}
        </ul>
      )}

      {modal && <TaskModal categories={categories} initial={modal === "new" ? null : modal} onSubmit={save} onClose={() => setModal(null)} />}
    </>
  );
}
