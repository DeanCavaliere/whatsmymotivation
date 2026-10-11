import {AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {Subscription} from 'rxjs';
import {ConfettiKind, ConfettiService, ConfettiTrigger} from './confetti.service';

interface Piece {
  x: number;
  y: number;
  /** Pixels per second. */
  vx: number;
  vy: number;
  rotation: number;
  /** Degrees per second. */
  rotationSpeed: number;
  width: number;
  height: number;
  color: string;
  star: boolean;
}

interface Physics {
  count: number;
  /** How long pieces fly before fading, then how long the fade takes, in milliseconds. */
  duration: number;
  fade: number;
}

const PHYSICS: Record<ConfettiKind, Physics> = {
  'big-burst': {count: 150, duration: 900, fade: 1200},
  'burst': {count: 50, duration: 600, fade: 900},
  'fall': {count: 40, duration: 3000, fade: 1000},
};

const GOLD = ['#ffd54a', '#ffbf2e', '#fff1b0'];
const FALL_COLORS = ['#ef1d27', '#009ee3', '#1f9c48', '#ffcd06'];
/** Burst speed decays by e^-DRAG per second, so a piece travels about speed / DRAG pixels. */
const DRAG = 2.1;
const GRAVITY = 320;

@Component({
    selector: 'app-confetti',
    template: '<canvas #canvas aria-hidden="true"></canvas>',
    styles: [`
    canvas {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    }
  `],
    changeDetection: ChangeDetectionStrategy.Eager
})
export class ConfettiComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx: CanvasRenderingContext2D | null = null;
  private pieces: Piece[] = [];
  private kind: ConfettiKind = 'burst';
  private frameId = 0;
  private startTime = 0;
  private lastTime = 0;
  private subscription?: Subscription;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor(private confetti: ConfettiService, private zone: NgZone) {
  }

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d');
    this.subscription = this.confetti.trigger$.subscribe(t => this.zone.runOutsideAngular(() => this.start(t)));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.stop();
  }

  private start({kind, origin}: ConfettiTrigger): void {
    if (!this.ctx || this.reducedMotion?.matches) {
      return;
    }
    cancelAnimationFrame(this.frameId);
    const {width, height} = this.resize();
    const from = origin ?? {x: width / 2, y: height / 2};
    // Bursts use the app's accent, read at the moment of the roll.
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || GOLD[0];
    this.kind = kind;
    this.pieces = Array.from({length: PHYSICS[kind].count}, () =>
      kind === 'fall' ? this.fallingPiece(width, height) : this.burstPiece(kind, from, Math.min(width, height), accent));
    this.startTime = this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.draw);
  }

  private burstPiece(kind: ConfettiKind, from: { x: number; y: number }, spread: number, accent: string): Piece {
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.35 + Math.random() * 0.65) * spread * (kind === 'big-burst' ? 1.25 : 0.8);
    const size = 5 + Math.random() * 7;
    const colors = [accent, accent, ...GOLD];
    return {
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed,
      // A slight upward bias, so the burst arcs up before gravity takes over.
      vy: Math.sin(angle) * speed - speed * 0.35,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 900,
      width: size,
      height: size * 0.55,
      color: colors[Math.floor(Math.random() * colors.length)],
      star: Math.random() < 0.18,
    };
  }

  private fallingPiece(width: number, height: number): Piece {
    const size = 10 + Math.random() * 10;
    return {
      x: Math.random() * width,
      y: -Math.random() * height - size,
      vx: (Math.random() - 0.5) * 60,
      vy: 180 + Math.random() * 180,
      rotation: Math.random() * 360,
      rotationSpeed: 120 + Math.random() * 200,
      width: size,
      height: size * 0.4,
      color: FALL_COLORS[Math.floor(Math.random() * FALL_COLORS.length)],
      star: false,
    };
  }

  /** Sizes the backing store to the device pixel ratio so pieces stay sharp. */
  private resize(): { width: number, height: number } {
    const canvas = this.canvasRef.nativeElement;
    const dpr = this.dpr();
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    this.ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {width, height};
  }

  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  private draw = (now: number) => {
    const ctx = this.ctx!;
    const canvas = this.canvasRef.nativeElement;
    let width = window.innerWidth;
    let height = window.innerHeight;
    if (canvas.width !== Math.round(width * this.dpr()) || canvas.height !== Math.round(height * this.dpr())) {
      // Window resized or phone rotated mid-animation.
      ({width, height} = this.resize());
    }
    // Clamp so a backgrounded tab doesn't teleport every piece on return.
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const {duration, fade} = PHYSICS[this.kind];
    const fadeProgress = Math.max(0, now - this.startTime - duration) / fade;
    if (fadeProgress >= 1) {
      this.stop();
      return;
    }
    const falling = this.kind === 'fall';
    const damping = Math.exp(-DRAG * dt);

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1 - fadeProgress;
    for (const p of this.pieces) {
      if (!falling) {
        p.vx *= damping;
        p.vy = p.vy * damping + GRAVITY * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      if (falling && p.y - p.height > height) {
        p.y = -p.height;
        p.x = Math.random() * width;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.star) {
        drawStar(ctx, p.width * 0.9);
      } else {
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      }
      ctx.restore();
    }
    this.frameId = requestAnimationFrame(this.draw);
  };

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.pieces = [];
    const canvas = this.canvasRef.nativeElement;
    this.ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/** A four-pointed sparkle. */
function drawStar(ctx: CanvasRenderingContext2D, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? radius * 0.3 : radius;
    ctx.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r);
  }
  ctx.fill();
}
