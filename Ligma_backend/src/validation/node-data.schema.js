import { z } from "zod";

// Single source of truth for canvas node payloads, shared by REST create
// (full schema per type), REST update and socket patches (partial).
//
// Key inventory — every `data` key the frontend writes (CanvasPage.jsx
// DEFAULT_NODE_DATA / buildPresetData / inspector, components/canvas/nodes/*,
// ToolStylePanel). Run `node tools/sampleCanvasNodeKeys.js` (read-only)
// against a database to confirm no stored key is missing before deploying.
//   sticky:    text, color (token e.g. "yellow"), fill, textColor, width, height
//   text:      text, fontSize, color, width, height
//   rectangle: width, height, fill, stroke, strokeWidth, cornerRadius, opacity, label
//   diamond:   width, height, fill, stroke, strokeWidth, opacity, label
//   triangle:  width, height, fill, stroke, strokeWidth, opacity, label
//   circle:    radius, fill, stroke, strokeWidth, opacity, label
//   arrow:     dx, dy, color, label
//   line:      dx, dy, color, label
// `rotation` is accepted on every type (canvas:rotate relay).

const NODE_TYPES = ["sticky", "text", "rectangle", "circle", "arrow", "diamond", "triangle", "line"];

const LIMITS = {
  coordinate: 1e6,
  minSize: 1,
  maxSize: 20000,
  rotation: 360,
  minFontSize: 6,
  maxFontSize: 400,
  maxText: 10000,
  maxStrokeWidth: 100,
  maxDataBytes: 32 * 1024,
};

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = String.raw`\s*-?\d+(?:\.\d+)?%?\s*`;
const RGB_COLOR = new RegExp(String.raw`^rgba?\(${NUM},${NUM},${NUM}(?:,${NUM})?\)$`, "i");
const HSL_COLOR = new RegExp(String.raw`^hsla?\(${NUM},${NUM},${NUM}(?:,${NUM})?\)$`, "i");
const NAMED_COLOR = /^[a-z][a-z-]{0,29}$/i; // "transparent", "yellow", palette tokens

const color = z
  .string()
  .max(64)
  .refine((value) => HEX_COLOR.test(value) || RGB_COLOR.test(value) || HSL_COLOR.test(value) || NAMED_COLOR.test(value), {
    message: "Invalid color",
  });

const finite = () => z.number().finite();
const coordinate = finite().min(-LIMITS.coordinate).max(LIMITS.coordinate);
const size = finite().min(LIMITS.minSize).max(LIMITS.maxSize);
const offset = finite().min(-LIMITS.coordinate).max(LIMITS.coordinate);
const text = z.string().max(LIMITS.maxText);
const rotation = finite().min(-LIMITS.rotation).max(LIMITS.rotation);

const common = { rotation: rotation.optional() };

const shapeKeys = {
  width: size.optional(),
  height: size.optional(),
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: finite().min(0).max(LIMITS.maxStrokeWidth).optional(),
  opacity: finite().min(0).max(1).optional(),
  label: text.optional(),
  ...common,
};

const linkKeys = {
  dx: offset.optional(),
  dy: offset.optional(),
  color: color.optional(),
  label: text.optional(),
  strokeWidth: finite().min(0).max(LIMITS.maxStrokeWidth).optional(),
  opacity: finite().min(0).max(1).optional(),
  ...common,
};

const NODE_DATA_SHAPES = {
  sticky: {
    text: text.optional(),
    color: color.optional(),
    fill: color.optional(),
    textColor: color.optional(),
    width: size.optional(),
    height: size.optional(),
    ...common,
  },
  text: {
    text: text.optional(),
    fontSize: finite().min(LIMITS.minFontSize).max(LIMITS.maxFontSize).optional(),
    color: color.optional(),
    width: size.optional(),
    height: size.optional(),
    ...common,
  },
  rectangle: { ...shapeKeys, cornerRadius: finite().min(0).max(LIMITS.maxSize).optional() },
  diamond: shapeKeys,
  triangle: shapeKeys,
  circle: {
    radius: size.optional(),
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: finite().min(0).max(LIMITS.maxStrokeWidth).optional(),
    opacity: finite().min(0).max(1).optional(),
    label: text.optional(),
    ...common,
  },
  arrow: linkKeys,
  line: linkKeys,
};

const withSizeCap = (schema) =>
  schema.superRefine((value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value ?? {}), "utf8") > LIMITS.maxDataBytes) {
      ctx.addIssue({ code: "custom", message: `Node data must be ${LIMITS.maxDataBytes / 1024}KB or less` });
    }
  });

// Every key is optional, so "full" and "partial" differ only in intent;
// both are strict: unknown keys are rejected.
const nodeDataSchemaFor = (type) => withSizeCap(z.object(NODE_DATA_SHAPES[type]).strict());
const nodeDataPatchSchemaFor = (type) => withSizeCap(z.object(NODE_DATA_SHAPES[type]).strict().partial());

const nodeDataSchemas = Object.fromEntries(NODE_TYPES.map((type) => [type, nodeDataSchemaFor(type)]));
const nodeDataPatchSchemas = Object.fromEntries(NODE_TYPES.map((type) => [type, nodeDataPatchSchemaFor(type)]));

// Type-agnostic patch (REST update, where the type is only known after the
// node is loaded): any key valid for at least one type. The service then
// re-validates against the node's real type.
const ANY_NODE_DATA_SHAPE = Object.assign({}, ...Object.values(NODE_DATA_SHAPES));
const anyNodeDataPatchSchema = withSizeCap(z.object(ANY_NODE_DATA_SHAPE).strict().partial());

const parentNodeId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid parent node id").nullable().optional();

// Discriminated union for create: data is checked against the declared type.
const createNodeBodySchema = z.discriminatedUnion(
  "type",
  NODE_TYPES.map((type) =>
    z
      .object({
        type: z.literal(type),
        x: coordinate,
        y: coordinate,
        data: nodeDataSchemas[type].optional().default({}),
        parentNodeId,
      })
      .strict(),
  ),
);

const point = z.object({ x: coordinate, y: coordinate }).strict();

// Live creation preview (canvas:draft): rectangle-style tools send
// { tool, start, current }, the arrow tool { type: "arrow", start, end }.
const draftSchema = z
  .object({
    tool: z.enum(NODE_TYPES).optional(),
    type: z.enum(NODE_TYPES).optional(),
    start: point,
    current: point.optional(),
    end: point.optional(),
  })
  .strict()
  .nullable();

const socketSchemas = {
  cursor: z.object({ workspaceId: z.string(), x: coordinate, y: coordinate }).strict(),
  drag: z.object({ workspaceId: z.string(), nodeId: z.string(), x: coordinate, y: coordinate }).strict(),
  text: z.object({ workspaceId: z.string(), nodeId: z.string(), value: text }).strict(),
  rotate: z.object({ workspaceId: z.string(), nodeId: z.string(), rotation }).strict(),
  draft: z.object({ workspaceId: z.string(), draft: draftSchema }).strict(),
};

export {
  NODE_TYPES,
  LIMITS,
  color,
  coordinate,
  nodeDataSchemas,
  nodeDataPatchSchemas,
  nodeDataSchemaFor,
  nodeDataPatchSchemaFor,
  anyNodeDataPatchSchema,
  createNodeBodySchema,
  draftSchema,
  socketSchemas,
};
