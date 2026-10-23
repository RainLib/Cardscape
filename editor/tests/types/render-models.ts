import spatial from '../../renderer/rendering/spatial-model';
import space from '../../renderer/rendering/space-model';
import frame from '../../renderer/editing/frame-model';
import raster from '../../renderer/editing/frame-raster';
import stats from '../../renderer/editing/card-stats';
import graph from '../../renderer/shaders/shader-graph-model';
import type { CardLayer } from '../../shared/document';
import type {
  AttachmentAnchor,
  FrameStyle,
  ShaderGraph,
  SpaceDocument,
  Vec2,
} from '../../shared/render-models';
function contracts(
  doc: SpaceDocument,
  layer: CardLayer,
  context: CanvasRenderingContext2D,
) {
  const style: FrameStyle = frame.resolve(doc);
  const contour: Vec2[] = frame.contour(style);
  frame.path(context, contour);
  const image = raster.raster(style);
  if (image) context.drawImage(image.canvas, image.bounds.x, image.bounds.y);
  const camera = space.camera(space.preferences({ yaw: 35 }), 800, 600);
  const pixel: Vec2 = space.project([0, 0, 0], camera);
  const point = space.onPlane(pixel, 0.1, camera);
  if (point) point[2].toFixed(2);
  const scene = space.scene(doc);
  if (scene[0]) scene[0].placement.scale.toFixed(2);
  const anchor: AttachmentAnchor = {
    edge: 'segment',
    root: [0, 0],
    tip: [100, 100],
  };
  spatial.attachmentWeights([0, 0, 1, 1], null, null, 64, anchor);
  const shader: ShaderGraph = graph.preset('geometry', 'wave');
  const node = graph.validate(shader).get(1);
  if (node) {
    node.pos[0].toFixed(2);
    // @ts-expect-error Unused node properties are opaque until the caller checks them.
    const value: number = node.properties?.value;
    void value;
  }
  stats.apply(doc, { cost: 3, power: -2, visible: true });
  // @ts-expect-error Frame geometry consumes numeric dimensions.
  style.width = '24';
  // @ts-expect-error Camera projection produces numeric pixel coordinates.
  pixel[0] = '10';
  const invalidAnchor: AttachmentAnchor = {
    edge: 'segment',
    // @ts-expect-error Segment anchors require two numeric coordinate pairs.
    root: [0],
    tip: [1, 2],
  };
  spatial.attachmentWeights(
    [0, 0],
    // @ts-expect-error Particle mask data cannot contain text.
    { width: 1, height: 1, data: ['1'] },
    null,
    64,
    anchor,
  );
  // @ts-expect-error Shader presets have exactly two supported stages.
  graph.preset('surface');
  // @ts-expect-error Shader links record numeric node and slot IDs.
  shader.links.push([1, 'node', 0, 2, 0, 'vec3']);
  // @ts-expect-error Badge edits use numeric values.
  stats.apply(doc, { cost: '3' });
  // @ts-expect-error Frame rasterization uses an actual Canvas 2D drawing context.
  raster.draw({}, style);
  // @ts-expect-error Spatial depth edits cannot store a string.
  spatial.set(doc, layer, { z: '.1' });
  void invalidAnchor;
}
void contracts;
