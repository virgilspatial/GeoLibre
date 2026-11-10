// SWIFTMAP (Change 37): the parts of `@turf/jsts` (a UMD build with no types)
// that the analysis engine uses. Declared by the desktop app at the version
// GeoLibre already installs for `@turf/buffer`.
declare module "@turf/jsts" {
  import type { Geometry } from "geojson";

  interface JstsGeometry {
    getGeometryType(): string;
    isEmpty(): boolean;
    getArea(): number;
  }

  interface Jsts {
    GeoJSONReader: new () => { read(geometry: Geometry): JstsGeometry };
    GeoJSONWriter: new () => { write(geometry: JstsGeometry): Geometry };
    BufferOp: {
      bufferOp(geometry: JstsGeometry, distance: number, quadrantSegments: number): JstsGeometry;
    };
  }

  const jsts: Jsts;
  export default jsts;
}
