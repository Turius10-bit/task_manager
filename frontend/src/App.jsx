import { useEffect, useState } from "react";
import { api, setUnauthorizedHandler } from "./api.js";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard.jsx";
import Tasks from "./Tasks.jsx";

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = chargement, null = déconnecté
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  );
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("");
  const [newCat, setNewCat] = useState("");
  const [catError, setCatError] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user) api.categories().then(setCategories).catch(() => {});
  }, [user]);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setView("dashboard");
    setCategory("");
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      const cat = await api.createCategory(newCat);
      setCategories([...categories, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCat("");
      setCatError("");
    } catch (err) {
      setCatError(err.message);
    }
  };

  const removeCategory = async (cat) => {
    if (!window.confirm(`Supprimer la catégorie « ${cat.name} » ? Les tâches seront conservées.`)) return;
    await api.deleteCategory(cat.id);
    setCategories(categories.filter((c) => c.id !== cat.id));
    if (category === String(cat.id)) setCategory("");
  };

  const go = (v, cat = "") => { setView(v); setCategory(cat); setMenuOpen(false); };

  if (user === undefined) return <p className="boot">Chargement…</p>;
  if (user === null) return <Login onLogin={setUser} />;

  return (
    <div className="shell">
      <button className="burger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Ouvrir le menu" aria-expanded={menuOpen}>☰</button>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand"><span className="logo sm">✓</span>Tâches</div>

        <nav>
          <button className={view === "dashboard" ? "nav active" : "nav"} onClick={() => go("dashboard")}>▦ Tableau de bord</button>
          <button className={view === "tasks" && !category ? "nav active" : "nav"} onClick={() => go("tasks")}>☰ Toutes les tâches</button>
        </nav>

        <div className="side-section">
          <h2>Catégories</h2>
          <ul className="cat-list">
            {categories.map((c) => (
              <li key={c.id}>
                <button className={view === "tasks" && category === String(c.id) ? "nav active" : "nav"} onClick={() => go("tasks", String(c.id))}>
                  <span className="dot" style={{ background: c.color }} />{c.name}
                </button>
                <button className="x" onClick={() => removeCategory(c)} aria-label={`Supprimer ${c.name}`}>×</button>
              </li>
            ))}
          </ul>
          <form className="cat-form" onSubmit={addCategory}>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nouvelle catégorie" aria-label="Nouvelle catégorie" />
            <button className="btn">+</button>
          </form>
          {catError && <p className="error small">{catError}</p>}
        </div>

        <div className="side-foot">
          <div className="me"><span className="avatar">{user.name[0].toUpperCase()}</span><span><b>{user.name}</b><small>{user.email}</small></span></div>
          <div className="foot-actions">
            <button className="btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀ Mode clair" : "☾ Mode sombre"}</button>
            <button className="btn" onClick={logout}>Déconnexion</button>
          </div>
        </div>
      </aside>

      <main className="content">
        {view === "dashboard" ? <Dashboard user={user} /> : <Tasks categories={categories} category={category} setCategory={setCategory} />}
      </main>
    </div>
  );
}
