import { useEffect, useState } from "react";
import { api } from "./api.js";
import { STATUS, PRIORITY, formatDate } from "./shared.js";

function Donut({ data, total }) {
  const R = 48, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Répartition des tâches par statut">
      <circle cx="60" cy="60" r={R} className="donut-track" />
      {data.map((d) => {
        const len = total ? (d.value / total) * C : 0;
        const el = (
          <circle key={d.label} cx="60" cy="60" r={R} transform="rotate(-90 60 60)"
            style={{ stroke: d.color }} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
        );
        offset += len;
        return el;
      })}
      <text x="60" y="60" className="donut-total">{total}</text>
      <text x="60" y="76" className="donut-sub">tâches</text>
    </svg>
  );
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted">Pas encore de données.</p>;
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></span>
          <span className="bar-value">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Activity({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.completed]));
  const H = 120;
  return (
    <svg viewBox="0 0 420 170" className="activity" role="img" aria-label="Activité des 7 derniers jours">
      {data.map((d, i) => {
        const x = 12 + i * 58;
        const hc = (d.created / max) * H, hd = (d.completed / max) * H;
        const day = new Date(d.date + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short" });
        return (
          <g key={d.date}>
            <rect x={x} y={140 - hc} width="20" height={hc} rx="3" className="bar-created"><title>{d.created} créée(s)</title></rect>
            <rect x={x + 24} y={140 - hd} width="20" height={hd} rx="3" className="bar-completed"><title>{d.completed} terminée(s)</title></rect>
            <text x={x + 22} y="158" className="axis">{day}</text>
          </g>
        );
      })}
      <line x1="0" y1="140" x2="420" y2="140" className="axis-line" />
    </svg>
  );
}

export default function Dashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.stats(), api.tasks({ sort: "due" })])
      .then(([s, t]) => {
        setStats(s);
        setUpcoming(t.filter((x) => x.status !== "done" && x.due_date).slice(0, 5));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error banner">{error}</p>;
  if (!stats) return <p className="muted">Chargement…</p>;

  const cards = [
    ["Total", stats.total, "total"],
    ["À faire", stats.todo, "todo"],
    ["En cours", stats.doing, "doing"],
    ["Terminées", stats.done, "done"],
    ["En retard", stats.overdue, "late"],
  ];
  const statusData = [
    { label: "À faire", value: stats.todo, color: "var(--todo)" },
    { label: "En cours", value: stats.doing, color: "var(--doing)" },
    { label: "Terminées", value: stats.done, color: "var(--done)" },
  ];
  const prioRows = [
    { label: "Élevée", value: stats.by_priority.high, color: "var(--late)" },
    { label: "Moyenne", value: stats.by_priority.medium, color: "var(--doing)" },
    { label: "Faible", value: stats.by_priority.low, color: "var(--done)" },
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Bonjour, {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {stats.total === 0 ? "Ajoutez votre première tâche pour voir vos statistiques." : `Vous avez terminé ${stats.completion_rate} % de vos tâches.`}
          </p>
        </div>
      </header>

      <section className="cards">
        {cards.map(([label, value, key]) => (
          <div key={key} className={`card stat stat-${key}`}>
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
          </div>
        ))}
      </section>

      <section className="grid">
        <div className="card">
          <h2>Statuts</h2>
          <div className="donut-wrap">
            <Donut data={statusData} total={stats.total} />
            <ul className="legend">
              {statusData.map((d) => (
                <li key={d.label}><span className="dot" style={{ background: d.color }} />{d.label}<b>{d.value}</b></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="card">
          <h2>Priorités</h2>
          <Bars rows={prioRows} />
        </div>
        <div className="card span-2">
          <h2>Activité des 7 derniers jours</h2>
          <Activity data={stats.activity} />
          <div className="legend row">
            <span><i className="dot created" />Créées</span>
            <span><i className="dot completed" />Terminées</span>
          </div>
        </div>
        <div className="card">
          <h2>Par catégorie</h2>
          <Bars rows={stats.by_category.map((c) => ({ label: c.name, value: c.count, color: c.color }))} />
        </div>
        <div className="card">
          <h2>Prochaines échéances</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Aucune échéance à venir.</p>
          ) : (
            <ul className="upcoming">
              {upcoming.map((t) => (
                <li key={t.id}>
                  <span>{t.title}</span>
                  <small className={t.overdue ? "late" : "muted"}>{t.overdue ? "En retard · " : ""}{formatDate(t.due_date)}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
