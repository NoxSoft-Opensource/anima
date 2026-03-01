/**
 * Terminal Channel — bridges the ANIMA REPL to the channel bridge
 *
 * Implements the Channel interface for interactive terminal sessions.
 * The REPL pushes user input into this channel's queue; receive() drains it.
 * send() writes directly to the terminal output stream.
 *
 * All terminal messages are priority "high" because the user is actively
 * waiting for a response.
 */

import { randomUUID } from "node:crypto";
import type { Channel, IncomingMessage, OutgoingMessage } from "./bridge.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface TerminalChannelConfig {
  /** Display name for the local user. Defaults to "user". */
  userName?: string;
  /** Output stream. Defaults to process.stdout. */
  output?: NodeJS.WritableStream;
}

// ---------------------------------------------------------------------------
// TerminalChannel
// ---------------------------------------------------------------------------

export class TerminalChannel implements Channel {
  readonly name = "terminal";
  readonly type = "terminal" as const;

  private readonly userName: string;
  private readonly output: NodeJS.WritableStream;

  /** Queue of user inputs pushed by the REPL. */
  private inputQueue: Array<{ content: string; timestamp: Date }> = [];

  constructor(config: TerminalChannelConfig = {}) {
    this.userName = config.userName ?? "user";
    this.output = config.output ?? process.stdout;
  }

  /**
   * Push user input into the channel queue. Called by the REPL when the
   * user enters a line.
   */
  pushInput(content: string): void {
    this.inputQueue.push({ content, timestamp: new Date() });
  }

  /**
   * Drain all queued user inputs as IncomingMessages.
   * Terminal messages are always priority "high".
   */
  async receive(): Promise<IncomingMessage[]> {
    const messages: IncomingMessage[] = this.inputQueue.map((entry) => ({
      id: randomUUID(),
      channel: this.name,
      from: this.userName,
      content: entry.content,
      timestamp: entry.timestamp,
      priority: "high" as const,
      metadata: { source: "terminal" },
    }));

    this.inputQueue = [];
    return messages;
  }

  /**
   * Write a message to the terminal output stream.
   */
  async send(message: OutgoingMessage): Promise<void> {
    const text = message.content;
    await new Promise<void>((resolve, reject) => {
      this.output.write(`${text}\n`, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Terminal is healthy if the output stream is writable.
   */
  async isHealthy(): Promise<boolean> {
    return this.output.writable;
  }
}
