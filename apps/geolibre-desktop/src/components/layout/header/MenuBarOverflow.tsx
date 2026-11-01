import { cn } from "@geolibre/ui";
import { Ellipsis } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { handleMenubarKeyDown } from "../toolbar/menubarKeyboard";
import { HeaderIconButton } from "./HeaderIconButton";

interface MenuBarOverflowProps {
  /** GeoLibre's old menu bar row: its menus, unchanged. */
  children: ReactNode;
}

/**
 * SWIFTMAP: temporary overflow for GeoLibre's old menu bar (Change 15, removed
 * in branch 3b). A ⋯ button shows a panel under it holding the old menus as one
 * row, so the live demo loses no commands while the new header has none.
 *
 * The panel stays mounted and is only hidden when closed. Some menus own their
 * dialogs (Settings, Controls), which a popover that unmounts on close would
 * close too. Arrow keys still move between the menus (#3232), through the old
 * row's own handler.
 */
export function MenuBarOverflow({ children }: MenuBarOverflowProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Set by React's capture phase for any pointerdown inside the panel's React
  // tree, including menus portalled out of it, so the document listener below
  // can tell those apart from real outside clicks.
  const insideRef = useRef(false);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const inside = insideRef.current;
      insideRef.current = false;
      if (inside) return;
      if (buttonRef.current?.contains(event.target as Node)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const anyMenuOpen = () =>
    panelRef.current?.querySelector('[aria-haspopup="menu"][aria-expanded="true"]') != null;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleMenubarKeyDown(event);
    // An open menu handles its own Escape first (and marks it handled).
    if (event.key === "Escape" && !event.defaultPrevented && !anyMenuOpen()) {
      event.preventDefault();
      close(true);
    }
  };

  // Choosing a command closes the overflow once its menu has closed. A submenu
  // trigger, or an item that keeps its menu open, leaves it as it is.
  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const item = (event.target as HTMLElement).closest('[role^="menuitem"]');
    if (!item || item.getAttribute("aria-haspopup")) return;
    window.setTimeout(() => {
      if (!anyMenuOpen()) close(false);
    }, 0);
  };

  // No positioning wrapper: the panel anchors to the header (which is
  // `relative`) and sits under its start, where GeoLibre's menu bar was, so
  // the menus and their submenus open where they used to. Anchored under the
  // ⋯ instead, nested submenus flipped back over their parent menu.
  return (
    <>
      <HeaderIconButton
        ref={buttonRef}
        label={t("header.moreMenus")}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(open && "bg-muted")}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis aria-hidden />
      </HeaderIconButton>
      {/* The row's key handler only routes arrow keys and Escape between the menu buttons inside. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={panelRef}
        id={panelId}
        data-testid="menu-bar-overflow"
        hidden={!open}
        onPointerDownCapture={() => {
          insideRef.current = true;
        }}
        onKeyDown={onKeyDown}
        onClick={onClick}
        className="absolute start-3 top-full z-50 mt-1 flex max-w-[calc(100%-1.5rem)] flex-nowrap sm:start-5 sm:max-w-[calc(100%-2.5rem)] items-center gap-1 overflow-x-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md [&[hidden]]:hidden"
      >
        {children}
      </div>
    </>
  );
}
