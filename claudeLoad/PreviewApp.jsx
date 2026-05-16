import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarDays, CandlestickChart, Calculator, FileText, Gamepad2, Globe2, LayoutDashboard, Radar } from "lucide-react";
import IntelliTradeDashboardRefinedPreview from "../intellitrade_dashboard_refined_preview.jsx";
import EconomicCalendarV2Compare from "../economic_calendar_UI_V2.jsx";
import LotSizeCalculatorWidgetPreview from "../lotsize_calculator_widget_preview.jsx";
import TradingViewShellWidget from "../tradingview_shell_widget.jsx";
import StrengthModulesPage from "./modules/StrengthModulesPage.jsx";
import ConflictMapPage from "./modules/ConflictMapModule.jsx";
import IntelliJournalPage from "./modules/IntelliJournalModule.jsx";
import BullBearPage from "./modules/BullBearExperience.jsx";
import MacroMasteryPage from "./modules/MacroMasteryModule.jsx";

const PREVIEWS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    component: IntelliTradeDashboardRefinedPreview,
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    component: EconomicCalendarV2Compare,
  },
  {
    id: "calculator",
    label: "Calculator",
    icon: Calculator,
    component: LotSizeCalculatorWidgetPreview,
  },
  {
    id: "tradingview",
    label: "TradingView",
    icon: CandlestickChart,
    component: TradingViewShellWidget,
  },
  {
    id: "strength",
    label: "Strength",
    icon: Radar,
    component: StrengthModulesPage,
  },
  {
    id: "conflict",
    label: "Conflict Map",
    icon: Globe2,
    component: ConflictMapPage,
  },
  {
    id: "journal",
    label: "Journal",
    icon: FileText,
    component: IntelliJournalPage,
  },
  {
    id: "game",
    label: "Bull vs Bear",
    icon: Gamepad2,
    component: BullBearPage,
  },
  {
    id: "macro",
    label: "Macro Mastery",
    icon: BookOpen,
    component: MacroMasteryPage,
  },
];

function getPreviewIdFromHash(hash) {
  const normalized = hash.replace(/^#/, "");
  return PREVIEWS.some((item) => item.id === normalized) ? normalized : PREVIEWS[0].id;
}

export default function PreviewApp() {
  const [activeId, setActiveId] = useState(() => getPreviewIdFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setActiveId(getPreviewIdFromHash(window.location.hash));
    };

    window.addEventListener("hashchange", onHashChange);

    if (!window.location.hash) {
      window.history.replaceState(null, "", `#${PREVIEWS[0].id}`);
    }

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activePreview = useMemo(
    () => PREVIEWS.find((item) => item.id === activeId) ?? PREVIEWS[0],
    [activeId],
  );

  const ActiveComponent = activePreview.component;

  return (
    <div className="min-h-screen bg-[#020203]">
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
        <div className="preview-nav pointer-events-auto flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-black/55 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
          {PREVIEWS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeId;

            return (
              <button
                key={item.id}
                onClick={() => {
                  window.location.hash = item.id;
                }}
                className={[
                  "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-all",
                  isActive
                    ? "border-violet-400/20 bg-violet-500/[0.12] text-white"
                    : "border-white/10 bg-white/[0.04] text-white/68 hover:border-white/18 hover:text-white",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <ActiveComponent />
    </div>
  );
}
