import {
  changeMemberRole,
  listPendingInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
} from "../services/member.service.js";
import { sendSuccess } from "../utils/api-response.util.js";
import { emitWorkspaceEvent, notifyRoleChanged, revokeWorkspaceAccess } from "../socket/socket.service.js";
import { findNodeById, sanitizeCanvasNode } from "../models/canvas-node.model.js";
import { findTaskById, sanitizeTask } from "../models/task.model.js";
const listMembersHandler = async (req, res, next) => {
  try {
    const members = await listWorkspaceMembers(req.params.workspaceId, req.user.id);
    return sendSuccess(res, 200, "Members retrieved successfully", { members });
  } catch (error) {
    return next(error);
  }
};

const changeMemberRoleHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.params;
    const member = await changeMemberRole(workspaceId, userId, req.body.role, req.user.id);

    emitWorkspaceEvent(workspaceId, "member:role-updated", {
      workspaceId,
      member,
      actorId: req.user.id,
    });
    // Push the new role to every live session of that user so their UI
    // (useWorkspaceRole) updates without a reload. Server-side checks read
    // the role from the database on every mutating event.
    notifyRoleChanged(workspaceId, userId, member.role);

    return sendSuccess(res, 200, "Member role updated successfully", { member });
  } catch (error) {
    return next(error);
  }
};

const removeMemberHandler = async (req, res, next) => {
  try {
    const { workspaceId, userId } = req.params;
    const { nodeIds, taskIds } = await removeWorkspaceMember(workspaceId, userId, req.user.id);

    // Kick first, so the removed user doesn't receive the broadcasts below.
    await revokeWorkspaceAccess(workspaceId, userId);

    emitWorkspaceEvent(workspaceId, "member:removed", {
      workspaceId,
      userId,
      actorId: req.user.id,
    });

    for (const nodeId of nodeIds) {
      const node = sanitizeCanvasNode(await findNodeById(nodeId));
      if (node) {
        emitWorkspaceEvent(workspaceId, "canvas:node-permissions-updated", { workspaceId, node, actorId: req.user.id });
      }
    }
    for (const taskId of taskIds) {
      const task = sanitizeTask(await findTaskById(taskId));
      if (task) emitWorkspaceEvent(workspaceId, "tasks:updated", task);
    }

    return sendSuccess(res, 200, "Member removed successfully");
  } catch (error) {
    return next(error);
  }
};

const listPendingInvitationsHandler = async (req, res, next) => {
  try {
    const invitations = await listPendingInvitations(req.params.workspaceId, req.user.id);
    return sendSuccess(res, 200, "Pending invitations retrieved successfully", { invitations });
  } catch (error) {
    return next(error);
  }
};

export {
  listMembersHandler,
  changeMemberRoleHandler,
  removeMemberHandler,
  listPendingInvitationsHandler,
};

export default {
  listMembersHandler,
  changeMemberRoleHandler,
  removeMemberHandler,
  listPendingInvitationsHandler,
};
