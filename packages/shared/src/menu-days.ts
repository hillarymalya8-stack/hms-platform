// Day-of-week menus: a product's menuDays lists the weekdays it is served
// (0 = Sunday ... 6 = Saturday, matching Date.getDay()). An empty list means every day.

export const menuWeekdays = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" }
] as const;

export function isServedOnDay(menuDays: readonly number[] | null | undefined, weekday: number) {
  return !menuDays || menuDays.length === 0 || menuDays.includes(weekday);
}

export function normalizeMenuDays(menuDays: readonly number[] | null | undefined) {
  const days = Array.from(new Set((menuDays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))).sort((a, b) => a - b);
  // Every day selected is the same as "every day".
  return days.length === 7 ? [] : days;
}

export function describeMenuDays(menuDays: readonly number[] | null | undefined) {
  const days = normalizeMenuDays(menuDays);
  if (days.length === 0) return "Every day";
  return days.map((day) => menuWeekdays[day].short).join(", ");
}
