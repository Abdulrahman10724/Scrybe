import { z } from "zod";

import { anyNodeDataPatchSchema, coordinate, createNodeBodySchema } from "./node-data.schema.js";

const workspaceIdParam = z.string().regex(/^[a-f0-9]{24}$/i, "Workspace ID is invalid");
const nodeIdParam = z.string().regex(/^[a-f0-9]{24}$/i, "Node ID is invalid");

const listNodesSchema = z.object({
  params: z.object({
    workspaceId: workspaceIdParam,
  }),
});

// Body schemas live in node-data.schema.js (shared with the socket layer).
const createNodeSchema = z.object({
  params: z.object({
    workspaceId: workspaceIdParam,
  }),
  body: createNodeBodySchema,
});

const updateNodeSchema = z.object({
  params: z.object({
    workspaceId: workspaceIdParam,
    nodeId: nodeIdParam,
  }),
  body: z
    .object({
      x: coordinate.optional(),
      y: coordinate.optional(),
      // Validated again against the node's actual type in the service.
      data: anyNodeDataPatchSchema.optional(),
      parentNodeId: z.string().regex(/^[a-f0-9]{24}$/i, "Invalid parent node id").nullable().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, {
      message: "At least one field must be provided for update",
    }),
});

const updateNodePermissionsSchema = z.object({
  params: z.object({
    workspaceId: workspaceIdParam,
    nodeId: nodeIdParam,
  }),
  body: z.object({
    allowedUserIds: z
      .array(z.string().regex(/^[a-f0-9]{24}$/i, "Invalid member id"))
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "allowedUserIds must not contain duplicates",
      }),
    // Note: empty array [] is intentionally valid here — it means "unrestricted".
  }),
});

  const lockNodeSchema = z.object({
    params: z.object({
      workspaceId: workspaceIdParam,
      nodeId: nodeIdParam,
    }),
  });

const deleteNodeSchema = z.object({
  params: z.object({
    workspaceId: workspaceIdParam,
    nodeId: nodeIdParam,
  }),
});

  export { listNodesSchema, createNodeSchema, updateNodeSchema, updateNodePermissionsSchema, lockNodeSchema, deleteNodeSchema };

  export default { listNodesSchema, createNodeSchema, updateNodeSchema, updateNodePermissionsSchema, lockNodeSchema, deleteNodeSchema };
