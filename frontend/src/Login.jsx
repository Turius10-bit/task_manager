import { useState } from "react";
import { api } from "./api.js";

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const user = mode === "login" ? await api.login(form) : await api.register(form);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="logo">✓</div>
        <h1>Gardez le cap sur ce qui compte.</h1>
        <p>Organisez vos tâches, suivez vos échéances et mesurez votre progression au même endroit.</p>
      </aside>
      <main className="auth-panel">
        <form onSubmit={submit} className="auth-form">
          <h2>{mode === "login" ? "Connexion" : "Créer un compte"}</h2>
          {mode === "register" && (
            <label>Nom<input value={form.name} onChange={set("name")} autoComplete="name" required /></label>
          )}
          <label>E-mail<input type="email" value={form.email} onChange={set("email")} autoComplete="email" required /></label>
          <label>
            Mot de passe
            <input type="password" value={form.password} onChange={set("password")} minLength={6} required
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>
            {busy ? "Patientez…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
          </button>
          <p className="switch">
            {mode === "login" ? "Pas encore de compte ?" : "Déjà inscrit ?"}{" "}
            <button type="button" className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Créer un compte" : "Se connecter"}
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
