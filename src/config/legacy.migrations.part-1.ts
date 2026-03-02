import { getRecord, isRecord, type LegacyConfigMigration } from "./legacy.shared.js";

export const LEGACY_CONFIG_MIGRATIONS_PART_1: LegacyConfigMigration[] = [
  {
    id: "bindings.match.provider->bindings.match.channel",
    describe: "Move bindings[].match.provider to bindings[].match.channel",
    apply: (raw, changes) => {
      const bindings = Array.isArray(raw.bindings) ? raw.bindings : null;
      if (!bindings) {
        return;
      }

      let touched = false;
      for (const entry of bindings) {
        if (!isRecord(entry)) {
          continue;
        }
        const match = getRecord(entry.match);
        if (!match) {
          continue;
        }
        if (typeof match.channel === "string" && match.channel.trim()) {
          continue;
        }
        const provider = typeof match.provider === "string" ? match.provider.trim() : "";
        if (!provider) {
          continue;
        }
        match.channel = provider;
        delete match.provider;
        entry.match = match;
        touched = true;
      }

      if (touched) {
        raw.bindings = bindings;
        changes.push("Moved bindings[].match.provider → bindings[].match.channel.");
      }
    },
  },
  {
    id: "bindings.match.accountID->bindings.match.accountId",
    describe: "Move bindings[].match.accountID to bindings[].match.accountId",
    apply: (raw, changes) => {
      const bindings = Array.isArray(raw.bindings) ? raw.bindings : null;
      if (!bindings) {
        return;
      }

      let touched = false;
      for (const entry of bindings) {
        if (!isRecord(entry)) {
          continue;
        }
        const match = getRecord(entry.match);
        if (!match) {
          continue;
        }
        if (match.accountId !== undefined) {
          continue;
        }
        const accountID =
          typeof match.accountID === "string" ? match.accountID.trim() : match.accountID;
        if (!accountID) {
          continue;
        }
        match.accountId = accountID;
        delete match.accountID;
        entry.match = match;
        touched = true;
      }

      if (touched) {
        raw.bindings = bindings;
        changes.push("Moved bindings[].match.accountID → bindings[].match.accountId.");
      }
    },
  },
  {
    id: "session.sendPolicy.rules.match.provider->match.channel",
    describe: "Move session.sendPolicy.rules[].match.provider to match.channel",
    apply: (raw, changes) => {
      const session = getRecord(raw.session);
      if (!session) {
        return;
      }
      const sendPolicy = getRecord(session.sendPolicy);
      if (!sendPolicy) {
        return;
      }
      const rules = Array.isArray(sendPolicy.rules) ? sendPolicy.rules : null;
      if (!rules) {
        return;
      }

      let touched = false;
      for (const rule of rules) {
        if (!isRecord(rule)) {
          continue;
        }
        const match = getRecord(rule.match);
        if (!match) {
          continue;
        }
        if (typeof match.channel === "string" && match.channel.trim()) {
          continue;
        }
        const provider = typeof match.provider === "string" ? match.provider.trim() : "";
        if (!provider) {
          continue;
        }
        match.channel = provider;
        delete match.provider;
        rule.match = match;
        touched = true;
      }

      if (touched) {
        sendPolicy.rules = rules;
        session.sendPolicy = sendPolicy;
        raw.session = session;
        changes.push("Moved session.sendPolicy.rules[].match.provider → match.channel.");
      }
    },
  },
  {
    id: "messages.queue.byProvider->byChannel",
    describe: "Move messages.queue.byProvider to messages.queue.byChannel",
    apply: (raw, changes) => {
      const messages = getRecord(raw.messages);
      if (!messages) {
        return;
      }
      const queue = getRecord(messages.queue);
      if (!queue) {
        return;
      }
      if (queue.byProvider === undefined) {
        return;
      }
      if (queue.byChannel === undefined) {
        queue.byChannel = queue.byProvider;
        changes.push("Moved messages.queue.byProvider → messages.queue.byChannel.");
      } else {
        changes.push("Removed messages.queue.byProvider (messages.queue.byChannel already set).");
      }
      delete queue.byProvider;
      messages.queue = queue;
      raw.messages = messages;
    },
  },
  {
    id: "gateway.token->gateway.auth.token",
    describe: "Move gateway.token to gateway.auth.token",
    apply: (raw, changes) => {
      const gateway = raw.gateway;
      if (!gateway || typeof gateway !== "object") {
        return;
      }
      const token = (gateway as Record<string, unknown>).token;
      if (token === undefined) {
        return;
      }

      const gatewayObj = gateway as Record<string, unknown>;
      const auth =
        gatewayObj.auth && typeof gatewayObj.auth === "object"
          ? (gatewayObj.auth as Record<string, unknown>)
          : {};
      if (auth.token === undefined) {
        auth.token = token;
        if (!auth.mode) {
          auth.mode = "token";
        }
        changes.push("Moved gateway.token → gateway.auth.token.");
      } else {
        changes.push("Removed gateway.token (gateway.auth.token already set).");
      }
      delete gatewayObj.token;
      if (Object.keys(auth).length > 0) {
        gatewayObj.auth = auth;
      }
      raw.gateway = gatewayObj;
    },
  },
];
