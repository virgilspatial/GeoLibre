import { act, fireEvent, render, screen, within } from "./helpers/dom";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createElement } from "react";

// SWIFTMAP: the notifications restyle (Change 41).
const { NotificationRegion } = await import(
  "../apps/geolibre-desktop/src/components/layout/NotificationRegion"
);
const { clearNotifications, notify } = await import("../apps/geolibre-desktop/src/lib/notify");
const { notificationAnchor, NOTIFICATION_MAX_WIDTH_PX } = await import(
  "../apps/geolibre-desktop/src/components/layout/notification-anchor"
);

afterEach(() => clearNotifications());

const viewport = { width: 1280, height: 800 };
const map = { left: 364, top: 56, right: 1280, bottom: 772 };

describe("notificationAnchor", () => {
  // The collapsed attribution (i): 24px, 10px in from the map's bottom right.
  const info = { left: 1246, top: 738, right: 1270, bottom: 762 };

  it("puts the lowest card's bottom-right corner on the attribution's, covering the (i)", () => {
    assert.deepEqual(notificationAnchor({ map, attribution: info, cardHeight: 46, viewport }), {
      right: 1280 - 1270,
      bottom: 800 - 762,
      width: NOTIFICATION_MAX_WIDTH_PX,
    });
    // Before the card has rendered, the (i) is still assumed to fit.
    assert.equal(notificationAnchor({ map, attribution: info, cardHeight: null, viewport }).bottom, 38);
  });

  it("covers an expanded attribution that fits inside the card", () => {
    const expanded = { left: 1071, top: 738, right: 1270, bottom: 762 };
    const anchor = notificationAnchor({ map, attribution: expanded, cardHeight: 46, viewport });
    assert.equal(anchor.bottom, 800 - 762);
    assert.equal(anchor.right, 10);
  });

  it("sits 8px above an expanded attribution that doesn't fit, never covering part of it", () => {
    // Taller than the card (it wrapped onto three lines).
    const tall = { left: 1071, top: 690, right: 1270, bottom: 762 };
    assert.equal(notificationAnchor({ map, attribution: tall, cardHeight: 46, viewport }).bottom, 800 - 682);
    // Wider than the card (a narrow map).
    const narrowMap = { ...map, left: 1000 };
    const wide = { left: 1010, top: 738, right: 1270, bottom: 762 };
    const anchor = notificationAnchor({ map: narrowMap, attribution: wide, cardHeight: 46, viewport });
    assert.equal(anchor.width, 280 - 10 - 16);
    assert.equal(anchor.bottom, 800 - 730);
  });

  it("follows the map when a panel narrows it", () => {
    const narrowed = { ...map, right: 950 };
    const moved = { left: 916, top: 738, right: 940, bottom: 762 };
    assert.equal(notificationAnchor({ map: narrowed, attribution: moved, cardHeight: 46, viewport }).right, 1280 - 940);
  });

  it("uses MapLibre's 10px corner with no attribution, on the left right to left", () => {
    assert.deepEqual(notificationAnchor({ map, attribution: null, cardHeight: 46, viewport }), {
      right: 10,
      bottom: 800 - 762,
      width: NOTIFICATION_MAX_WIDTH_PX,
    });
    const rtl = notificationAnchor({ map, attribution: null, cardHeight: 46, viewport, rtl: true });
    assert.equal(rtl.left, 364 + 10);
    assert.equal(rtl.right, undefined);
  });
});

describe("NotificationRegion", () => {
  const card = (kind: string) =>
    screen.getAllByTestId("notification").find((el) => el.dataset.kind === kind)!;

  it("draws each message as a bordered card with no coloured side bar", () => {
    render(createElement(NotificationRegion));
    act(() => {
      notify.success("Style saved.");
      notify.info("Removed “Roads”.", { action: { label: "Undo", onClick() {} } });
      notify.warning("Some features were skipped.", { description: "12 had no geometry." });
      notify.error("Couldn't load the layer.", { description: "The server returned 404." });
    });
    for (const kind of ["success", "info", "warning", "error"]) {
      const classes = card(kind).className;
      assert.match(classes, /\bborder\b/);
      assert.match(classes, /rounded-\[8px\]/);
      assert.doesNotMatch(classes, /border-s-4|border-s-(emerald|primary|amber|destructive)/);
    }
    // Success and info icons in the text colour; warning amber, error red.
    const iconClass = (kind: string) => card(kind).querySelector("svg")!.getAttribute("class") ?? "";
    assert.match(iconClass("success"), /text-foreground/);
    assert.match(iconClass("info"), /text-foreground/);
    assert.match(iconClass("warning"), /text-amber-600/);
    assert.match(iconClass("error"), /text-destructive/);
    // The description is a muted line under the title.
    assert.equal(within(card("warning")).getByText("12 had no geometry.").className.includes("text-muted-foreground"), true);
  });

  it("puts a single action on the title row and runs it", () => {
    let undone = 0;
    render(createElement(NotificationRegion));
    act(() => {
      notify.info("Removed “Roads”.", { action: { label: "Undo", onClick: () => undone++ } });
    });
    const undo = within(card("info")).getByRole("button", { name: "Undo" });
    const title = within(card("info")).getByText("Removed “Roads”.");
    assert.equal(undo.parentElement?.parentElement, title.parentElement, "same row as the title");
    assert.equal(within(card("info")).queryByTestId("notification-buttons"), null);
    fireEvent.click(undo);
    assert.equal(undone, 1);
    assert.equal(screen.queryAllByTestId("notification").length, 0);
  });

  it("gives an action and Report issue a row of their own", () => {
    render(createElement(NotificationRegion));
    act(() => {
      notify.error("Couldn't reach the server.", {
        error: new Error("offline"),
        action: { label: "Retry", onClick() {} },
      });
    });
    const row = within(card("error")).getByTestId("notification-buttons");
    assert.ok(within(row).getByRole("button", { name: "Retry" }));
    assert.ok(within(row).getByRole("button", { name: /Report issue/ }));
  });

  it("hides the × until hover or focus on messages that close themselves, never on errors", () => {
    render(createElement(NotificationRegion));
    act(() => {
      notify.success("Style saved.");
      notify.error("Couldn't load the layer.");
    });
    const dismiss = (kind: string) => within(card(kind)).getByTestId("notification-dismiss");
    assert.match(dismiss("success").className, /opacity-0/);
    assert.match(dismiss("success").className, /group-hover\/toast:opacity-100/);
    assert.match(dismiss("success").className, /group-focus-within\/toast:opacity-100/);
    assert.equal(dismiss("success").getAttribute("aria-label"), "Dismiss notification");
    assert.doesNotMatch(dismiss("error").className, /opacity-0/);
    assert.equal(dismiss("error").hasAttribute("data-always-visible"), true);
  });

  it("keeps the live regions, and Escape still dismisses the focused message", () => {
    render(createElement(NotificationRegion));
    act(() => {
      notify.success("Style saved.");
      notify.error("Couldn't load the layer.");
    });
    assert.ok(within(screen.getByRole("alert")).getByText("Couldn't load the layer."));
    assert.ok(within(screen.getByRole("status")).getByText("Style saved."));
    fireEvent.keyDown(within(card("success")).getByTestId("notification-dismiss"), { key: "Escape" });
    assert.equal(screen.queryByText("Style saved."), null);
  });

  it("falls back to GeoLibre's fixed corner with no map on the page", () => {
    render(createElement(NotificationRegion));
    act(() => {
      notify.success("Style saved.");
    });
    const region = screen.getByTestId("notification-region");
    assert.match(region.className, /bottom-10/);
    assert.equal(region.style.right, "");
  });
});
