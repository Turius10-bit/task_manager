export const STATUS = { todo: "À faire", doing: "En cours", done: "Terminée" };
export const PRIORITY = { low: "Faible", medium: "Moyenne", high: "Élevée" };

export function formatDate(iso) {
  if (!iso) return "Sans échéance";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}
