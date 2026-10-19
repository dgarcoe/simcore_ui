import Phaser from 'phaser';
import { parseAction, targetsOf } from '../../api/parse';
import type { SimEvent, SimState } from '../../api/types';
import { bus } from '../../store/bus';
import { useSim } from '../../store/simStore';
import type { ThemePack } from '../../themes/types';
import { paintMap, TILE } from '../art/paintMap';
import { propSprite } from '../art/propSprite';
import { ensureSharedTextures, propKey } from '../art/textures';
import { itemIcon, routeBetween, type MapModel, type Tile, type Zone } from '../map/model';
import type { Bubble } from '../fx/Bubble';
import { AgentView, PIXEL_FONT } from '../sprites/AgentView';

export interface WorldData {
  map: MapModel;
  theme: ThemePack;
}

const ZOOMS = [0.5, 1, 1.5, 2, 3, 4];

/** Emote for a pressing need: food for hunger/thirst, zzz for sleep, alert otherwise. */
export function needIcon(name: string, label = ''): string {
  const s = `${name} ${label}`.toLowerCase();
  if (/hung|hambr|fome|food|comid|thirst|sed|agua|water/.test(s)) return 'food';
  if (/sleep|sueñ|sono|tired|cansa|fatig|rest/.test(s)) return 'sleep';
  return 'alert';
}
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
  /** Item icons + counts under each place's label (its stock). */
  private stockBadges = new Map<string, { sig: string; box: Phaser.GameObjects.Container }>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  /** Padlock / fire markers and overlays for closed or dangerous places. */
  private placeMarks = new Map<string, { sig: string; parts: Phaser.GameObjects.GameObject[] }>();

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
    this.stockBadges = new Map();
    this.labels = new Map();
    this.placeMarks = new Map();
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
      const label = this.add
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
      this.labels.set(z.name, label);
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
      view.setCondition(...this.conditionLook(sim, agent.state.conditions));
      // Agents in virtual places (chats, networks) stay where they were on the map.
      if (view.zone !== loc && this.zones.has(loc)) {
        if (instant) {
          view.zone = loc;
          view.place(this.occupancy.take(this.zones.get(loc)!, view.name));
        } else this.walkTo(view, loc);
      }
    }
    for (const [name, view] of this.agents) if (!seen.has(name)) this.removeAgent(name, view, !instant);
    this.updateStock(sim);
    this.updatePlaces(sim);
  }

  /** Closed places get a padlock and a dark veil; dangerous ones a fire badge and a pulsing red veil. */
  private updatePlaces(sim: SimState): void {
    for (const z of this.map.zones) {
      const loc = sim.environment.locations[z.name];
      const closed = !!loc?.closed;
      const hazard = loc?.hazard ?? null;
      const sig = `${closed}|${hazard ? hazard.label ?? '?' : ''}`;
      const current = this.placeMarks.get(z.name);
      if (current?.sig === sig) continue;
      current?.parts.forEach((p) => p.destroy());
      this.placeMarks.delete(z.name);
      if (!closed && !hazard) continue;
      const parts: Phaser.GameObjects.GameObject[] = [];
      const x = z.body.x * TILE;
      const y = z.body.y * TILE;
      const w = z.body.w * TILE;
      const h = z.body.h * TILE;
      const label = this.labels.get(z.name);
      const lx = label ? label.x - label.displayWidth / 2 - 9 : x;
      const ly = label ? label.y - label.displayHeight / 2 : y;
      if (closed) {
        parts.push(this.add.rectangle(x, y, w, h, 0x1a1c2c, 0.35).setOrigin(0).setDepth(99990));
        parts.push(this.add.image(lx, ly, 'emote:lock').setDepth(100001));
      }
      if (hazard) {
        const veil = this.add.rectangle(x, y, w, h, 0xb13e53, 0.18).setOrigin(0).setDepth(99991);
        this.tweens.add({ targets: veil, alpha: 0.05, duration: 500, yoyo: true, repeat: -1 });
        parts.push(veil);
        parts.push(this.add.image(closed ? lx - 13 : lx, ly, 'emote:fire').setDepth(100001));
        if (hazard.label) {
          parts.push(
            this.add
              .text(x + w / 2, y + h - 2, hazard.label, { fontFamily: PIXEL_FONT, fontSize: '6px', color: '#ffcd75', backgroundColor: '#1a1c2c', padding: { x: 2, y: 1 } })
              .setResolution(4)
              .setOrigin(0.5, 1)
              .setDepth(100001),
          );
        }
      }
      this.placeMarks.set(z.name, { sig, parts });
    }
  }

  /** Shows what lies in each place (Simcore with inventories): icons with counts under the label. */
  private updateStock(sim: SimState): void {
    for (const z of this.map.zones) {
      const stock = Object.entries(sim.environment.locations[z.name]?.stock ?? {}).filter(([, n]) => n > 0);
      const sig = stock.map(([k, n]) => `${k}:${n}`).join(',');
      const current = this.stockBadges.get(z.name);
      if (current?.sig === sig) continue;
      current?.box.destroy();
      this.stockBadges.delete(z.name);
      if (!stock.length) continue;
      const parts: Phaser.GameObjects.GameObject[] = [];
      let x = 0;
      for (const [item, n] of stock.slice(0, 4)) {
        parts.push(this.add.image(x, 0, `emote:${itemIcon(item)}`).setOrigin(0, 0.5));
        const label = this.add
          .text(x + 13, 0, `${Number.isInteger(n) ? n : n.toFixed(1)}`, { fontFamily: PIXEL_FONT, fontSize: '6px', color: '#f4f4f4' })
          .setResolution(4)
          .setStroke('#1a1c2c', 3)
          .setOrigin(0, 0.5);
        parts.push(label);
        x += 15 + label.width;
      }
      // Right of the place's name tag, on the same line.
      const label = this.labels.get(z.name);
      const bx = label ? label.x + label.displayWidth / 2 + 3 : z.body.x * TILE;
      const by = label ? label.y - label.displayHeight / 2 : z.body.y * TILE;
      const bg = this.add.rectangle(-2, 0, x + 2, 14, 0x1a1c2c, 0.75).setOrigin(0, 0.5);
      const box = this.add.container(bx, by, [bg, ...parts]).setDepth(100000);
      const tip = stock.map(([k, n]) => `${k} ×${n}`).join(', ');
      box.setSize(x, 12).setInteractive({ useHandCursor: false });
      box.on('pointerover', () => this.flashTip(box, `Aquí hay: ${tip}`));
      this.stockBadges.set(z.name, { sig, box });
    }
  }

  private flashTip(near: Phaser.GameObjects.Container, text: string): void {
    const t = this.add
      .text(near.x, near.y + 10, text, { fontFamily: PIXEL_FONT, fontSize: '6px', color: '#f4f4f4', backgroundColor: '#1a1c2c', padding: { x: 3, y: 2 } })
      .setResolution(4)
      .setDepth(200002);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 300, onComplete: () => t.destroy() });
  }

  /** Where an item goes from/to: an agent, or a place ("location:<name>"). */
  private pointOf(ref: string, fallbackZone = ''): { x: number; y: number } | null {
    const view = this.agents.get(ref);
    if (view) return { x: view.x, y: view.y - 14 };
    const z = this.zones.get(ref.startsWith('location:') ? ref.slice('location:'.length) : fallbackZone);
    if (!z) return null;
    return { x: (z.body.x + z.body.w / 2) * TILE, y: (z.body.y + z.body.h / 2) * TILE };
  }

  private flyItem(item: string, from: { x: number; y: number }, to: { x: number; y: number }): void {
    const img = this.add.image(from.x, from.y, `emote:${itemIcon(item)}`).setDepth(200001);
    const arc = { t: 0 };
    this.tweens.add({
      targets: arc,
      t: 1,
      duration: 650,
      ease: 'Sine.easeInOut',
      onUpdate: () => img.setPosition(from.x + (to.x - from.x) * arc.t, from.y + (to.y - from.y) * arc.t - Math.sin(arc.t * Math.PI) * 18),
      onComplete: () => this.tweens.add({ targets: img, alpha: 0, duration: 250, onComplete: () => img.destroy() }),
    });
  }

  private playTransfer(e: SimEvent): void {
    const d = e.data as { kind: string; item: string; from: string; to: string; location: string };
    if (d.kind === 'use') {
      const user = this.agents.get(d.from);
      const target = this.agents.get(d.to);
      target?.showEmote(itemIcon(d.item));
      if (user && target && user !== target) this.linkBurst(user, target, 0x38b764);
      return;
    }
    const from = d.from ? this.pointOf(d.from, d.location) : null;
    const to = d.to ? this.pointOf(d.to, d.location) : null;
    if (from && to) this.flyItem(d.item, from, to);
    else if (to) this.flyItem(d.item, { x: to.x, y: to.y - 40 }, to); // supplies dropping in
    else if (from) this.flyItem(d.item, from, { x: from.x, y: from.y - 40 }); // taken away
  }

  /** Color of the agent's most visible condition (rule-controlled first) and whether rules drive it. */
  private conditionLook(sim: SimState, conditions: Record<string, number | null> | undefined): [number | null, boolean] {
    const catalog = sim.conditions ?? {};
    const names = Object.keys(conditions ?? {});
    const ruled = names.some((n) => catalog[n]?.controller === 'rules');
    const pick = [...names].sort((a, b) => Number(catalog[b]?.controller === 'rules') - Number(catalog[a]?.controller === 'rules')).find((n) => catalog[n]?.color);
    const color = pick ? Number.parseInt(String(catalog[pick].color).replace('#', ''), 16) : NaN;
    return [Number.isNaN(color) ? null : color, ruled];
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
      case 'item_transfer':
      case 'condition_change':
      case 'need_change':
      case 'agent_plan':
      case 'belief_shared':
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
    if (e.type === 'item_transfer') return this.playTransfer(e);
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

    if (e.type === 'agent_plan') {
      view.showEmote('idea');
      return;
    }
    if (e.type === 'belief_shared') {
      const listener = this.agents.get(String(e.data.to ?? ''));
      if (listener && listener !== view) {
        view.faceToward(listener);
        listener.faceToward(view);
        this.linkBurst(view, listener, e.data.secret ? 0xb13e53 : 0x41a6f6);
      }
      (listener ?? view).showEmote('book');
      return;
    }
    if (e.type === 'need_change') {
      const level = String(e.data.level);
      if (level !== 'ok') view.showEmote(needIcon(String(e.data.need), String(e.data.label ?? '')));
      return;
    }
    if (e.type === 'condition_change') {
      const change = String(e.data.change);
      if (change === 'transformed') {
        view.showEmote('skull');
        const z = this.zones.get(view.zone);
        if (z) this.flashZone(z, 0x7bc950, 2);
      } else view.showEmote(change === 'added' ? 'alert' : 'sparkle');
      return;
    }
    if (e.type === 'agent_death') {
      view.die(true);
      this.cameras.main.shake(200, 0.003);
      return;
    }
    if (view.status !== 'alive') return;
    if (e.type === 'reflection') return view.say(String(e.data.summary ?? ''), 'thought');

    const action = parseAction(e.data.action);
    const other = 'target' in action ? this.agents.get(targetsOf(e.data, action.target)[0] ?? '') : undefined;
    switch (action.kind) {
      case 'move':
        if (view.zone !== action.target) this.walkTo(view, action.target);
        break;
      case 'speak': {
        const listeners = targetsOf(e.data, action.target)
          .map((n) => this.agents.get(n))
          .filter((a): a is NonNullable<typeof a> => !!a);
        if (listeners[0]) view.faceToward(listeners[0]);
        for (const l of listeners) {
          l.faceToward(view);
          l.showEmote('alert');
        }
        view.say(action.content, 'speech');
        break;
      }
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
      case 'give':
        if (other) view.faceToward(other);
        break;
      case 'offer':
        if (other) {
          view.faceToward(other);
          other.faceToward(view);
          this.linkBurst(view, other, 0xffcd75);
        }
        view.showEmote('coin');
        view.say(`${action.amount} ${action.item}${action.askItem ? ` ⇄ ${action.askAmount} ${action.askItem}` : ' (regalo)'}`, 'action', 2600);
        break;
      case 'accept':
        view.showEmote('heart');
        break;
      case 'decline':
        view.showEmote('dots');
        break;
      case 'take':
      case 'drop':
      case 'use':
        break;
      case 'custom':
        if (e.data.name) {
          // Scenario action (bite, shoot, treat…) on someone here.
          const victim = this.agents.get(String(e.data.target ?? ''));
          if (victim) {
            view.faceToward(victim);
            victim.faceToward(view);
            this.linkBurst(view, victim, e.data.success === false ? 0x94b0c2 : 0xb13e53);
            victim.showEmote('alert');
          } else view.showEmote('hand');
          if (action.content) view.say(action.content, 'action', 2600);
          break;
        }
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
