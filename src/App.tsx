import { useEffect, useState } from "react";
import { useRoute } from "./router";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { Sidebar } from "./components/Sidebar";
import { DashboardScreen } from "./features/dashboard/DashboardScreen";
import { TasksScreen } from "./features/tasks/TasksScreen";
import { CalendarScreen } from "./features/calendar/CalendarScreen";
import { HabitsScreen } from "./features/habits/HabitsScreen";
import { RecurringScreen } from "./features/recurring/RecurringScreen";
import { BudgetScreen } from "./features/budget/BudgetScreen";
import { GoalsScreen } from "./features/goals/GoalsScreen";
import { SavingsScreen } from "./features/savings/SavingsScreen";
import { DebtScreen } from "./features/debt/DebtScreen";
import { MealsScreen } from "./features/meals/MealsScreen";
import { MealSetupScreen } from "./features/mealsetup/MealSetupScreen";
import { GroceryScreen } from "./features/grocery/GroceryScreen";
import { FitnessScreen } from "./features/fitness/FitnessScreen";
import { WeightScreen } from "./features/weight/WeightScreen";
import { HydrationScreen } from "./features/hydration/HydrationScreen";
import { TimeBlockScreen } from "./features/timeblock/TimeBlockScreen";
import { MoreScreen } from "./features/more/MoreScreen";
import { PrivacyScreen } from "./features/privacy/PrivacyScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { bootstrap } from "./stores/bootstrap";
import { preloadGis } from "./lib/google/auth";

export default function App() {
  const route = useRoute();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootstrap().then(() => setReady(true));
    preloadGis();
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <div className="muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`app${route === "dashboard" ? " app--dashboard" : ""}`}>
      <Sidebar active={route} />
      <div className="app__col">
        <Header />
        <main className={`app__main${route === "dashboard" ? " app__main--wide" : ""}`} key={route}>
          {route === "dashboard" && <DashboardScreen />}
          {route === "tasks" && <TasksScreen />}
          {route === "calendar" && <CalendarScreen />}
          {route === "habits" && <HabitsScreen />}
          {route === "recurring" && <RecurringScreen />}
          {route === "budget" && <BudgetScreen />}
          {route === "goals" && <GoalsScreen />}
          {route === "savings" && <SavingsScreen />}
          {route === "debt" && <DebtScreen />}
          {route === "meals" && <MealsScreen />}
          {route === "mealsetup" && <MealSetupScreen />}
          {route === "grocery" && <GroceryScreen />}
          {route === "fitness" && <FitnessScreen />}
          {route === "weight" && <WeightScreen />}
          {route === "hydration" && <HydrationScreen />}
          {route === "timeblock" && <TimeBlockScreen />}
          {route === "more" && <MoreScreen />}
          {route === "privacy" && <PrivacyScreen />}
          {route === "settings" && <SettingsScreen />}
        </main>
      </div>
      <TabBar active={route} />
    </div>
  );
}
