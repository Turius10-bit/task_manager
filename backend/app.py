import os
import sqlite3
from datetime import date, datetime, timedelta
from functools import wraps

from flask import Flask, g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

DB_PATH = os.path.join(os.path.dirname(__file__), "taskmanager.db")
STATUSES = ("todo", "doing", "done")
PRIORITIES = ("low", "medium", "high")
DEFAULT_CATEGORIES = [("Travail", "#5b5bd6"), ("Personnel", "#e0743c"), ("Études", "#2fa4a9")]

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-a-changer-en-production")
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax", PERMANENT_SESSION_LIFETIME=timedelta(days=14))


def now():
    return datetime.now().isoformat(sep=" ", timespec="seconds")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#5b5bd6',
            UNIQUE (user_id, name)
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            due_date TEXT,
            category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            completed_at TEXT
        );
        """
    )
    db.commit()
    db.close()


# ---------- Authentification ----------

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Session expirée. Reconnectez-vous."}), 401
        return f(*args, **kwargs)

    return wrapper


def uid():
    return session["user_id"]


def public_user(row):
    return {"id": row["id"], "name": row["name"], "email": row["email"]}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not name or "@" not in email or len(password) < 6:
        return jsonify({"error": "Nom, e-mail valide et mot de passe de 6 caractères minimum requis."}), 400
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?,?,?)",
            (name, email, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        return jsonify({"error": "Un compte existe déjà avec cet e-mail."}), 409
    db.executemany(
        "INSERT INTO categories (user_id, name, color) VALUES (?,?,?)",
        [(cur.lastrowid, n, c) for n, c in DEFAULT_CATEGORIES],
    )
    db.commit()
    session.clear()
    session.permanent = True
    session["user_id"] = cur.lastrowid
    row = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(public_user(row)), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    row = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not check_password_hash(row["password_hash"], data.get("password") or ""):
        return jsonify({"error": "E-mail ou mot de passe incorrect."}), 401
    session.clear()
    session.permanent = True
    session["user_id"] = row["id"]
    return jsonify(public_user(row))


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (uid(),)).fetchone()
    if not row:
        session.clear()
        return jsonify({"error": "Compte introuvable."}), 401
    return jsonify(public_user(row))


# ---------- Tâches ----------

TASK_SELECT = """
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
"""


def serialize(row):
    task = dict(row)
    task["overdue"] = bool(task["due_date"] and task["due_date"] < date.today().isoformat() and task["status"] != "done")
    return task


def owns_category(db, cat_id):
    return db.execute("SELECT 1 FROM categories WHERE id = ? AND user_id = ?", (cat_id, uid())).fetchone() is not None


def clean_payload(data, partial=False):
    errors, out = {}, {}
    if not partial or "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            errors["title"] = "Le titre est obligatoire."
        out["title"] = title
    if "description" in data:
        out["description"] = (data.get("description") or "").strip()
    if "status" in data:
        if data["status"] not in STATUSES:
            errors["status"] = "Statut invalide."
        out["status"] = data["status"]
    if "priority" in data:
        if data["priority"] not in PRIORITIES:
            errors["priority"] = "Priorité invalide."
        out["priority"] = data["priority"]
    if "due_date" in data:
        due = data["due_date"] or None
        if due:
            try:
                date.fromisoformat(due)
            except ValueError:
                errors["due_date"] = "Date invalide (AAAA-MM-JJ)."
        out["due_date"] = due
    if "category_id" in data:
        out["category_id"] = data["category_id"] or None
        if out["category_id"] and not owns_category(get_db(), out["category_id"]):
            errors["category_id"] = "Catégorie invalide."
    return out, errors


@app.get("/api/tasks")
@login_required
def list_tasks():
    q = request.args.get("q", "").strip()
    status = request.args.get("status", "")
    priority = request.args.get("priority", "")
    category = request.args.get("category", "")
    sort = request.args.get("sort", "created")

    where, params = ["t.user_id = ?"], [uid()]
    if q:
        where.append("t.title LIKE ?")
        params.append(f"%{q}%")
    if status in STATUSES:
        where.append("t.status = ?")
        params.append(status)
    if priority in PRIORITIES:
        where.append("t.priority = ?")
        params.append(priority)
    if category:
        where.append("t.category_id = ?")
        params.append(category)

    sql = TASK_SELECT + " WHERE " + " AND ".join(where)
    if sort == "due":
        sql += " ORDER BY t.due_date IS NULL, t.due_date ASC, t.created_at DESC"
    else:
        sql += " ORDER BY t.created_at DESC, t.id DESC"
    return jsonify([serialize(r) for r in get_db().execute(sql, params).fetchall()])


@app.post("/api/tasks")
@login_required
def create_task():
    data, errors = clean_payload(request.get_json(silent=True) or {})
    if errors:
        return jsonify({"errors": errors}), 400
    db = get_db()
    status = data.get("status", "todo")
    cur = db.execute(
        """INSERT INTO tasks (user_id, title, description, status, priority, due_date, category_id, created_at, completed_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (uid(), data["title"], data.get("description", ""), status, data.get("priority", "medium"),
         data.get("due_date"), data.get("category_id"), now(), now() if status == "done" else None),
    )
    db.commit()
    return jsonify(serialize(db.execute(TASK_SELECT + " WHERE t.id = ?", (cur.lastrowid,)).fetchone())), 201


@app.put("/api/tasks/<int:task_id>")
@login_required
def update_task(task_id):
    data, errors = clean_payload(request.get_json(silent=True) or {}, partial=True)
    if errors:
        return jsonify({"errors": errors}), 400
    if not data:
        return jsonify({"errors": {"body": "Aucune donnée à modifier."}}), 400
    db = get_db()
    current = db.execute("SELECT status FROM tasks WHERE id = ? AND user_id = ?", (task_id, uid())).fetchone()
    if not current:
        return jsonify({"error": "Tâche introuvable."}), 404
    if "status" in data and data["status"] != current["status"]:
        data["completed_at"] = now() if data["status"] == "done" else None
    sets = ", ".join(f"{k} = ?" for k in data)
    db.execute(f"UPDATE tasks SET {sets} WHERE id = ? AND user_id = ?", (*data.values(), task_id, uid()))
    db.commit()
    return jsonify(serialize(db.execute(TASK_SELECT + " WHERE t.id = ?", (task_id,)).fetchone()))


@app.delete("/api/tasks/<int:task_id>")
@login_required
def delete_task(task_id):
    db = get_db()
    cur = db.execute("DELETE FROM tasks WHERE id = ? AND user_id = ?", (task_id, uid()))
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Tâche introuvable."}), 404
    return "", 204


# ---------- Catégories ----------

@app.get("/api/categories")
@login_required
def list_categories():
    rows = get_db().execute("SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY name", (uid(),)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/categories")
@login_required
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"errors": {"name": "Le nom est obligatoire."}}), 400
    db = get_db()
    palette = ["#5b5bd6", "#e0743c", "#2fa4a9", "#c24d8f", "#7a9a2e", "#d19a1f"]
    count = db.execute("SELECT COUNT(*) FROM categories WHERE user_id = ?", (uid(),)).fetchone()[0]
    try:
        cur = db.execute(
            "INSERT INTO categories (user_id, name, color) VALUES (?,?,?)",
            (uid(), name, data.get("color") or palette[count % len(palette)]),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"errors": {"name": "Cette catégorie existe déjà."}}), 409
    row = db.execute("SELECT id, name, color FROM categories WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.delete("/api/categories/<int:cat_id>")
@login_required
def delete_category(cat_id):
    db = get_db()
    db.execute("DELETE FROM categories WHERE id = ? AND user_id = ?", (cat_id, uid()))
    db.commit()
    return "", 204


# ---------- Statistiques ----------

@app.get("/api/stats")
@login_required
def stats():
    db = get_db()
    user = uid()
    counts = {s: 0 for s in STATUSES}
    for r in db.execute("SELECT status, COUNT(*) AS n FROM tasks WHERE user_id = ? GROUP BY status", (user,)):
        counts[r["status"]] = r["n"]
    total = sum(counts.values())
    overdue = db.execute(
        "SELECT COUNT(*) FROM tasks WHERE user_id = ? AND due_date < ? AND status != 'done'",
        (user, date.today().isoformat()),
    ).fetchone()[0]

    by_priority = {p: 0 for p in PRIORITIES}
    for r in db.execute("SELECT priority, COUNT(*) AS n FROM tasks WHERE user_id = ? GROUP BY priority", (user,)):
        by_priority[r["priority"]] = r["n"]

    by_category = [
        {"name": r["name"] or "Sans catégorie", "color": r["color"] or "#8b93ad", "count": r["n"]}
        for r in db.execute(
            """SELECT c.name, c.color, COUNT(*) AS n FROM tasks t LEFT JOIN categories c ON c.id = t.category_id
               WHERE t.user_id = ? GROUP BY c.id ORDER BY n DESC""",
            (user,),
        )
    ]

    today = date.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    created = {r[0]: r[1] for r in db.execute(
        "SELECT date(created_at), COUNT(*) FROM tasks WHERE user_id = ? AND date(created_at) >= ? GROUP BY 1", (user, days[0]))}
    completed = {r[0]: r[1] for r in db.execute(
        "SELECT date(completed_at), COUNT(*) FROM tasks WHERE user_id = ? AND completed_at IS NOT NULL AND date(completed_at) >= ? GROUP BY 1",
        (user, days[0]))}
    activity = [{"date": d, "created": created.get(d, 0), "completed": completed.get(d, 0)} for d in days]

    return jsonify({
        "total": total, **counts, "overdue": overdue,
        "completion_rate": round(counts["done"] / total * 100) if total else 0,
        "by_priority": by_priority, "by_category": by_category, "activity": activity,
    })


init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
