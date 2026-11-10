import { cn } from "@geolibre/ui";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useSidePanelStore, type SidePanelId } from "./sidePanelStore";

export const SIDE_PANEL_DEFAULT_WIDTH = 300;
const MIN_WIDTH = 260;
const MAX_WIDTH = 480;
const KEY_STEP = 10;
const HINT_DELAY_MS = 400;

const clampWidth = (width: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));

interface SidePanelProps {
  /**
   * The Layers panel. Stays mounted while another panel (or none) is shown, so
   * it keeps its own state; it hides itself when told it is collapsed.
   */
  layers: ReactNode;
  /** The Legend panel (Change 25), shown while Legend is the active panel. */
  legend?: ReactNode;
  /**
   * The Analysis panel (Change 37), shown while Analysis is the active panel.
   * Null for viewers, who see "Coming in a later update." until branch 8.
   */
  analysis?: ReactNode;
  /** Start closed (GeoLibre's "panels collapsed" layouts). */
  startClosed?: boolean;
  /**
   * Close while true (a story map presenting), and reopen what was shown when it
   * turns false again.
   */
  autoClose?: boolean;
}

/**
 * SWIFTMAP: the side panel beside the rail (Change 16). 300px by default, dragged
 * between 260 and 480px from its end edge, reset by a double-click. The width is
 * never saved: every load starts at the default.
 *
 * Its width reaches the Layers panel through `--layer-panel-width`, the variable
 * GeoLibre's `LayerPanel` already sizes itself by. On a phone the Layers panel
 * overlays the map from just below the rail row, anchored to this container.
 */
export function SidePanel({
  layers,
  legend = null,
  analysis = null,
  startClosed = false,
  autoClose = false,
}: SidePanelProps) {
  const { t } = useTranslation();
  const active = useSidePanelStore((state) => state.active);
  const [width, setWidth] = useState(SIDE_PANEL_DEFAULT_WIDTH);

  useEffect(() => {
    if (startClosed) useSidePanelStore.getState().close();
  }, [startClosed]);

  const shownBeforeAutoClose = useRef<SidePanelId | null>(null);
  useEffect(() => {
    const store = useSidePanelStore.getState();
    if (autoClose) {
      shownBeforeAutoClose.current = store.active;
      store.close();
    } else if (shownBeforeAutoClose.current) {
      store.open(shownBeforeAutoClose.current);
      shownBeforeAutoClose.current = null;
    }
  }, [autoClose]);

  const style = { "--layer-panel-width": `${width}px` } as CSSProperties;

  return (
    <div
      data-testid="side-panel"
      data-panel={active ?? undefined}
      hidden={active === null}
      style={style}
      className="relative z-20 flex min-h-0 shrink-0 flex-col md:flex-row [&[hidden]]:hidden"
    >
      {layers}
      {active === "legend" ? legend : null}
      {active === "analysis" ? analysis : null}
      {active === "analysis" && !analysis ? (
        <section
          aria-labelledby="side-panel-title"
          className="flex w-full flex-col border-b bg-background px-3 py-3.5 md:h-full md:w-[var(--layer-panel-width)] md:border-e md:border-b-0"
        >
          <h2 id="side-panel-title" className="ps-1.5 pb-2 text-sm font-semibold">
            {t("rail.analysis")}
          </h2>
          <p className="ps-1.5 text-sm text-muted-foreground">{t("rail.comingLater")}</p>
        </section>
      ) : null}
      {active !== null ? <ResizeEdge width={width} onWidthChange={setWidth} /> : null}
    </div>
  );
}

interface ResizeEdgeProps {
  width: number;
  onWidthChange: (width: number) => void;
}

/**
 * The 8px drag edge over the panel's end border. A thin line shows on hover (the
 * ring grey) and while dragging (the foreground). After 400ms of hovering, a hint
 * appears beside the pointer and follows it up and down.
 */
function ResizeEdge({ width, onWidthChange }: ResizeEdgeProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [hintY, setHintY] = useState<number | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const hintTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  const isRtl = () => document.documentElement.dir === "rtl";

  const hideHint = () => {
    window.clearTimeout(hintTimer.current);
    setHintShown(false);
    setHintY(null);
  };

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    setHintY(event.clientY - event.currentTarget.getBoundingClientRect().top);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHintShown(true), HINT_DELAY_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging || event.pointerType !== "mouse") return;
    setHintY(event.clientY - event.currentTarget.getBoundingClientRect().top);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Like GeoLibre's own panel edges: the drag is this edge's alone.
    event.preventDefault();
    event.stopPropagation();
    hideHint();
    const startX = event.clientX;
    const startWidth = width;
    const direction = isRtl() ? -1 : 1;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (moveEvent: PointerEvent) => {
      onWidthChange(clampWidth(startWidth + (moveEvent.clientX - startX) * direction));
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      setDragging(false);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const grow = isRtl() ? "ArrowLeft" : "ArrowRight";
    const shrink = isRtl() ? "ArrowRight" : "ArrowLeft";
    if (event.key === grow) onWidthChange(clampWidth(width + KEY_STEP));
    else if (event.key === shrink) onWidthChange(clampWidth(width - KEY_STEP));
    else if (event.key === "Enter" || event.key === "Home") onWidthChange(SIDE_PANEL_DEFAULT_WIDTH);
    else return;
    event.preventDefault();
  };

  return (
    <div className="absolute inset-y-0 -end-1 z-30 hidden w-2 md:block">
      {/* A focusable separator is the ARIA window-splitter pattern: arrow keys
          resize it, so it is interactive despite the non-interactive role. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("rail.resizePanel")}
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        data-testid="side-panel-resize"
        className="group absolute inset-0 cursor-col-resize touch-none select-none focus-visible:outline-none"
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerLeave={hideHint}
        onPointerDown={onPointerDown}
        onDoubleClick={() => onWidthChange(SIDE_PANEL_DEFAULT_WIDTH)}
        onKeyDown={onKeyDown}
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 inset-x-0 mx-auto w-0.5",
            dragging
              ? "bg-foreground"
              : "group-hover:bg-ring group-focus-visible:bg-ring group-focus-visible:w-[3px]",
          )}
        />
      </div>
      {hintShown && hintY !== null && !dragging ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute start-3 z-50 whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background"
          style={{ top: Math.max(8, hintY - 14) }}
        >
          <span
            aria-hidden
            className="absolute -start-1 top-2.5 size-2 rotate-45 rounded-[1px] bg-foreground"
          />
          {t("rail.resizeHint")}
        </div>
      ) : null}
    </div>
  );
}
