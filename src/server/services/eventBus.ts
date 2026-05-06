import { EventEmitter } from "node:events";
import type { AgentEvent, AgentSession } from "../../shared/events.ts";

type Events = {
  event_upserted: [AgentEvent];
  session_upserted: [AgentSession];
};

class TypedEmitter extends EventEmitter {
  emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    return super.emit(event, ...args);
  }
  on<K extends keyof Events>(
    event: K,
    listener: (...args: Events[K]) => void,
  ): this {
    return super.on(event, listener);
  }
  off<K extends keyof Events>(
    event: K,
    listener: (...args: Events[K]) => void,
  ): this {
    return super.off(event, listener);
  }
}

export const eventBus = new TypedEmitter();
eventBus.setMaxListeners(50);
