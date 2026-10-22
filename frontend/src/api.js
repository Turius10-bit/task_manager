let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

async function request(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/api/auth/")) onUnauthorized();
    const msg = data.errors ? Object.values(data.errors).join(" ") : data.error;
    throw new Error(msg || "Une erreur est survenue.");
  }
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request("/api/auth/me"),
  login: (body) => request("/api/auth/login", json("POST", body)),
  register: (body) => request("/api/auth/register", json("POST", body)),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  tasks: (params) => request("/api/tasks?" + new URLSearchParams(params)),
  createTask: (body) => request("/api/tasks", json("POST", body)),
  updateTask: (id, body) => request(`/api/tasks/${id}`, json("PUT", body)),
  deleteTask: (id) => request(`/api/tasks/${id}`, { method: "DELETE" }),
  categories: () => request("/api/categories"),
  createCategory: (name) => request("/api/categories", json("POST", { name })),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: "DELETE" }),
  stats: () => request("/api/stats"),
};
