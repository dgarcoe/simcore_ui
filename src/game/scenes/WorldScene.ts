import Phaser from 'phaser';
import { parseAction } from '../../api/parse';
import type { SimEvent, SimState } from '../../api/types';
import { bus } from '../../store/bus';
import { useSim } from '../../store/simStore';
import type { ThemePack } from '../../themes/types';
import { paintMap, TILE } from '../art/paintMap';
import { propSprite } from '../art/propSprite';
import { ensureSharedTextures, propKey } from '../art/textures';
import { routeBetween, type MapModel, type Tile, type Zone } from '../map/model';
import type { Bubble } from '../fx/Bubble';
import { AgentView, PIXEL_FONT } from '../sprites/AgentView';

export interface WorldData {
  map: MapModel;
  theme: ThemePack;
}

const ZOOMS = [0.5, 1, 1.5, 2, 3, 4];
const CUE_MS = 260;

/** Nudges overlapping speech bubbles upward so every line stays readable. */
function stackBubbles(bubbles: Bubble[]): void {
  if (bubbles.length < 2) return;
  bubbles.sort((a, b) => b.y - a.y);
  const placed: Bubble[] = [];
  for (const b of bubbles) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const p of placed) {
        const overlapX = Math.abs(b.x - p.x) * 2 < b.bw + p.bw;
        const overlapY = b.y - b.bh < p.y && p.y - p.bh < b.y;
        if (overlapX && overlapY) {
          b.y = p.y - p.bh - 1;
          moved = true;
        }
      }
    }
    placed.push(b);
  }
}

/** Hands out stand spots inside zones so agents don't pile on one tile. */
class Occupancy {
  private byZone = new Map<string, Map<string, number>>();

  take(zone: Zone, agent: string): Tile {
    this.release(agent);
    const used = this.byZone.get(zone.name) ?? new Map<string, number>();
    this.byZone.set(zone.name, used);
    const taken = new Set(used.values());
    let i = 0;
    while (taken.has(i)) i++;
    used.set(agent, i);
    return zone.spots[i % zone.spots.length];
  }

  release(agent: string): void {
    for (const used of this.byZone.values()) used.delete(agent);
  }
}

export class WorldScene extends Phaser.Scene {
  private map!: MapModel;
  private theme!: ThemePack;
  private zones = new Map<string, Zone>();
  private agents = new Map<string, AgentView>();
  private occupancy = new Occupancy();
  private cues: SimEvent[] = [];
  private cueTimer = 0;
  private unsubs: Array<() => void> = [];
  private dragging = false;
  private zoomIndex = 1;

  constructor() {
    super('world');
  }

  init(data: WorldData): void {
    this.map = data.map;
    this.theme = data.theme;
    this.zones = new Map(data.map.zones.map((z) => [z.name, z]));
    this.agents = new Map();
    this.occupancy = new Occupancy();
    this.cues = [];
  }

  create(): void {
    const { map, theme } = this;
    const w = map.cols * TILE;
    const h = map.rows * TILE;
    this.cameras.main.setBackgroundColor(theme.background);
    ensureSharedTextures(this, theme);

    if (theme.ambient === 'stars') {
      [0.4, 1].forEach((factor, i) =>
        this.add
          .tileSprite(-w, -h, w * 3, h * 3, 'stars')
          .setOrigin(0)
          .setScrollFactor(factor)
          .setAlpha(i ? 1 : 0.5)
          .setDepth(-10 + i),
      );
    }

    const mapKey = `map:${theme.id}`;
    if (this.textures.exists(mapKey)) this.textures.remove(mapKey);
    this.textures.addCanvas(mapKey, paintMap(map, theme));
    this.add.image(0, 0, mapKey).setOrigin(0).setDepth(-1);

    this.placeProps();
    this.placeLabels();
    this.addAmbient();
    this.setupCamera(w, h);

    const sim = useSim.getState().sim;
    if (sim) this.reconcile(sim, true);
    this.syncSelection();

    this.unsubs.push(
      bus.on('event', (e) => this.onEvent(e)),
      bus.on('reset', () => this.resetAgents()),
      bus.on('focusAgent', (name) => this.focusAgent(name)),
      bus.on('focusZone', (name) => this.focusZone(name)),
      bus.on('zoom', (z) => this.zoomStep(z)),
      useSim.subscribe((s, prev) => {
        if (s.selectedAgent !== prev.selectedAgent || s.follow !== prev.follow) this.syncSelection();
      }),
    );
    const teardown = () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      this.agents.forEach((a) => a.destroy());
      this.agents.clear();
    };
    // SHUTDOWN on scene restart, DESTROY when the whole game is torn down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  override update(_time: number, delta: number): void {
    const bubbles: Bubble[] = [];
    this.agents.forEach((a) => {
      const b = a.update();
      if (b) bubbles.push(b);
    });
    stackBubbles(bubbles);
    if (this.cues.length === 0) return;
    this.cueTimer -= delta;
    if (this.cueTimer > 0) return;
    // Fall behind gracefully when a tick floods in many events.
    const burst = this.cues.length > 24 ? 6 : this.cues.length > 10 ? 2 : 1;
    for (let i = 0; i < burst && this.cues.length; i++) this.playCue(this.cues.shift()!);
    this.cueTimer = CUE_MS;
  }

  // ── World building ───────────────────────────────────────────────────

  private placeProps(): void {
    for (const p of this.map.props) {
      const key = propSprite(this.theme, p.key);
      const x = p.x * TILE + TILE / 2;
      const y = p.y * TILE + TILE;
      const img = this.add.image(x, y, propKey(this.theme, key)).setOrigin(0.5, 1);
      // Furniture stands against the wall; scenery is sorted with the agents.
      img.setDepth(this.map.layout === 'outdoor' ? y - 2 : y - TILE);
      if (p.owner) this.ownerTag(img, key === 'house' ? `Casa de ${p.owner}` : `Cama de ${p.owner}`);
      if (key === 'asteroid' || key === 'debris') {
        img.setDepth(-5);
        this.tweens.add({ targets: img, angle: 360, duration: 20000 + (p.x * 977) % 20000, repeat: -1 });
      }
    }
  }

  /** Shows who a bed or house belongs to while hovering it. */
  private ownerTag(img: Phaser.GameObjects.Image, text: string): void {
    const tag = this.add
      .text(img.x, img.y - TILE - 2, text, { fontFamily: PIXEL_FONT, fontSize: '8px', color: '#f4f4f4' })
      .setResolution(4)
      .setStroke('#1a1c2c', 3)
      .setOrigin(0.5, 1)
      .setDepth(100001)
      .setVisible(false);
    img.setInteractive();
    img.on('pointerover', () => tag.setVisible(true));
    img.on('pointerout', () => tag.setVisible(false));
  }

  private placeLabels(): void {
    for (const z of this.map.zones) {
      const x = z.label.x * TILE + (z.body.w % 2 ? TILE / 2 : 0);
      const y = z.label.y * TILE + TILE - 2;
      this.add
        .text(x, y, z.name, {
          fontFamily: PIXEL_FONT,
          fontSize: '8px',
          color: this.theme.ui.label,
          backgroundColor: this.theme.ui.labelBg,
          padding: { x: 3, y: 2 },
        })
        .setResolution(4)
        .setOrigin(0.5, 1)
        .setDepth(100000)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', (p: Phaser.Input.Pointer) => {
          if (p.getDistance() < 6) this.focusZone(z.name);
        });
    }
  }

  private addAmbient(): void {
    const { cols, rows } = this.map;
    if (this.theme.ambient === 'dust') {
      this.add
        .particles(0, 0, 'px', {
          x: { min: 0, max: cols * TILE },
          y: { min: 0, max: rows * TILE },
          lifespan: 6000,
          speedX: { min: -4, max: 4 },
          speedY: { min: -3, max: 2 },
          alpha: { start: 0.35, end: 0 },
          scale: 0.5,
          frequency: 120,
          tint: 0xd9c39a,
        })
        .setDepth(150000);
    }
    if (this.theme.ambient === 'sparks') {
      for (const z of this.map.zones.filter((z) => z.role === 'production' || z.role === 'engineering')) {
        this.add
          .particles(z.body.x * TILE + TILE * 2, z.body.y * TILE + 6, 'px', {
            x: { min: 0, max: (z.body.w - 3) * TILE },
            lifespan: 500,
            speed: { min: 20, max: 50 },
            angle: { min: 200, max: 340 },
            gravityY: 160,
            scale: 0.5,
            tint: [0xffcd75, 0xef7d57],
            frequency: 700,
            quantity: 3,
          })
          .setDepth(150000);
      }
    }
  }

  private setupCamera(w: number, h: number): void {
    const cam = this.cameras.main;
    const pad = 4 * TILE;
    cam.setBounds(-pad, -pad, w + pad * 2, h + pad * 2);
    const fit = Math.min(this.scale.width / w, this.scale.height / h);
    // Largest zoom that shows the whole map, but never below 1x (pixels stay crisp).
    this.zoomIndex = Math.max(1, ZOOMS.filter((z) => z <= fit).length - 1);
    cam.setZoom(ZOOMS[this.zoomIndex]);
    cam.centerOn(w / 2, h / 2);

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (p.getDistance() > 4) this.dragging = true;
      if (!this.dragging) return;
      if (useSim.getState().follow) useSim.getState().set({ follow: false });
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    this.input.on('pointerup', () => (this.dragging = false));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomStep(dy > 0 ? 'out' : 'in'));
  }

  private zoomStep(dir: 'in' | 'out' | 'fit'): void {
    const cam = this.cameras.main;
    if (dir === 'fit') {
      const w = this.map.cols * TILE;
      const h = this.map.rows * TILE;
      const fit = Math.min(this.scale.width / w, this.scale.height / h);
      this.zoomIndex = Math.max(0, ZOOMS.filter((z) => z <= fit).length - 1);
      cam.centerOn(w / 2, h / 2);
    } else {
      this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + (dir === 'in' ? 1 : -1), 0, ZOOMS.length - 1);
    }
    this.tweens.add({ targets: cam, zoom: ZOOMS[this.zoomIndex], duration: 150 });
  }

  // ── Agents ───────────────────────────────────────────────────────────

  private zoneFor(name: string): Zone | undefined {
    return this.zones.get(name) ?? this.map.zones[0];
  }

  private ensureAgent(name: string, location: string, profession?: string): AgentView | null {
    const existing = this.agents.get(name);
    if (existing) return existing;
    const zone = this.zoneFor(location);

    if (!zone) return null;
    const spot = this.occupancy.take(zone, name);
    const view = new AgentView(
      this,
      this.theme,
      name,
      spot,
      zone.name,
      (n) => {
        const s = useSim.getState();
        s.selectAgent(s.selectedAgent === n ? null : n);
      },
      useSim.getState().professions[name] ?? profession,
    );
    this.agents.set(name, view);
    return view;
  }

  private resetAgents(): void {
    this.cues = [];
    this.agents.forEach((a) => a.destroy());
    this.agents.clear();
    this.occupancy = new Occupancy();
  }

  private walkTo(view: AgentView, zoneName: string): void {
    const zone = this.zones.get(zoneName);
    if (!zone) return;
    view.zone = zone.name;
    const spot = this.occupancy.take(zone, view.name);
    const path = routeBetween(this.map, view.tile, spot);
    if (!path) return view.place(spot);
    view.walk(path, (t) => this.map.ground[t.y * this.map.cols + t.x] === 'lane');
  }

  /** Server state is authoritative: fix any drift after a tick. */
  private reconcile(sim: SimState, instant = false): void {
    const seen = new Set<string>();
    for (const agent of Object.values(sim.agents)) {
      const status = agent.status ?? agent.state.status ?? 'alive';
      if (status === 'departed') continue;
      seen.add(agent.name);
      const loc = agent.location || agent.state.location;
      const view = this.ensureAgent(agent.name, loc, agent.profession);
      if (!view) continue;
      view.setMood(agent.state.mood, agent.state.energy);
      if (status === 'dead') {
        view.die(false);
        continue;
      }
      view.setHealth(agent.state.health);
      // Agents in virtual places (chats, networks) stay where they were on the map.
      if (view.zone !== loc && this.zones.has(loc)) {
        if (instant) {
          view.zone = loc;
          view.place(this.occupancy.take(this.zones.get(loc)!, view.name));
        } else this.walkTo(view, loc);
      }
    }
    for (const [name, view] of this.agents) if (!seen.has(name)) this.removeAgent(name, view, !instant);
  }

  private removeAgent(name: string, view: AgentView, animated: boolean): void {
    this.agents.delete(name);
    this.occupancy.release(name);
    if (animated) view.leave(() => view.destroy());
    else view.destroy();
  }

  private syncSelection(): void {
    const { selectedAgent, follow } = useSim.getState();
    this.agents.forEach((a, name) => a.setSelected(name === selectedAgent));
    const cam = this.cameras.main;
    const view = selectedAgent ? this.agents.get(selectedAgent) : undefined;
    if (follow && view) cam.startFollow(view.container, true, 0.12, 0.12);
    else cam.stopFollow();
  }

  private focusAgent(name: string): void {
    const view = this.agents.get(name);
    if (view) this.cameras.main.pan(view.x, view.y, 400, 'Sine.easeInOut');
  }

  private focusZone(name: string): void {
    const z = this.zones.get(name);
    if (!z) return;
    this.cameras.main.pan((z.body.x + z.body.w / 2) * TILE, (z.body.y + z.body.h / 2) * TILE, 400, 'Sine.easeInOut');
    this.flashZone(z, 0xffcd75, 1);
  }

  // ── Event playback ───────────────────────────────────────────────────

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'scheduled_event':
      case 'injected_event': {
        this.cameras.main.shake(300, 0.004);
        const zone = this.zones.get(String(e.data.location ?? ''));
        if (zone) this.flashZone(zone, 0xb13e53, 3);
        else this.map.zones.forEach((z) => this.flashZone(z, 0xb13e53, 2));
        break;
      }
      case 'simulation_start':
        this.resetAgents();
        break;
      case 'agent_move':
      case 'agent_speak':
      case 'agent_action':
      case 'agent_post':
      case 'agent_spawn':
      case 'agent_death':
      case 'agent_depart':
      case 'reflection':
      case 'tick_end':
        this.cues.push(e);
        break;
      default:
        break;
    }
  }

  private playCue(e: SimEvent): void {
    if (e.type === 'tick_end') return this.reconcile(e.data as SimState);
    if (e.type === 'agent_spawn') {
      if (this.agents.has(e.source)) return;
      this.ensureAgent(e.source, String(e.data.location ?? ''), String(e.data.profession ?? '') || undefined)?.appear();
      return;
    }
    if (e.type === 'agent_depart') {
      const leaving = this.agents.get(e.source);
      if (leaving) this.removeAgent(e.source, leaving, true);
      return;
    }
    const sim = useSim.getState().sim;
    const view = this.agents.get(e.source) ?? (sim ? this.ensureAgent(e.source, this.locationOf(sim, e.source)) : null);
    if (!view) return;

    if (e.type === 'agent_death') {
      view.die(true);
      this.cameras.main.shake(200, 0.003);
      return;
    }
    if (view.status !== 'alive') return;
    if (e.type === 'reflection') return view.say(String(e.data.summary ?? ''), 'thought');

    const action = parseAction(e.data.action);
    const other = 'target' in action ? this.agents.get(action.target) : undefined;
    switch (action.kind) {
      case 'move':
        if (view.zone !== action.target) this.walkTo(view, action.target);
        break;
      case 'speak':
        if (other) {
          view.faceToward(other);
          other.faceToward(view);
          other.showEmote('alert');
        }
        view.say(action.content, 'speech');
        break;
      case 'trade':
      case 'interact':
        if (other) {
          view.faceToward(other);
          other.faceToward(view);
          this.linkBurst(view, other, action.kind === 'trade' ? 0xffcd75 : 0xef7d57);
          other.showEmote(action.kind === 'trade' ? 'coin' : 'hand');
        }
        view.showEmote(action.kind === 'trade' ? 'coin' : 'hand');
        if (action.content) view.say(action.content, 'action', 2600);
        break;
      case 'post':
        view.showEmote('mega');
        view.say(action.content, 'post');
        break;
      case 'work':
        view.showEmote('gear');
        break;
      case 'rest':
        view.showEmote('sleep');
        break;
      case 'observe':
        view.showEmote('eye');
        break;
      case 'wait':
        view.showEmote('dots');
        break;
      case 'custom':
        view.showEmote('idea');
        if (action.content) view.say(action.content, 'action', 2600);
        break;
    }
  }

  private locationOf(sim: SimState, name: string): string {
    return Object.values(sim.agents).find((a) => a.name === name)?.location ?? '';
  }

  private linkBurst(a: AgentView, b: AgentView, color: number): void {
    const g = this.add.graphics().setDepth(150001);
    const steps = Math.max(2, Math.floor(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 4));
    g.fillStyle(color);
    for (let i = 0; i <= steps; i += 2) {
      const t = i / steps;
      g.fillRect(Math.round(a.x + (b.x - a.x) * t) - 1, Math.round(a.y - 10 + (b.y - a.y) * t) - 1, 2, 2);
    }
    this.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 500, onComplete: () => g.destroy() });
  }

  private flashZone(z: Zone, color: number, times: number): void {
    const r = this.add
      .rectangle(z.body.x * TILE - 2, z.body.y * TILE - 2, z.body.w * TILE + 4, z.body.h * TILE + 4)
      .setOrigin(0)
      .setStrokeStyle(2, color)
      .setFillStyle(color, 0.15)
      .setDepth(150002);
    this.tweens.add({ targets: r, alpha: 0, duration: 450, yoyo: true, repeat: times - 1, onComplete: () => r.destroy() });
  }
}
