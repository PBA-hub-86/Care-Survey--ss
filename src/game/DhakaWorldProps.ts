import * as THREE from 'three';
import { createDhakaShopSignTexture } from './RoadTextures';

/**
 * Pre-allocated zero-GC particle emitter system for tire smoke, dust trails, and nitro boost flames.
 */
export class ParticleTrailSystem {
  public points: THREE.Points;
  private maxCount: number;
  private positions: Float32Array;
  private colors: Float32Array;
  private velocities: Float32Array;
  private ages: Float32Array;
  private maxAges: Float32Array;
  private baseR: Float32Array;
  private baseG: Float32Array;
  private baseB: Float32Array;
  private cursor = 0;

  constructor(
    scene: THREE.Scene,
    maxCount: number,
    size: number,
    additive: boolean
  ) {
    this.maxCount = maxCount;
    this.positions = new Float32Array(maxCount * 3);
    this.colors = new Float32Array(maxCount * 3);
    this.velocities = new Float32Array(maxCount * 3);
    this.ages = new Float32Array(maxCount);
    this.maxAges = new Float32Array(maxCount);
    this.baseR = new Float32Array(maxCount);
    this.baseG = new Float32Array(maxCount);
    this.baseB = new Float32Array(maxCount);

    for (let i = 0; i < maxCount; i++) {
      this.ages[i] = 999;
      this.maxAges[i] = 1;
      this.positions[i * 3 + 1] = -500;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const spriteTex = new THREE.CanvasTexture(canvas);
    spriteTex.colorSpace = THREE.SRGBColorSpace;
    spriteTex.needsUpdate = true;

    const mat = new THREE.PointsMaterial({
      size,
      map: spriteTex,
      vertexColors: true,
      transparent: true,
      opacity: additive ? 0.92 : 0.58,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geom, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  public emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    life: number
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.maxCount;
    const i3 = i * 3;
    this.positions[i3] = x;
    this.positions[i3 + 1] = y;
    this.positions[i3 + 2] = z;
    this.velocities[i3] = vx;
    this.velocities[i3 + 1] = vy;
    this.velocities[i3 + 2] = vz;
    this.baseR[i] = r;
    this.baseG[i] = g;
    this.baseB[i] = b;
    this.colors[i3] = r;
    this.colors[i3 + 1] = g;
    this.colors[i3 + 2] = b;
    this.ages[i] = 0;
    this.maxAges[i] = Math.max(0.05, life);
  }

  public update(dt: number, roadMovement: number) {
    let anyDirty = false;
    for (let i = 0; i < this.maxCount; i++) {
      if (this.ages[i] >= this.maxAges[i]) continue;
      anyDirty = true;
      this.ages[i] += dt;
      const i3 = i * 3;
      if (this.ages[i] >= this.maxAges[i]) {
        this.positions[i3 + 1] = -500;
        this.colors[i3] = 0;
        this.colors[i3 + 1] = 0;
        this.colors[i3 + 2] = 0;
        continue;
      }
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt + roadMovement;

      const fade = Math.max(0, 1 - this.ages[i] / this.maxAges[i]);
      this.colors[i3] = this.baseR[i] * fade;
      this.colors[i3 + 1] = this.baseG[i] * fade;
      this.colors[i3 + 2] = this.baseB[i] * fade;
    }
    if (anyDirty) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }

  public clear() {
    for (let i = 0; i < this.maxCount; i++) {
      this.ages[i] = 999;
      this.positions[i * 3 + 1] = -500;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  public dispose(scene: THREE.Scene) {
    scene.remove(this.points);
    this.points.geometry.dispose();
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}

const DHAKA_SHOPS = [
  { title: 'বিসমিল্লাহ জেনারেল স্টোর', sub: 'গ্রোসারি ও কোল্ড ড্রিংকস', bg: '#065f46', accent: '#facc15' },
  { title: 'মিরপুর চা ঘর', sub: '২৪ ঘণ্টা গরম চা ও নাস্তা', bg: '#7c2d12', accent: '#fde047' },
  { title: 'মেট্রো কেয়ার ফার্মেসী', sub: 'জরুরি ঔষধ ও হেলথ কেয়ার', bg: '#1e3a8a', accent: '#38bdf8' },
  { title: 'ঢাকা অটো ওয়ার্কশপ', sub: 'সিএনজি ও সুপারকার সার্ভিস', bg: '#991b1b', accent: '#ffffff' },
  { title: 'সকাল-সন্ধ্যা হোটেল', sub: 'কাচ্চি ও বাংলা খাবার', bg: '#701a75', accent: '#f9a8d4' },
  { title: 'তাজ বেকারি অ্যান্ড সুইটস', sub: 'টাটকা মিষ্টি ও কেক', bg: '#b45309', accent: '#fef08a' },
];

let cachedShopTextures: THREE.CanvasTexture[] = [];

export function disposeDhakaCachedShopTextures() {
  cachedShopTextures.forEach((t) => t.dispose());
  cachedShopTextures = [];
}

function getDhakaShopTex(idx: number): THREE.CanvasTexture {
  const i = idx % DHAKA_SHOPS.length;
  if (!cachedShopTextures[i]) {
    const s = DHAKA_SHOPS[i];
    cachedShopTextures[i] = createDhakaShopSignTexture(s.title, s.sub, s.bg, s.accent);
  }
  return cachedShopTextures[i];
}

/**
 * Builds a multi-story Dhaka commercial building with colorful ground-floor shop signboard & awning.
 */
export function createDhakaShopBuilding(
  w: number,
  h: number,
  d: number,
  side: number,
  isDay: boolean,
  shopIndex: number
): THREE.Group {
  const group = new THREE.Group();
  const facades = isDay
    ? [0xe2e8f0, 0xd6d3d1, 0xfef3c7, 0xcbd5e1, 0xfecdd3]
    : [0x1e293b, 0x0f172a, 0x1e1b4b, 0x172554];
  const wallColor = facades[shopIndex % facades.length];

  const buildingMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.78,
    metalness: 0.12,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
  body.position.y = h / 2;
  group.add(body);

  // Rooftop water tank (classic Dhaka skyline silhouette)
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.55 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.2, 10), tankMat);
  tank.position.set(0, h + 1.1, 0);
  group.add(tank);

  // Window rows
  const winMat = new THREE.MeshStandardMaterial({
    color: isDay ? 0x334155 : 0x38bdf8,
    emissive: isDay ? 0x000000 : 0x0284c7,
    emissiveIntensity: isDay ? 0 : 0.45,
    metalness: 0.75,
    roughness: 0.18,
  });
  for (let y = 7.5; y < h - 2; y += 5.5) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, d * 0.78), winMat);
    win.position.set(side < 0 ? w / 2 + 0.06 : -w / 2 - 0.06, y, 0);
    group.add(win);
  }

  // Ground floor Bengali Shop Signboard facing highway
  const signTex = getDhakaShopTex(shopIndex);
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(d * 0.85, 11), 3.1), signMat);
  const roadFacingX = side < 0 ? w / 2 + 0.18 : -w / 2 - 0.18;
  signFace.position.set(roadFacingX, 3.6, 0);
  signFace.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(signFace);

  // Corrugated shop awning
  const awningMat = new THREE.MeshStandardMaterial({
    color: shopIndex % 2 === 0 ? 0x059669 : 0xdc2626,
    roughness: 0.65,
  });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, Math.min(d * 0.88, 11.4)), awningMat);
  awning.position.set(side < 0 ? w / 2 + 0.65 : -w / 2 - 0.65, 2.1, 0);
  awning.rotation.z = side < 0 ? -0.18 : 0.18;
  group.add(awning);

  return group;
}

/**
 * Builds a 3D yellow/black striped Dhaka Speed Breaker across the highway lanes.
 */
export function createSpeedBreakerGroup(
  breakerTex: THREE.CanvasTexture,
  zebraTex: THREE.CanvasTexture
): THREE.Group {
  const group = new THREE.Group();

  // Raised asphalt/rubber speed bump mound
  const bumpGeo = new THREE.CylinderGeometry(0.32, 0.45, 21.5, 8, 1, false, 0, Math.PI);
  const bumpMat = new THREE.MeshStandardMaterial({
    map: breakerTex,
    roughness: 0.72,
    metalness: 0.1,
  });
  const bump = new THREE.Mesh(bumpGeo, bumpMat);
  bump.rotation.z = Math.PI / 2;
  bump.rotation.y = Math.PI / 2;
  bump.scale.set(1.0, 0.38, 1.0);
  bump.position.set(0, 0.03, 0);
  group.add(bump);

  // Adjacent Zebra Crossing stripes
  const zebra = new THREE.Mesh(
    new THREE.PlaneGeometry(20.5, 3.8),
    new THREE.MeshBasicMaterial({
      map: zebraTex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  zebra.rotation.x = -Math.PI / 2;
  zebra.position.set(0, 0.025, 3.2);
  group.add(zebra);

  return group;
}

/**
 * Builds a roadside Bus Stop Shelter + Waiting/Drop-off glowing zone beacon + waving 3D passenger.
 */
export function createPassengerBusStop(isDropoff: boolean): THREE.Group {
  const group = new THREE.Group();

  const accentHex = isDropoff ? 0xf59e0b : 0x10b981;
  const beamColor = isDropoff ? 0xfbbf24 : 0x34d399;

  // 1. Glowing lane pickup/dropoff ring on right lane shoulder (x = 7.4 relative to road center)
  const zoneRing = new THREE.Mesh(
    new THREE.RingGeometry(1.75, 2.35, 28),
    new THREE.MeshBasicMaterial({
      color: beamColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    })
  );
  zoneRing.rotation.x = -Math.PI / 2;
  zoneRing.position.set(7.4, 0.04, 0);
  group.add(zoneRing);

  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.72, 24),
    new THREE.MeshBasicMaterial({
      color: accentHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.25,
    })
  );
  innerDisc.rotation.x = -Math.PI / 2;
  innerDisc.position.set(7.4, 0.035, 0);
  group.add(innerDisc);

  // Vertical translucent beacon column so player spots stop from 200m away
  const beaconBeam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.85, 7.5, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: beamColor,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beaconBeam.position.set(7.4, 3.8, 0);
  group.add(beaconBeam);

  // 2. Dhaka Passenger Shelter (যাত্রী ছাউনি) on sidewalk at x = +15.8
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
  const roofMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.45, metalness: 0.25 });

  [-2.2, 2.2].forEach((pz) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.9, 8), steelMat);
    post.position.set(15.6, 1.45, pz);
    group.add(post);
  });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.16, 5.2), roofMat);
  roof.position.set(15.2, 2.92, 0);
  group.add(roof);

  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.42, 3.6), steelMat);
  bench.position.set(15.4, 0.35, 0);
  group.add(bench);

  // 3. Waiting / Drop-off NPC Passenger standing near curb with waving arm (for pickups)
  if (!isDropoff) {
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.7 });
    const pantMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.65 });

    const pax = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.75, 0.2), pantMat);
    legs.position.y = 0.42;
    pax.add(legs);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.24), shirtMat);
    torso.position.y = 1.08;
    pax.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), skinMat);
    head.position.y = 1.52;
    pax.add(head);

    const waveArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.52, 0.12), shirtMat);
    waveArm.position.set(-0.32, 1.48, 0);
    waveArm.rotation.z = 0.55;
    pax.name = 'WaitingPassenger';
    pax.add(waveArm);

    pax.position.set(13.6, 0.12, 0);
    group.add(pax);
  }

  return group;
}
