import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {DayCondition} from '../../conditions';
import {drawFrost} from './frost';

interface Particle {
  x: number;
  y: number;
  /** Size: streak length for rain, radius for flakes and motes. */
  size: number;
  /** Pixels per second. */
  speed: number;
  phase: number;
}

/** A bank of fog drifting across the fog, in table pixels. */
interface Wisp {
  x: number;
  y: number;
  width: number;
  speed: number;
  phase: number;
  /** Light wisps catch the light; the rest are shade, so the fog seems to roll. */
  light: boolean;
}

/** Fog clears itself once this much of it has been wiped away. */
const FOG_CLEARED_AT = 0.45;
const WIPE_RADIUS = 46;

/**
 * The day's table condition, drawn over the felt: rain, snow, lightning, motes, light and shadow
 * below the result, and fog over everything that you wipe away. Runs outside Angular.
 */
@Component({
  selector: 'app-table-weather',
  templateUrl: './table-weather.component.html',
  styleUrls: ['./table-weather.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class TableWeatherComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() condition: DayCondition = 'clear';
  /** Changes each time the dice are thrown, which brings the fog back. */
  @Input() throwCount = 0;

  @ViewChild('under', {static: true}) underRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('over', {static: true}) overRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fog', {static: true}) fogRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('wisps', {static: true}) wispsRef!: ElementRef<HTMLCanvasElement>;

  fogged = false;
  /** Shows how to wipe the fog, until the first wipe. */
  hinting = false;
  flashing = false;

  private particles: Particle[] = [];
  /** Snowy days' frosted edges, drawn once per size. */
  private frost: HTMLCanvasElement | null = null;
  private wisps: Wisp[] = [];
  /** One soft cloud each of light and shade, drawn once and stretched into every wisp. */
  private wispSprites: { light: HTMLCanvasElement; shade: HTMLCanvasElement } | null = null;
  /** A lightning bolt being drawn, until `until` (a performance.now() time). */
  private bolt: { points: [number, number][]; until: number } | null = null;
  private frameId = 0;
  private lastTime = 0;
  private time = 0;
  private width = 0;
  private height = 0;
  private wiping = false;
  /** Where the last wipe left off, so a quick stroke wipes a streak rather than a row of dots. */
  private lastWipe: [number, number] | null = null;
  private wipes = 0;
  private brush: HTMLCanvasElement | null = null;
  private flashTimer?: ReturnType<typeof setTimeout>;
  private resizeObserver?: ResizeObserver;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {
  }

  /** The first size (and first fog) comes after the view is checked, from the observer or the next frame. */
  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.zone.runOutsideAngular(() => this.resize()));
      this.resizeObserver.observe(this.host.nativeElement);
    } else {
      requestAnimationFrame(() => this.resize());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['condition'] && !changes['condition'].firstChange) {
      this.zone.runOutsideAngular(() => this.start());
    }
    if (changes['throwCount'] && !changes['throwCount'].firstChange && this.condition === 'foggy') {
      this.paintFog();
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.flashTimer);
    this.resizeObserver?.disconnect();
  }

  get still(): boolean {
    return !!this.reducedMotion?.matches;
  }

  /** A lightning strike from the top of the table down to (x, y), in viewport pixels. Stormy days only. */
  strike(x: number, y: number): void {
    if (this.still || this.condition !== 'stormy') {
      return;
    }
    const box = this.overRef.nativeElement.getBoundingClientRect();
    const tx = x - box.left;
    const ty = y - box.top;
    const points: [number, number][] = [[tx + (Math.random() - 0.5) * 80, 0]];
    const steps = 9;
    for (let i = 1; i <= steps; i++) {
      const [px] = points[i - 1];
      points.push([i === steps ? tx : px + (tx - px) / (steps - i + 1) + (Math.random() - 0.5) * 40, (ty * i) / steps]);
    }
    this.bolt = {points, until: performance.now() + 260};
    this.flash();
  }

  clearFog(): void {
    this.fogged = false;
  }

  onFogDown(event: PointerEvent): void {
    this.wiping = true;
    this.hinting = false;
    this.lastWipe = null;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.wipe(event);
  }

  onFogMove(event: PointerEvent): void {
    if (this.wiping) {
      this.wipe(event);
    }
  }

  onFogUp(): void {
    this.wiping = false;
    this.lastWipe = null;
    if (this.fogged && this.fogCoverage() < 1 - FOG_CLEARED_AT) {
      this.fogged = false;
    }
  }

  private resize(): void {
    const {width, height} = this.host.nativeElement.getBoundingClientRect();
    if (!width || !height) {
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fog = this.fogRef.nativeElement;
    for (const canvas of [this.underRef.nativeElement, this.overRef.nativeElement, fog, this.wispsRef.nativeElement]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // The fog is read back to see how much has been wiped.
      canvas.getContext('2d', canvas === fog ? {willReadFrequently: true} : undefined)?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const first = !this.width;
    this.width = width;
    this.height = height;
    this.frost = null;
    this.start();
    if (this.condition === 'foggy' && (first || this.fogged)) {
      this.zone.run(() => this.paintFog());
    }
  }

  /** Sets up the particles for the condition and runs the animation, or draws one still frame. */
  private start(): void {
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.flashTimer);
    const random = Math.random;
    const {width: w, height: h} = this;
    const count = {rainy: 80, stormy: 110, snowy: 70, 'low-gravity': 35, inspired: 45}[this.condition as string] ?? 0;
    this.particles = Array.from({length: count}, () => ({
      x: random() * w,
      y: random() * h,
      size: this.condition === 'snowy' ? 1 + random() * 2.2 : this.condition === 'rainy' || this.condition === 'stormy' ? 10 + random() * 14 : 1 + random() * 2,
      speed: this.condition === 'snowy' ? 18 + random() * 22 : this.condition === 'rainy' || this.condition === 'stormy' ? 380 + random() * 260 : 8 + random() * 16,
      phase: random() * 6,
    }));
    this.wisps = this.condition === 'foggy' ? Array.from({length: 12}, (_, i) => ({
      x: random() * (w + 400) - 200,
      y: (i + random()) / 12 * h,
      width: 320 + random() * 300,
      speed: 22 + random() * 26,
      phase: random() * 6,
      light: i % 3 !== 0,
    })) : [];
    if (this.condition === 'stormy' && !this.still) {
      this.scheduleFlash();
    }
    this.lastTime = performance.now();
    this.draw(this.lastTime);
  }

  private draw = (now: number) => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.time += this.still ? 0 : dt;
    const under = this.underRef.nativeElement.getContext('2d');
    const over = this.overRef.nativeElement.getContext('2d');
    if (!under || !over) {
      return;
    }
    const {width: w, height: h, condition} = this;
    under.clearRect(0, 0, w, h);
    over.clearRect(0, 0, w, h);
    this.wispsRef.nativeElement.getContext('2d')?.clearRect(0, 0, w, h);
    const move = this.still ? 0 : dt;

    switch (condition) {
      case 'rainy':
      case 'stormy':
        over.strokeStyle = 'rgba(190, 215, 235, 0.45)';
        over.lineWidth = 1.2;
        over.beginPath();
        for (const p of this.particles) {
          p.y += p.speed * move;
          p.x -= p.speed * move * 0.18;
          if (p.y > h) {
            p.y = -p.size;
            p.x = Math.random() * (w + 40);
          }
          over.moveTo(p.x, p.y);
          over.lineTo(p.x - p.size * 0.18, p.y + p.size);
        }
        over.stroke();
        if (this.bolt && now < this.bolt.until) {
          // Flickers by skipping the odd frame.
          if (Math.floor(now / 45) % 3 !== 1) {
            over.save();
            over.strokeStyle = 'rgba(235, 240, 255, 0.95)';
            over.shadowColor = 'rgba(180, 200, 255, 0.9)';
            over.shadowBlur = 18;
            over.lineWidth = 3;
            over.beginPath();
            this.bolt.points.forEach(([bx, by], i) => i ? over.lineTo(bx, by) : over.moveTo(bx, by));
            over.stroke();
            over.restore();
          }
        } else {
          this.bolt = null;
        }
        break;
      case 'snowy': {
        const frost = this.frost ??= this.paintFrost();
        if (frost) {
          over.drawImage(frost, 0, 0, w, h);
        }
        over.fillStyle = 'rgba(245, 248, 252, 0.85)';
        for (const p of this.particles) {
          p.y += p.speed * move;
          p.x += Math.sin(this.time * 1.2 + p.phase) * 10 * move;
          if (p.y > h) {
            p.y = -4;
            p.x = Math.random() * w;
          }
          over.beginPath();
          over.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          over.fill();
        }
        break;
      }
      case 'low-gravity':
      case 'inspired': {
        const gold = condition === 'inspired';
        for (const p of this.particles) {
          p.y -= p.speed * move;
          p.x += Math.sin(this.time + p.phase) * 6 * move;
          if (p.y < -4) {
            p.y = h + 4;
            p.x = Math.random() * w;
          }
          const alpha = gold ? 0.45 + 0.4 * Math.sin(this.time * 3 + p.phase * 4) : 0.35;
          under.fillStyle = gold ? `rgba(255, 213, 74, ${alpha})` : `rgba(200, 220, 255, ${alpha})`;
          under.beginPath();
          under.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          under.fill();
        }
        break;
      }
      case 'blessed': {
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.4);
        const light = under.createRadialGradient(w / 2, -h * 0.2, 0, w / 2, -h * 0.2, h * 1.2);
        light.addColorStop(0, `rgba(255, 230, 160, ${0.7 * pulse})`);
        light.addColorStop(0.55, `rgba(255, 215, 130, ${0.22 * pulse})`);
        light.addColorStop(1, 'rgba(255, 215, 130, 0)');
        under.fillStyle = light;
        under.fillRect(0, 0, w, h);
        break;
      }
      case 'hexed': {
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.4);
        const shadow = under.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.62);
        shadow.addColorStop(0, 'rgba(40, 10, 50, 0)');
        shadow.addColorStop(1, `rgba(30, 5, 45, ${0.8 * pulse})`);
        under.fillStyle = shadow;
        under.fillRect(0, 0, w, h);
        break;
      }
      case 'foggy':
        // Still, the wisps would stay put over fog that's been wiped away.
        if (this.still) {
          return;
        }
        if (this.fogged) {
          this.drawWisps(move);
        }
        break;
      default:
        return;
    }
    if (!this.still) {
      this.frameId = requestAnimationFrame(this.draw);
    }
  };

  /** Drifts the wisps along and draws them, masked to the fog that's left. */
  private drawWisps(move: number): void {
    const ctx = this.wispsRef.nativeElement.getContext('2d');
    const sprites = this.wispSprites ??= {light: wispSprite('rgba(255, 255, 255, 0.7)'), shade: wispSprite('rgba(105, 115, 130, 0.38)')};
    if (!ctx) {
      return;
    }
    const {width: w, height: h} = this;
    for (const wisp of this.wisps) {
      wisp.x += wisp.speed * move;
      if (wisp.x > w + wisp.width / 2) {
        wisp.x = -wisp.width / 2;
      }
      // Each wisp swells and thins a little as it goes.
      const swell = 1 + 0.12 * Math.sin(this.time * 0.4 + wisp.phase);
      const width = wisp.width * swell;
      const height = width * 0.38;
      const y = wisp.y + Math.sin(this.time * 0.25 + wisp.phase) * 14;
      ctx.drawImage(wisp.light ? sprites.light : sprites.shade, wisp.x - width / 2, y - height / 2, width, height);
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this.fogRef.nativeElement, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }

  private paintFrost(): HTMLCanvasElement | null {
    const canvas = document.createElement('canvas');
    canvas.width = this.overRef.nativeElement.width;
    canvas.height = this.overRef.nativeElement.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.scale(canvas.width / this.width, canvas.height / this.height);
    drawFrost(ctx, this.width, this.height);
    return canvas;
  }

  private scheduleFlash(): void {
    this.flashTimer = setTimeout(() => {
      this.flash();
      this.scheduleFlash();
    }, 6000 + Math.random() * 9000);
  }

  /** A single brief flash: well under the three-per-second limit for flashing content. */
  private flash(): void {
    this.zone.run(() => this.flashing = true);
    setTimeout(() => this.zone.run(() => this.flashing = false), 120);
  }

  private paintFog(): void {
    const ctx = this.fogRef.nativeElement.getContext('2d');
    if (!ctx || !this.width) {
      this.fogged = true;
      this.hinting = true;
      return;
    }
    const {width: w, height: h} = this;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(205, 212, 218, 0.94)';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < Math.round(w * h / 9000); i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 30 + Math.random() * 80;
      const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, `rgba(255, 255, 255, ${0.25 + Math.random() * 0.2})`);
      puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = puff;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.wipes = 0;
    this.fogged = true;
    this.hinting = true;
  }

  private wipe(event: PointerEvent): void {
    const canvas = this.fogRef.nativeElement;
    const ctx = canvas.getContext('2d');
    const brush = this.brush ??= wipeBrush();
    if (!ctx) {
      return;
    }
    const box = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = 'destination-out';
    // Every point the pointer passed since the last event, then the gaps between them filled in.
    const coalesced = event.getCoalescedEvents?.() ?? [];
    for (const point of coalesced.length ? coalesced : [event]) {
      const x = point.clientX - box.left;
      const y = point.clientY - box.top;
      const [fromX, fromY] = this.lastWipe ?? [x, y];
      const steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, y - fromY) / (WIPE_RADIUS / 4)));
      for (let i = 1; i <= steps; i++) {
        const bx = fromX + (x - fromX) * i / steps;
        const by = fromY + (y - fromY) * i / steps;
        ctx.drawImage(brush, bx - WIPE_RADIUS, by - WIPE_RADIUS, WIPE_RADIUS * 2, WIPE_RADIUS * 2);
      }
      this.lastWipe = [x, y];
    }
    ctx.globalCompositeOperation = 'source-over';
    // Checking coverage reads pixels, so only do it every few strokes.
    if (++this.wipes % 12 === 0 && this.fogCoverage() < 1 - FOG_CLEARED_AT) {
      this.zone.run(() => this.fogged = false);
    }
  }

  /** The share of the fog still there, sampled on a coarse grid. */
  private fogCoverage(): number {
    const canvas = this.fogRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !canvas.width) {
      return 0;
    }
    const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const step = 24;
    let covered = 0;
    let samples = 0;
    for (let y = 0; y < canvas.height; y += step) {
      for (let x = 0; x < canvas.width; x += step) {
        covered += data[(y * canvas.width + x) * 4 + 3] > 128 ? 1 : 0;
        samples++;
      }
    }
    return samples ? covered / samples : 0;
  }
}

/** A soft round brush, clear through the middle and feathered at the edge, stamped along each wipe. */
function wipeBrush(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  const brush = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  brush.addColorStop(0, 'rgba(0, 0, 0, 1)');
  brush.addColorStop(0.45, 'rgba(0, 0, 0, 0.85)');
  brush.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = brush;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

/** A soft cloud: many blurred puffs, fullest in the middle, so a stretched copy looks like a bank of fog. */
function wispSprite(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }
  ctx.filter = 'blur(8px)';
  const clear = color.replace(/[\d.]+\)$/, '0)');
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    // Bigger puffs toward the middle, tapering off at both ends.
    const r = 14 + 26 * Math.sin(Math.PI * t);
    const x = 40 + 176 * t;
    const y = 48 + Math.sin(i * 2.3) * 8;
    const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
    puff.addColorStop(0, color);
    puff.addColorStop(1, clear);
    ctx.fillStyle = puff;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return canvas;
}
