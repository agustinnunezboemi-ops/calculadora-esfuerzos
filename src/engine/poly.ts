/**
 * Polinomios en una variable (la variable local x_i de cada tramo).
 * c[k] es el coeficiente de x^k.
 */
export class Poly {
  readonly c: number[];

  constructor(coefs: number[] = [0]) {
    const c = coefs.length ? [...coefs] : [0];
    while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-12) c.pop();
    this.c = c;
  }

  static const(a: number): Poly {
    return new Poly([a]);
  }

  /** a + b·x */
  static linear(a: number, b: number): Poly {
    return new Poly([a, b]);
  }

  get degree(): number {
    return this.c.length - 1;
  }

  add(o: Poly): Poly {
    const n = Math.max(this.c.length, o.c.length);
    const r: number[] = [];
    for (let i = 0; i < n; i++) r.push((this.c[i] ?? 0) + (o.c[i] ?? 0));
    return new Poly(r);
  }

  sub(o: Poly): Poly {
    return this.add(o.scale(-1));
  }

  scale(k: number): Poly {
    return new Poly(this.c.map((v) => v * k));
  }

  mul(o: Poly): Poly {
    const r = new Array(this.c.length + o.c.length - 1).fill(0);
    this.c.forEach((a, i) => o.c.forEach((b, j) => (r[i + j] += a * b)));
    return new Poly(r);
  }

  /** Primitiva con constante nula. */
  integrate(): Poly {
    return new Poly([0, ...this.c.map((v, i) => v / (i + 1))]);
  }

  derivative(): Poly {
    if (this.c.length === 1) return Poly.const(0);
    return new Poly(this.c.slice(1).map((v, i) => v * (i + 1)));
  }

  eval(x: number): number {
    let r = 0;
    for (let i = this.c.length - 1; i >= 0; i--) r = r * x + this.c[i];
    return r;
  }

  /** Raíces reales dentro de (a, b), para grado ≤ 2. */
  rootsIn(a: number, b: number, tol = 1e-9): number[] {
    const [c0, c1 = 0, c2 = 0] = this.c;
    let roots: number[] = [];
    if (this.degree === 1) roots = [-c0 / c1];
    else if (this.degree === 2) {
      const disc = c1 * c1 - 4 * c2 * c0;
      if (disc >= -1e-12) {
        const s = Math.sqrt(Math.max(0, disc));
        roots = [(-c1 + s) / (2 * c2), (-c1 - s) / (2 * c2)];
      }
    } else if (this.degree > 2) {
      throw new Error('rootsIn solo admite grado ≤ 2');
    }
    return [...new Set(roots.map((r) => +r.toFixed(12)))].filter((r) => r > a + tol && r < b - tol).sort((p, q) => p - q);
  }

  /** Igualdad de coeficientes con tolerancia relativa a la escala dada. */
  approxEquals(o: Poly, scale = 1, tol = 1e-7): boolean {
    const d = this.sub(o);
    return d.c.every((v) => Math.abs(v) <= tol * Math.max(1, scale));
  }
}
