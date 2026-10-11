import {AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, ChangeDetectionStrategy} from '@angular/core';
import {Subscription} from 'rxjs';
import {ConfettiKind, ConfettiService} from './confetti.service';

interface Piece {
  x: number;
  y: number;
  /** Pixels per second. */
  speed: number;
  drift: number;
  rotation: number;
  /** Degrees per second. */
  rotationSpeed: number;
  width: number;
  height: number;
  color: string | null;
}

const COLORS = ['#ef1d27', '#009ee3', '#1f9c48', '#ffcd06'];
const TEAR_IMAGE = 'assets/img/confetti/crying.webp';

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

  /** How long pieces keep falling before fading, in milliseconds. */
  @Input() duration = 3000;
  @Input() fadeDuration = 1000;
  @Input() count = 40;

  private ctx: CanvasRenderingContext2D | null = null;
  private pieces: Piece[] = [];
  private tearImage: HTMLImageElement | null = null;
  private frameId = 0;
  private startTime = 0;
  private lastTime = 0;
  private subscription?: Subscription;
  private reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  constructor(private confetti: ConfettiService, private zone: NgZone) {
  }

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d');
    this.subscription = this.confetti.trigger$.subscribe(kind => this.zone.runOutsideAngular(() => this.start(kind)));
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.stop();
  }

  private start(kind: ConfettiKind): void {
    if (!this.ctx || this.reducedMotion?.matches) {
      return;
    }
    if (kind === 'tears' && !this.tearImage?.complete) {
      // Loaded on first use so it never competes with the initial page load.
      this.tearImage = new Image();
      this.tearImage.onload = () => this.start(kind);
      this.tearImage.src = TEAR_IMAGE;
      return;
    }

    cancelAnimationFrame(this.frameId);
    const {width, height} = this.resize();
    this.pieces = Array.from({length: this.count}, () => this.createPiece(kind, width, height));
    this.startTime = this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.draw);
  }

  private createPiece(kind: ConfettiKind, width: number, height: number): Piece {
    const tears = kind === 'tears';
    const size = tears ? 34 + Math.random() * 30 : 10 + Math.random() * 10;
    return {
      x: Math.random() * width,
      y: -Math.random() * height - size,
      speed: (tears ? 160 : 180) + Math.random() * 180,
      drift: (Math.random() - 0.5) * 60,
      rotation: Math.random() * 360,
      rotationSpeed: (tears ? 40 : 120) + Math.random() * 200,
      width: size,
      height: tears ? size * 0.65 : size * 0.4,
      color: tears ? null : COLORS[Math.floor(Math.random() * COLORS.length)],
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

    const elapsed = now - this.startTime;
    const fadeProgress = Math.max(0, elapsed - this.duration) / this.fadeDuration;
    if (fadeProgress >= 1) {
      this.stop();
      return;
    }
    const alpha = 1 - fadeProgress;

    ctx.clearRect(0, 0, width, height);
    for (const p of this.pieces) {
      p.y += p.speed * dt;
      p.x += p.drift * dt;
      p.rotation += p.rotationSpeed * dt;
      if (p.y - p.height > height) {
        p.y = -p.height;
        p.x = Math.random() * width;
      }

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      if (p.color) {
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
      } else if (this.tearImage) {
        const h = p.width * (this.tearImage.naturalHeight / this.tearImage.naturalWidth);
        ctx.drawImage(this.tearImage, -p.width / 2, -h / 2, p.width, h);
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
