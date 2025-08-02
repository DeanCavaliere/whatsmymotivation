import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener, Input, OnDestroy,
  ViewChild,
} from '@angular/core';
import {ConfettiService} from "./confetti.service";

@Component({
  selector: 'app-confetti',
  template: '<canvas #canvas class="money-canvas"></canvas>',
  styles: [`
    .money-canvas {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      pointer-events: none;
      z-index: 9999;
      overflow: hidden;
    }
  `]
})
export class ConfettiComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  /** Duration of the animation in milliseconds */
  @Input() duration: number = 3000;

  /** Image filenames (relative to /assets/confetti/) */
  @Input() imageFilenames: string[] = ['confetti.png']; // , 'coin.png', 'cash.png'

  /** Size range in pixels */
  @Input() minSize = 30;
  @Input() maxSize = 80;

  private ctx!: CanvasRenderingContext2D;
  private bills: any[] = [];
  private images: HTMLImageElement[] = [];
  private animationFrameId: number = 0;
  private stopTimeoutId: any;
  private fading = false;
  private fadeStartTime = 0;
  private fadeDuration = 1000;

  constructor(private configService: ConfettiService) {

  }

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.resizeCanvas();
    this.loadImages().then(() => {
      console.log('loadImages Done',this.images.map(x => x.src));
    });

    this.configService.triggerConfettiObservable.subscribe(imageUrls => {
      console.log('triggerConfettiObservable', imageUrls);

      this.startRain(imageUrls);
      this.stopTimeoutId = setTimeout(() => {
        this.beginFadeOut();

        setTimeout(() => {
          this.destroy();
          if (this.stopTimeoutId) {
            clearTimeout(this.stopTimeoutId);
          }
          this.fading = false;
          this.fadeStartTime = 0;
          this.fadeDuration = 1000;
          this.animationFrameId = 0;
        }, 1000)
      }, this.duration);
    })
  }

  private resizeCanvas() {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private async loadImages(): Promise<void> {
    const loadImage = (src: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.src = `assets/confetti/${src}`;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });

    this.images = await Promise.all(this.imageFilenames.map(loadImage));
  }

  private startRain(imageUrls: string[]) {
    const canvas = this.canvasRef.nativeElement;

    for (let i = 0; i < 30; i++) {
      const image = this.getRandomImage(imageUrls);
      const scaleSize = this.getRandomSize();
      const aspectRatio = image.width / image.height;

      let drawWidth = scaleSize;
      let drawHeight = scaleSize;

      if (aspectRatio > 1) {
        drawHeight = scaleSize / aspectRatio;
      } else {
        drawWidth = scaleSize * aspectRatio;
      }

      this.bills.push({
        x: Math.random() * canvas.width,
        y: Math.random() * -canvas.height,
        speed: 2 + Math.random() * 3,
        rotation: Math.random() * 360,
        rotationSpeed: 1 + Math.random() * 3,
        image,
        width: drawWidth,
        height: drawHeight,
        opacity: 1
      });
    }

    this.draw();
  }

  private draw = () => {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = performance.now();
    const fadeElapsed = now - this.fadeStartTime;

    this.bills.forEach(bill => {
      bill.y += bill.speed;
      bill.rotation += bill.rotationSpeed;

      if (bill.y > canvas.height) {
        bill.y = -100;
        bill.x = Math.random() * canvas.width;
      }

      if (this.fading) {
        bill.opacity = 1 - Math.min(fadeElapsed / this.fadeDuration, 1);
      }

      this.ctx.save();
      this.ctx.globalAlpha = bill.opacity;
      this.ctx.translate(bill.x, bill.y);
      this.ctx.rotate((bill.rotation * Math.PI) / 180);
      this.ctx.drawImage(bill.image, -bill.width / 2, -bill.height / 2, bill.width, bill.height);
      this.ctx.restore();
    });

    if (this.fading && fadeElapsed >= this.fadeDuration) {
      this.destroy(); // fully faded
    } else {
      this.animationFrameId = requestAnimationFrame(this.draw);
    }
  };

  private getRandomImage(imageUrls: string[]): HTMLImageElement {
    let imgs = this.images.filter(image => imageUrls.find(x => image.src.includes(x)));
    const index = Math.floor(Math.random() * imgs.length);
    return imgs[index];
  }

  private getRandomSize(): number {
    return this.minSize + Math.random() * (this.maxSize - this.minSize);
  }

  private beginFadeOut() {
    this.fading = true;
    this.fadeStartTime = performance.now();
  }

  private destroy() {
    cancelAnimationFrame(this.animationFrameId);
    this.bills = [];
    this.ctx.clearRect(0, 0, this.canvasRef.nativeElement.width, this.canvasRef.nativeElement.height);
  }

  ngOnDestroy(): void {
    this.destroy();
    if (this.stopTimeoutId) {
      clearTimeout(this.stopTimeoutId);
    }
  }
}
