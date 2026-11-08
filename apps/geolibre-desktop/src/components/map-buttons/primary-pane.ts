/** The primary map's pane: the first grid cell in a split layout, else the map area. */
export function findPrimaryPane(): HTMLElement | null {
  const grid = document.querySelector<HTMLElement>('[data-testid="map-grid"]');
  const cell = grid?.firstElementChild;
  if (cell instanceof HTMLElement) return cell;
  return document.querySelector<HTMLElement>("[data-map-column] > main");
}
