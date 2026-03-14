import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

// Mock resolveStateDir to use a temp directory
let tmpDir: string;

vi.mock("../config/paths.js", () => ({
  resolveStateDir: () => tmpDir,
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  }),
}));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anima-org-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("org store", () => {
  describe("organization CRUD", () => {
    it("creates an organization with owner", () => {
      const org = createOrganization(
        "NoxSoft",
        "Building the empire",
        "sylys-device-id",
        "Sylys",
        "human",
      );

      expect(org.name).toBe("NoxSoft");
      expect(org.description).toBe("Building the empire");
      expect(org.ownerId).toBe("sylys-device-id");
      expect(org.id).toBeTruthy();
    });

    it("retrieves a created organization", () => {
      const org = createOrganization(
        "NoxSoft",
        "Building the empire",
        "sylys-device-id",
        "Sylys",
        "human",
      );

      const retrieved = getOrganization(org.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("NoxSoft");
    });

    it("updates organization fields", () => {
      const org = createOrganization("Test", "desc", "owner", "Owner", "human");
      const updated = updateOrganization(org.id, { name: "Updated" });
      expect(updated!.name).toBe("Updated");
    });

    it("deletes an organization", () => {
      const org = createOrganization("Test", "desc", "owner", "Owner", "human");
      expect(deleteOrganization(org.id)).toBe(true);
      expect(getOrganization(org.id)).toBeNull();
    });

    it("lists all organizations", () => {
      createOrganization("Org1", "desc1", "o1", "Owner1", "human");
      createOrganization("Org2", "desc2", "o2", "Owner2", "agent");
      const orgs = listOrganizations();
      expect(orgs).toHaveLength(2);
    });

    it("applies default settings", () => {
      const org = createOrganization("Test", "desc", "o", "O", "human");
      expect(org.settings.maxAgents).toBe(50);
      expect(org.settings.backupIntervalMs).toBe(5 * 60 * 60 * 1000);
      expect(org.settings.autoSpecialization).toBe(true);
    });

    it("merges custom settings", () => {
      const org = createOrganization("Test", "desc", "o", "O", "human", {
        securityLevel: "paranoid",
        peerPort: 12345,
      });
      expect(org.settings.securityLevel).toBe("paranoid");
      expect(org.settings.peerPort).toBe(12345);
      expect(org.settings.maxAgents).toBe(50); // default preserved
    });
  });

  describe("member management", () => {
    it("org starts with owner as first member", () => {
      const org = createOrganization("Test", "desc", "o", "Sylys", "human");
      const members = getMembers(org.id);
      expect(members).toHaveLength(1);
      expect(members[0].displayName).toBe("Sylys");
      expect(members[0].role).toBe("owner");
    });

    it("adds a new member", () => {
      const org = createOrganization("Test", "desc", "o", "Sylys", "human");
      const member = addMember(org.id, {
        kind: "agent",
        displayName: "Axiom",
        deviceId: "axiom-device",
        role: "coordinator",
        description: "The Executioner",
        specializations: ["feature-dev", "infrastructure"],
        status: "active",
        reportsTo: undefined,
      });

      expect(member).not.toBeNull();
      expect(member!.displayName).toBe("Axiom");
      expect(member!.role).toBe("coordinator");
      expect(member!.permissions.canDelegateTasks).toBe(true);
      expect(member!.permissions.canManageMembers).toBe(false);
    });

    it("removes a member", () => {
      const org = createOrganization("Test", "desc", "o", "Owner", "human");
      const member = addMember(org.id, {
        kind: "agent",
        displayName: "Worker",
        role: "worker",
        description: "does work",
        specializations: [],
        status: "active",
      });

      expect(removeMember(org.id, member!.id)).toBe(true);
      expect(getMembers(org.id)).toHaveLength(1); // only owner remains
    });

    it("updates member fields", () => {
      const org = createOrganization("Test", "desc", "o", "Owner", "human");
      const member = addMember(org.id, {
        kind: "agent",
        displayName: "Worker",
        role: "worker",
        description: "basic worker",
        specializations: [],
        status: "idle",
      });

      const updated = updateMember(org.id, member!.id, {
        role: "coordinator",
        specializations: ["security"],
        status: "active",
      });

      expect(updated!.role).toBe("coordinator");
      expect(updated!.specializations).toEqual(["security"]);
      expect(updated!.status).toBe("active");
      // role change should grant coordinator permissions
      expect(updated!.permissions.canDelegateTasks).toBe(true);
    });
  });

  describe("hierarchy", () => {
    it("builds a tree from reportsTo relationships", () => {
      const org = createOrganization("Test", "desc", "o", "Sylys", "human");
      const members = getMembers(org.id);
      const sylysId = members[0].id;

      const axiom = addMember(org.id, {
        kind: "agent",
        displayName: "Axiom",
        role: "coordinator",
        description: "coordinator",
        specializations: [],
        status: "active",
        reportsTo: sylysId,
      });

      addMember(org.id, {
        kind: "agent",
        displayName: "Worker-1",
        role: "worker",
        description: "worker",
        specializations: ["security"],
        status: "active",
        reportsTo: axiom!.id,
      });

      addMember(org.id, {
        kind: "agent",
        displayName: "Worker-2",
        role: "worker",
        description: "worker",
        specializations: ["qa"],
        status: "idle",
        reportsTo: axiom!.id,
      });

      const hierarchy = buildHierarchy(org.id);
      expect(hierarchy).toHaveLength(1); // Sylys is root
      expect(hierarchy[0].displayName).toBe("Sylys");
      expect(hierarchy[0].children).toHaveLength(1); // Axiom
      expect(hierarchy[0].children[0].displayName).toBe("Axiom");
      expect(hierarchy[0].children[0].children).toHaveLength(2); // 2 workers
    });

    it("visualizes the hierarchy as ASCII", () => {
      const org = createOrganization("NoxSoft", "The Empire", "o", "Sylys", "human");
      const members = getMembers(org.id);
      const sylysId = members[0].id;

      addMember(org.id, {
        kind: "agent",
        displayName: "Axiom",
        role: "coordinator",
        description: "The Executioner",
        specializations: ["feature-dev"],
        status: "active",
        reportsTo: sylysId,
      });

      const viz = visualizeHierarchy(org.id);
      expect(viz).toContain("NoxSoft");
      expect(viz).toContain("Sylys");
      expect(viz).toContain("Axiom");
      expect(viz).toContain("coordinator");
    });
  });
});
