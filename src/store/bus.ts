import type { SimEvent } from '../api/types';

// Bridge from the store to the Phaser scene: React never touches sprites and
// Phaser never fetches data.
export interface BusEvents {
  event: SimEvent;
  /** Fired when replay/live restarts so the scene can drop pending animations. */
  reset: void;
  /** A replay jumped: redraw the world from the current state at once. */
  resync: void;
  focusAgent: string;
  focusZone: string;
  zoom: 'in' | 'out' | 'fit';
  /** Open a sidebar tab (e.g. from the end card). */
  openTab: 'chat' | 'events' | 'agents' | 'story';
}

type Handler<T> = (payload: T) => void;

class Bus {
  private handlers = new Map<keyof BusEvents, Set<Handler<any>>>();

  on<K extends keyof BusEvents>(type: K, fn: Handler<BusEvents[K]>): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit<K extends keyof BusEvents>(type: K, ...payload: BusEvents[K] extends void ? [] : [BusEvents[K]]): void {
    this.handlers.get(type)?.forEach((fn) => fn(payload[0]));
  }
}

export const bus = new Bus();
