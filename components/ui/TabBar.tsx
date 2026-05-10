"use client";

import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";

/**
 * // Dashboard prof avec 3 onglets :
 * // <TabBar
 * //   tabs={[
 * //     { id: "overview", label: "Vue d'ensemble", icon: "📊" },
 * //     { id: "students", label: "Élèves", count: 28 },
 * //     { id: "errors", label: "Top erreurs" }
 * //   ]}
 * //   activeTabId={activeTab}
 * //   onChange={setActiveTab}
 * // />
 *
 * // Page questions :
 * // <TabBar
 * //   tabs={[
 * //     { id: "pending", label: "À valider", count: 5 },
 * //     { id: "validated", label: "Validées", count: 142 }
 * //   ]}
 * //   activeTabId={tab}
 * //   onChange={setTab}
 * //   variant="pills"
 * // />
 */
export type Tab = {
  id: string;
  label: string;
  count?: number;
  icon?: string;
  disabled?: boolean;
};

export type TabBarProps = {
  tabs: Tab[];
  activeTabId: string;
  onChange: (tabId: string) => void;
  size?: "compact" | "comfortable";
  variant?: "underline" | "pills";
  fullWidth?: boolean;
  className?: string;
};

type TabBarSize = NonNullable<TabBarProps["size"]>;
type TabBarVariant = NonNullable<TabBarProps["variant"]>;

const underlineSizeClasses: Record<TabBarSize, string> = {
  compact: "px-3 py-2 text-sm",
  comfortable: "px-4 py-3 text-base",
};

const pillsSizeClasses: Record<TabBarSize, string> = {
  compact: "px-3 py-1.5 text-sm",
  comfortable: "px-4 py-2 text-base",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getPanelId(tabId: string) {
  return `${tabId}-panel`;
}

function getFocusableTabs(tabs: Tab[]) {
  return tabs.filter((tab) => !tab.disabled);
}

function getNextFocusableTabId(
  tabs: Tab[],
  currentTabId: string,
  direction: "previous" | "next",
) {
  const focusableTabs = getFocusableTabs(tabs);

  if (focusableTabs.length === 0) {
    return null;
  }

  const currentIndex = focusableTabs.findIndex((tab) => tab.id === currentTabId);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const offset = direction === "next" ? 1 : -1;
  const nextIndex =
    (safeIndex + offset + focusableTabs.length) % focusableTabs.length;

  return focusableTabs[nextIndex].id;
}

export function TabBar({
  tabs,
  activeTabId,
  onChange,
  size = "comfortable",
  variant = "underline",
  fullWidth = false,
  className,
}: TabBarProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusableTabs = useMemo(() => getFocusableTabs(tabs), [tabs]);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const rovingTabId = activeTab && !activeTab.disabled
    ? activeTabId
    : focusableTabs[0]?.id;

  function focusTab(tabId: string | null) {
    if (!tabId) {
      return;
    }

    tabRefs.current[tabId]?.focus();
  }

  function activateTab(tab: Tab) {
    if (tab.disabled || tab.id === activeTabId) {
      return;
    }

    onChange(tab.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: Tab) {
    if (tab.disabled) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusTab(getNextFocusableTabId(tabs, tab.id, "previous"));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusTab(getNextFocusableTabId(tabs, tab.id, "next"));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(focusableTabs[0]?.id ?? null);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(focusableTabs[focusableTabs.length - 1]?.id ?? null);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateTab(tab);
    }
  }

  return (
    <div
      className={cx(
        "w-full overflow-x-auto",
        variant === "underline" && "border-b border-gray-800",
        className,
      )}
      role="tablist"
    >
      <div
        className={cx(
          "flex min-w-max items-center",
          variant === "pills" ? "gap-2" : "gap-0",
          fullWidth && "min-w-full",
        )}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDisabled = Boolean(tab.disabled);

          return (
            <button
              aria-controls={getPanelId(tab.id)}
              aria-selected={isActive}
              className={cx(
                "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-gray-950",
                fullWidth && "flex-1",
                variant === "underline"
                  ? cx(
                      "border-b-2",
                      underlineSizeClasses[size],
                      isActive
                        ? "border-purple-500 text-white"
                        : "border-transparent text-gray-500 hover:text-gray-300",
                    )
                  : cx(
                      "rounded-full border transition-all",
                      pillsSizeClasses[size],
                      isActive
                        ? "border-purple-500/40 bg-purple-500/20 text-purple-300"
                        : "border-transparent bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200",
                    ),
                isDisabled &&
                  "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-gray-500",
              )}
              disabled={isDisabled}
              key={tab.id}
              onClick={() => activateTab(tab)}
              onKeyDown={(event) => handleKeyDown(event, tab)}
              ref={(element) => {
                tabRefs.current[tab.id] = element;
              }}
              role="tab"
              tabIndex={tab.id === rovingTabId ? 0 : -1}
              type="button"
            >
              {tab.icon ? <span aria-hidden="true">{tab.icon}</span> : null}
              <span>{tab.label}</span>
              {typeof tab.count === "number" ? (
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs leading-none",
                    isActive
                      ? "bg-purple-500/30 text-purple-200"
                      : "bg-gray-700 text-gray-300",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TabBar;
