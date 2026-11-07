/**
 * SWIFTMAP (Change 24): lets the Add Data dialog hand files to the map's own
 * drop pipeline, so Upload and dropping a file on the map behave identically
 * (the same loaders, plugin file handlers, messages and errors).
 *
 * DesktopShell owns the pipeline (`useFileDrop`) and registers it here; the
 * dialog, drawn by TopToolbar, calls {@link importFiles}.
 */

type FileImporter = (files: File[]) => Promise<void>;

let importer: FileImporter | null = null;

/**
 * Register the function that imports files, replacing any earlier one.
 *
 * @returns A function that unregisters it.
 */
export function registerFileImporter(next: FileImporter): () => void {
  importer = next;
  return () => {
    if (importer === next) importer = null;
  };
}

/** Whether a file importer is registered (the map shell is mounted). */
export function canImportFiles(): boolean {
  return importer !== null;
}

/**
 * Import files through the registered pipeline.
 *
 * @throws When no pipeline is registered.
 */
export async function importFiles(files: File[]): Promise<void> {
  if (!importer) throw new Error("The map isn't ready to import files yet.");
  await importer(files);
}

/**
 * Wrap files as the drop event `useFileDrop`'s handler expects: a real
 * `DataTransfer` holding the files, and a no-op `preventDefault`.
 */
export function fileDropEvent<T>(files: File[]): T {
  const dataTransfer = new DataTransfer();
  for (const file of files) dataTransfer.items.add(file);
  return { dataTransfer, preventDefault: () => {} } as unknown as T;
}
