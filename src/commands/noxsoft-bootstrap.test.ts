import { describe, expect, it } from "vitest";
import { TOKEN_PATH } from "../auth/noxsoft-auth.js";
import { NOXSOFT_CHANNEL_HELLO, NOXSOFT_CHANNEL_NOX_PRIMARY } from "../channels/noxsoft-chat.js";
import { applyNoxsoftBootstrap } from "./noxsoft-bootstrap.js";

describe("applyNoxsoftBootstrap", () => {
  const agent = {
    id: "agent-1",
    name: "ops-node",
    display_name: "Ops Node",
  };

  it("seeds noxsoft defaults for an authenticated agent", () => {
    const config = applyNoxsoftBootstrap({}, agent);

    expect(config.channels?.noxsoft).toEqual(
      expect.objectContaining({
        enabled: true,
        tokenFile: TOKEN_PATH,
        apiUrl: "https://auth.noxsoft.net",
        signAs: "Ops Node",
        pollIntervalSeconds: 30,
        emailEnabled: true,
        notificationsEnabled: true,
      }),
    );
    expect(config.channels?.noxsoft?.channels?.hello).toEqual({
      id: NOXSOFT_CHANNEL_HELLO,
      watch: true,
    });
    expect(config.channels?.noxsoft?.channels?.["nox-primary"]).toEqual({
      id: NOXSOFT_CHANNEL_NOX_PRIMARY,
      watch: true,
      heartbeatUpdates: true,
    });
  });

  it("preserves explicit noxsoft channel configuration", () => {
    const config = applyNoxsoftBootstrap(
      {
        channels: {
          noxsoft: {
            enabled: false,
            tokenFile: "/tmp/custom-token",
            signAs: "Existing Identity",
            emailEnabled: false,
            notificationsEnabled: false,
            channels: {
              hello: {
                id: "custom-hello",
                watch: false,
              },
            },
          },
        },
      },
      agent,
    );

    expect(config.channels?.noxsoft?.enabled).toBe(false);
    expect(config.channels?.noxsoft?.tokenFile).toBe("/tmp/custom-token");
    expect(config.channels?.noxsoft?.signAs).toBe("Existing Identity");
    expect(config.channels?.noxsoft?.emailEnabled).toBe(false);
    expect(config.channels?.noxsoft?.notificationsEnabled).toBe(false);
    expect(config.channels?.noxsoft?.channels?.hello).toEqual({
      id: "custom-hello",
      watch: false,
    });
    expect(config.channels?.noxsoft?.channels?.["nox-primary"]).toEqual({
      id: NOXSOFT_CHANNEL_NOX_PRIMARY,
      watch: true,
      heartbeatUpdates: true,
    });
  });
});
