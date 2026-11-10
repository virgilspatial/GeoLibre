import { Button, cn } from "@geolibre/ui";
import { Bug, CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  dismissNotification,
  setNotificationsPaused,
  useNotificationStore,
  type AppNotification,
  type NotificationKind,
} from "../../lib/notify";
import { reportIssue } from "../../lib/report-issue";
import { useNotificationAnchor } from "./notification-anchor";

const KIND_ICON: Record<NotificationKind, typeof Info> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
};

// SWIFTMAP (Change 41): success and info icons in the text colour; warning
// and error keep amber and red, on the icon only. No coloured side bar.
const KIND_ICON_CLASS: Record<NotificationKind, string> = {
  success: "text-foreground",
  info: "text-foreground",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-destructive dark:text-red-400",
};

/**
 * SWIFTMAP (Change 41): a message as a card like shadcn's Alert: icon, a
 * medium-weight title, an optional muted line, and its action as a small
 * outlined button on the title row (an action and Report issue together get a
 * row of their own). The × fades in on hover or focus, and always shows on a
 * message that stays until it is closed.
 */
function NotificationToast({ notification }: { notification: AppNotification }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[notification.kind];
  const close = () => dismissNotification(notification.id);
  const staysOpen = notification.durationMs === null;
  const buttons = [
    notification.action ? (
      <Button
        key="action"
        type="button"
        variant="outline"
        size="xs"
        className="bg-transparent"
        onClick={() => {
          notification.action?.onClick();
          close();
        }}
      >
        {notification.action.label}
      </Button>
    ) : null,
    notification.diagnostic ? (
      <Button
        key="report"
        type="button"
        variant="outline"
        size="xs"
        className="bg-transparent"
        onClick={() => reportIssue(notification.diagnostic ?? null)}
      >
        <Bug aria-hidden="true" />
        {t("notifications.reportIssue")}
      </Button>
    ) : null,
  ].filter(Boolean);
  const buttonsOwnRow = buttons.length > 1;
  return (
    <div
      data-testid="notification"
      data-kind={notification.kind}
      data-notification-id={notification.id}
      className={cn(
        "group/toast pointer-events-auto flex w-full items-start gap-2.5 rounded-[8px] border border-border bg-popover px-3 py-2.5 text-[13px] text-popover-foreground shadow-md dark:bg-row-hover",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("mt-0.5 h-4 w-4 shrink-0", KIND_ICON_CLASS[notification.kind])}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 break-words py-0.5 font-medium leading-5">
            {notification.message}
            {notification.count > 1 ? (
              <span className="ms-1.5 rounded bg-muted px-1 py-0.5 text-xs font-normal text-muted-foreground">
                {t("notifications.repeated", { count: notification.count })}
              </span>
            ) : null}
          </p>
          {!buttonsOwnRow && buttons.length > 0 ? (
            <div className="flex shrink-0 items-center pt-0.5">{buttons}</div>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-testid="notification-dismiss"
            data-always-visible={staysOpen ? "" : undefined}
            aria-label={t("notifications.dismiss")}
            title={t("notifications.dismiss")}
            className={cn(
              "-me-1 mt-0.5 shrink-0 text-muted-foreground hover:text-foreground",
              !staysOpen &&
                "opacity-0 transition-opacity focus-visible:opacity-100 group-hover/toast:opacity-100 group-focus-within/toast:opacity-100 [@media(hover:none)]:opacity-100",
            )}
            onClick={close}
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
        {notification.description ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {notification.description}
          </p>
        ) : null}
        {buttonsOwnRow ? (
          <div data-testid="notification-buttons" className="mt-2 flex flex-wrap justify-end gap-2">
            {buttons}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The app's toast region, mounted once at the root. Errors render in an
 * assertive live region and stay until dismissed; everything else is polite and
 * auto-dismisses. Both regions are always in the DOM, because a live region
 * inserted together with its first message is often not announced.
 */
export function NotificationRegion() {
  const { t } = useTranslation();
  const notifications = useNotificationStore((state) => state.notifications);
  const regionRef = useRef<HTMLElement>(null);
  const hoveredRef = useRef(false);
  const anchor = useNotificationAnchor(notifications.length > 0, regionRef);
  const errors = notifications.filter((item) => item.kind === "error");
  const others = notifications.filter((item) => item.kind !== "error");

  // Timers pause while the pointer is over the region or focus is inside it.
  // Re-derived after every change too: a dismissed toast that held focus is
  // removed without a reliable blur, which must not leave timers frozen.
  const syncPaused = () => {
    const region = regionRef.current;
    const focusInside =
      region !== null && typeof document !== "undefined" && region.contains(document.activeElement);
    setNotificationsPaused(hoveredRef.current || focusInside);
  };
  useEffect(() => {
    if (notifications.length === 0) hoveredRef.current = false;
    syncPaused();
  });
  useEffect(() => () => setNotificationsPaused(false), []);

  return (
    <section
      ref={regionRef}
      aria-label={t("notifications.regionLabel")}
      data-testid="notification-region"
      // SWIFTMAP (Change 41): the lowest card covers the attribution (i), measured;
      // GeoLibre's fixed corner when there is no map to anchor to.
      style={anchor ?? undefined}
      className={cn(
        "pointer-events-none fixed z-[60] flex flex-col gap-2",
        !anchor && "bottom-10 end-4 w-[min(24rem,calc(100vw-2rem))]",
      )}
      onMouseEnter={() => {
        hoveredRef.current = true;
        syncPaused();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        syncPaused();
      }}
      onFocus={syncPaused}
      // Escape dismisses the toast that holds keyboard focus.
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "Escape" || !(event.target instanceof Element)) return;
        const id = event.target
          .closest<HTMLElement>("[data-notification-id]")
          ?.getAttribute("data-notification-id");
        if (!id) return;
        event.stopPropagation();
        dismissNotification(id);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        setNotificationsPaused(hoveredRef.current || event.currentTarget.contains(next));
      }}
    >
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2 empty:hidden">
        {errors.map((notification) => (
          // Keyed on the revision so a repeat remounts and is announced again.
          <NotificationToast
            key={`${notification.id}:${notification.revision}`}
            notification={notification}
          />
        ))}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {others.map((notification) => (
          <NotificationToast
            key={`${notification.id}:${notification.revision}`}
            notification={notification}
          />
        ))}
      </div>
    </section>
  );
}
