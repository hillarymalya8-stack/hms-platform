"use client";

import { useEffect, useState } from "react";
import { menuWeekdays } from "@hms/shared";

// Today's weekday on this device (0 = Sunday ... 6 = Saturday), refreshed each minute so the
// POS switches to the next day's buffet menu at midnight without a reload.
export function useMenuWeekday() {
  const [weekday, setWeekday] = useState(() => new Date().getDay());

  useEffect(() => {
    const timer = window.setInterval(() => setWeekday(new Date().getDay()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return weekday;
}

export function weekdayLabel(weekday: number) {
  return menuWeekdays[weekday]?.label ?? "";
}

// The full Buffet and the daily buffet sections come first on the till, in menu order.
const buffetCategoryOrder = ["Buffet", "Buffet Appetizers", "Buffet Protein & Starch", "Buffet Veggies & Salads", "Buffet Dessert"];

export function compareMenuCategories(a: string, b: string) {
  const rank = (name: string) => {
    const index = buffetCategoryOrder.indexOf(name);
    return index === -1 ? buffetCategoryOrder.length : index;
  };
  return rank(a) - rank(b);
}
