// Single source of truth for navigation — consumed by the sidebar (desktop),
// the More hub (mobile) and the bottom tab bar.
import type { LucideIcon } from "lucide-react";
import type { Route } from "./router";
import {
  IconHome,
  IconTasks,
  IconCalendar,
  IconHabits,
  IconBudget,
  IconTarget,
  IconPiggy,
  IconCard,
  IconMeal,
  IconCart,
  IconDumbbell,
  IconScale,
  IconDroplet,
  IconClock,
  IconRepeat,
  IconBook,
  IconSettings,
} from "./components/icons";

export interface NavItem {
  route: Route;
  label: string;
  Icon: LucideIcon;
  color: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { route: "dashboard", label: "Dashboard", Icon: IconHome, color: "var(--cat-sky)" },
      { route: "tasks", label: "Tasks", Icon: IconTasks, color: "var(--cat-lavender)" },
      { route: "calendar", label: "Calendar", Icon: IconCalendar, color: "var(--cat-teal)" },
    ],
  },
  {
    title: "Organization",
    items: [
      { route: "goals", label: "Goals", Icon: IconTarget, color: "var(--cat-pink)" },
      { route: "habits", label: "Habits", Icon: IconHabits, color: "var(--cat-teal)" },
      { route: "recurring", label: "Recurring", Icon: IconRepeat, color: "var(--cat-sky)" },
      { route: "timeblock", label: "Time Blocking", Icon: IconClock, color: "var(--cat-lavender)" },
    ],
  },
  {
    title: "Finances",
    items: [
      { route: "budget", label: "Budget", Icon: IconBudget, color: "var(--cat-butter)" },
      { route: "savings", label: "Savings", Icon: IconPiggy, color: "var(--cat-teal)" },
      { route: "debt", label: "Debt Payoff", Icon: IconCard, color: "var(--cat-pink)" },
    ],
  },
  {
    title: "Wellness",
    items: [
      { route: "mealsetup", label: "Meal Setup", Icon: IconBook, color: "var(--cat-pink)" },
      { route: "meals", label: "Meal Planner", Icon: IconMeal, color: "var(--cat-butter)" },
      { route: "grocery", label: "Grocery List", Icon: IconCart, color: "var(--cat-sky)" },
      { route: "fitness", label: "Fitness", Icon: IconDumbbell, color: "var(--cat-lavender)" },
      { route: "weight", label: "Weight", Icon: IconScale, color: "var(--cat-teal)" },
      { route: "hydration", label: "Hydration", Icon: IconDroplet, color: "var(--cat-sky)" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  route: "settings",
  label: "Settings",
  Icon: IconSettings,
  color: "var(--muted)",
};

export const ALL_NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

// Every route's display name, including the ones with no nav entry (More,
// Privacy) — used to label the "Coach Tour" button with the screen it'll
// actually tour, so it's obvious the tour is scoped to where you are.
export const ROUTE_LABELS: Record<Route, string> = {
  ...Object.fromEntries(ALL_NAV_ITEMS.map((i) => [i.route, i.label])),
  settings: SETTINGS_ITEM.label,
  more: "More",
  privacy: "Privacy",
  whatsnew: "What's New",
} as Record<Route, string>;

// The bottom tab bar (mobile) hardcodes these 4 + More as fixed chrome, so
// hiding a section never breaks that layout — only the remaining "extra"
// modules are offered as hideable in Settings.
const CORE_ROUTES: Route[] = ["dashboard", "tasks", "calendar", "habits"];
export const HIDEABLE_NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => !CORE_ROUTES.includes(i.route)
);
