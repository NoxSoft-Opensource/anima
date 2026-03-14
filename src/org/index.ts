/**
 * ANIMA 6 Organization System
 *
 * Nox Organizations built into Anima — creatable, editable,
 * with agent and human roles, hierarchy visualization, and
 * self-organizing specialization.
 */

export {
  type NoxOrganization,
  type OrgSettings,
  type MemberKind,
  type OrgRole,
  type OrgMember,
  type MemberStatus,
  type MemberPermissions,
  type SpecializationProfile,
  type OrgHierarchyNode,
  DEFAULT_ROLE_PERMISSIONS,
  BUILT_IN_SPECIALIZATIONS,
} from "./types.js";

export {
  createOrganization,
  getOrganization,
  updateOrganization,
  deleteOrganization,
  listOrganizations,
  addMember,
  removeMember,
  updateMember,
  getMembers,
  getMember,
  buildHierarchy,
  visualizeHierarchy,
} from "./store.js";
