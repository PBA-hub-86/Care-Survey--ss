import * as THREE from 'three';

/**
 * Ultra-Realistic Procedural 3D Highway Vehicles:
 * 1. Highway Express Touring Coach (Modern intercity luxury bus)
 * 2. Heavy 18-Wheeler Semi-Truck & Container Trailer
 * 3. Modern Executive SUV / 4x4
 * 4. High-Performance GT Sports Coupe
 * 5. Commuter Transit Van
 */
export class HighwayVehicles {
  /**
   * Ultra-Realistic Intercity Luxury Express Coach
   * Aerodynamic touring bus with panoramic tinted glass, chrome trim, and 6 alloy wheels
   */
  public static createHighwayExpressCoach(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'HighwayExpressCoach';
    const w = 2.5;
    const h = 2.45;
    const l = 8.2;

    const paintColors = [0x0284c7, 0xdc2626, 0x16a34a, 0x4f46e5, 0x0f172a, 0x7c3aed];
    const coachPaint = paintColors[Math.floor(Math.random() * paintColors.length)];

    const bodyMat = new THREE.MeshStandardMaterial({
      color: coachPaint,
      roughness: 0.25,
      metalness: 0.45,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.2,
      metalness: 0.3,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.95,
      roughness: 0.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.8,
    });

    // 1. Lower Chassis & Aerodynamic Skirts
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, l), bodyMat);
    lowerBody.position.y = 1.0;
    group.add(lowerBody);

    // Dynamic Sweeping Side Accent Stripe
    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.38, l * 0.98), accentMat);
    sideStripe.position.y = 1.15;
    group.add(sideStripe);

    // Front Aerodynamic Curved Nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 1.15, 0.65), bodyMat);
    nose.position.set(0, 1.05, -l / 2 - 0.25);
    group.add(nose);

    // Front Chrome Grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.12), chromeMat);
    grille.position.set(0, 0.72, -l / 2 - 0.58);
    group.add(grille);

    // 2. Panoramic Tinted Windows & Cabin
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.92,
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.98, l * 0.95), glassMat);
    cabin.position.set(0, 2.1, 0);
    group.add(cabin);

    // Aerodynamic Sloped Windshield
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, 0.95), glassMat);
    windshield.rotation.x = 0.22;
    windshield.position.set(0, 2.1, -l / 2 - 0.22);
    group.add(windshield);

    // Digital LED Destination Display: [ HIGHWAY EXPRESS ]
    const destCanvas = document.createElement('canvas');
    destCanvas.width = 512; destCanvas.height = 100;
    const dctx = destCanvas.getContext('2d');
    if (dctx) {
      dctx.fillStyle = '#0f172a';
      dctx.fillRect(0, 0, 512, 100);
      dctx.strokeStyle = '#38bdf8';
      dctx.lineWidth = 4;
      dctx.strokeRect(4, 4, 504, 92);
      dctx.fillStyle = '#fde047';
      dctx.font = 'bold 36px sans-serif';
      dctx.textAlign = 'center';
      dctx.fillText('EXPRESS INTERCITY', 256, 46);
      dctx.fillStyle = '#38bdf8';
      dctx.font = 'bold 26px sans-serif';
      dctx.fillText('HIGHWAY TRANSIT COACH', 256, 84);
    }
    const destSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.48),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(destCanvas) })
    );
    destSign.position.set(0, 2.56, -l / 2 - 0.16);
    group.add(destSign);

    // 3. Roof & Climate Control Pod
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.18, l * 0.96), bodyMat);
    roof.position.set(0, 2.65, 0);
    group.add(roof);

    const acPod = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 1.8), darkMat);
    acPod.position.set(0, 2.8, 0.5);
    group.add(acPod);

    // 4. Headlights & Taillights
    [-0.92, 0.92].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(hx, 0.76, -l / 2 - 0.55);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, 1.45, l / 2 + 0.03);
      group.add(tl);
    });

    // 5. 6 Wheels with Chrome Hubcaps
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
    const wheelGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
    const hubGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.32, 12);

    [
      [-w / 2 - 0.05, -2.6], [w / 2 + 0.05, -2.6],
      [-w / 2 - 0.05, 1.9], [w / 2 + 0.05, 1.9],
      [-w / 2 - 0.05, 3.1], [w / 2 + 0.05, 3.1],
    ].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeom, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(hubGeom, chromeMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      wg.position.set(wx, 0.5, wz);
      group.add(wg);
    });

    return group;
  }

  /**
   * Ultra-Realistic Highway 18-Wheeler Semi-Truck & Container Trailer
   * Massive tractor cab, chrome smokestacks, and 40ft container trailer
   */
  public static createSemiTruckTrailer(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'SemiTruckTrailer';
    const w = 2.6;
    const cabL = 3.6;
    const trailerL = 8.5;

    const cabColors = [0xdc2626, 0x2563eb, 0x15803d, 0xd97706, 0x475569];
    const cabPaint = cabColors[Math.floor(Math.random() * cabColors.length)];

    const cabMat = new THREE.MeshStandardMaterial({ color: cabPaint, metalness: 0.6, roughness: 0.3 });
    const trailerMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.5 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.1 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
    const wheelGeom = new THREE.CylinderGeometry(0.52, 0.52, 0.32, 16);

    // 1. Tractor Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, cabL), cabMat);
    cab.position.set(0, 1.6, -4.8);
    group.add(cab);

    // Front Chrome Monster Grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 0.2), chromeMat);
    grille.position.set(0, 1.25, -4.8 - cabL / 2 - 0.1);
    group.add(grille);

    // Chrome Bumper
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 0.45, 0.3), chromeMat);
    bumper.position.set(0, 0.5, -4.8 - cabL / 2 - 0.15);
    group.add(bumper);

    // Vertical Dual Chrome Exhaust Smokestacks
    [-w / 2 - 0.15, w / 2 + 0.15].forEach((sx) => {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4, 12), chromeMat);
      stack.position.set(sx, 2.4, -4.8 + cabL / 2 - 0.2);
      group.add(stack);
    });

    // 2. 40ft Shipping Container Trailer
    const trailer = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 2.8, trailerL), trailerMat);
    trailer.position.set(0, 2.2, 1.6);
    group.add(trailer);

    // Container Corrugation Ribs
    for (let rz = -trailerL / 2 + 0.6; rz < trailerL / 2 - 0.4; rz += 0.8) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 2.7, 0.08), chromeMat);
      rib.position.set(0, 2.2, 1.6 + rz);
      group.add(rib);
    }

    // 3. Headlights & Rear Lights
    [-0.95, 0.95].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(hx, 0.9, -4.8 - cabL / 2 - 0.18);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.45, 0.1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, 1.0, 1.6 + trailerL / 2 + 0.05);
      group.add(tl);
    });

    // 4. Wheels (Tractor & Trailer Axles)
    const wheelPositions = [
      // Tractor Front
      [-w / 2 - 0.06, -6.1], [w / 2 + 0.06, -6.1],
      // Tractor Dual Rear
      [-w / 2 - 0.06, -3.8], [w / 2 + 0.06, -3.8],
      [-w / 2 - 0.06, -2.6], [w / 2 + 0.06, -2.6],
      // Trailer Dual Rear
      [-w / 2 - 0.06, 4.2], [w / 2 + 0.06, 4.2],
      [-w / 2 - 0.06, 5.4], [w / 2 + 0.06, 5.4],
    ];

    wheelPositions.forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeom, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.34, 12), chromeMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      wg.position.set(wx, 0.52, wz);
      group.add(wg);
    });

    return group;
  }

  /**
   * Ultra-Realistic Executive Highway SUV
   */
  public static createHighwaySUV(paintColor?: number): THREE.Group {
    const group = new THREE.Group();
    group.name = 'HighwaySUV';
    const w = 1.95;
    const h = 0.95;
    const l = 4.4;

    const paint = paintColor ?? [0x0f172a, 0xf8fafc, 0x1e3a8a, 0x475569, 0xb91c1c][Math.floor(Math.random() * 5)];
    const bodyMat = new THREE.MeshStandardMaterial({ color: paint, metalness: 0.8, roughness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.9, roughness: 0.08 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });

    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.7, l), bodyMat);
    lower.position.y = 0.65;
    group.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.88, 0.68, l * 0.58), glassMat);
    cabin.position.set(0, 1.25, 0.1);
    group.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.08, l * 0.52), bodyMat);
    roof.position.set(0, 1.62, 0.1);
    group.add(roof);

    // Roof Rails
    [-w * 0.38, w * 0.38].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, l * 0.48), chromeMat);
      rail.position.set(rx, 1.68, 0.1);
      group.add(rail);
    });

    // Front Grille & Headlights
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.1), chromeMat);
    grille.position.set(0, 0.72, -l / 2 - 0.04);
    group.add(grille);

    [-w * 0.36, w * 0.36].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(hx, 0.75, -l / 2 - 0.04);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, 0.85, l / 2 + 0.04);
      group.add(tl);
    });

    // 4 Wheels
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const wheelGeom = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 16);
    [
      [-w / 2 - 0.04, -1.4], [w / 2 + 0.04, -1.4],
      [-w / 2 - 0.04, 1.4], [w / 2 + 0.04, 1.4],
    ].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeom, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 12), chromeMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      wg.position.set(wx, 0.42, wz);
      group.add(wg);
    });

    return group;
  }

  private static dhakaBusTexCache: THREE.CanvasTexture[] = [];
  private static truckArtTexCache: THREE.CanvasTexture[] = [];

  private static getDhakaBusSignTexture(idx: number): THREE.CanvasTexture {
    if (this.dhakaBusTexCache[idx]) return this.dhakaBusTexCache[idx];
    const routes = [
      { name: 'বলাকা পরিবহন', route: 'সদরঘাট ↔ গাজীপুর', bg: '#065f46', accent: '#facc15' },
      { name: 'বিআরটিসি এসি বাস', route: 'মতিঝিল ↔ উত্তরা', bg: '#991b1b', accent: '#ffffff' },
      { name: 'মিরপুর মেট্রো লিংক', route: 'মিরপুর ১০ ↔ শাহবাগ', bg: '#1e3a8a', accent: '#38bdf8' },
      { name: 'রাইদা এক্সপ্রেস', route: 'দিয়াবাড়ী ↔ পোস্তগোলা', bg: '#166534', accent: '#fde047' },
    ];
    const r = routes[idx % routes.length];
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = r.bg;
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = r.accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = r.accent;
    ctx.font = 'bold 38px "Hind Siliguri", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(r.name, 256, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px "Hind Siliguri", sans-serif';
    ctx.fillText(r.route, 256, 102);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.dhakaBusTexCache[idx] = tex;
    return tex;
  }

  private static getBangladeshiTruckArtTexture(idx: number): THREE.CanvasTexture {
    if (this.truckArtTexCache[idx]) return this.truckArtTexCache[idx];
    const palettes = [
      ['#dc2626', '#facc15', '#16a34a', '#2563eb'],
      ['#db2777', '#fde047', '#059669', '#0284c7'],
      ['#ea580c', '#fef08a', '#0d9488', '#7c3aed'],
    ];
    const pal = palettes[idx % palettes.length];
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = pal[0];
    ctx.fillRect(0, 0, 512, 256);

    // Colorful border & folk-art geometric triangles
    ctx.fillStyle = pal[1];
    ctx.fillRect(0, 0, 512, 24);
    ctx.fillRect(0, 232, 512, 24);
    for (let x = 0; x < 512; x += 32) {
      ctx.fillStyle = (x / 32) % 2 === 0 ? pal[2] : pal[3];
      ctx.beginPath();
      ctx.moveTo(x, 24);
      ctx.lineTo(x + 16, 62);
      ctx.lineTo(x + 32, 24);
      ctx.closePath();
      ctx.fill();
    }
    // Decorative floral medallions
    [110, 256, 402].forEach((cx) => {
      ctx.fillStyle = pal[1];
      ctx.beginPath();
      ctx.arc(cx, 134, 42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal[2];
      ctx.beginPath();
      ctx.arc(cx, 134, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal[3];
      ctx.beginPath();
      ctx.arc(cx, 134, 12, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Hind Siliguri", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('মা-বাবার দোয়া · পরিবহন', 256, 214);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.truckArtTexCache[idx] = tex;
    return tex;
  }

  /**
   * 1. Colorful Dhaka City Commuter Bus (ঢাকা সিটি বাস)
   */
  public static createDhakaCityBus(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'DhakaCityBus';
    const w = 2.45;
    const l = 8.4;

    const liveryIdx = Math.floor(Math.random() * 4);
    const bodyColors = [0x059669, 0xdc2626, 0x2563eb, 0x16a34a];
    const stripeColors = [0xfacc15, 0xffffff, 0x38bdf8, 0xf97316];

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColors[liveryIdx],
      roughness: 0.35,
      metalness: 0.3,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: stripeColors[liveryIdx],
      roughness: 0.3,
      metalness: 0.2,
    });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });

    // Lower hull
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 1.35, l), bodyMat);
    lower.position.y = 1.02;
    group.add(lower);

    // Painted racing/city stripe along flank
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.28, l * 0.98), stripeMat);
    stripe.position.y = 1.15;
    group.add(stripe);

    // Window band
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.97, 0.92, l * 0.95), glassMat);
    cabin.position.y = 2.12;
    group.add(cabin);

    // Window pillars for authentic Dhaka city bus look
    for (let pz = -l / 2 + 0.8; pz <= l / 2 - 0.8; pz += 1.25) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.94, 0.14), bodyMat);
      pillar.position.set(0, 2.12, pz);
      group.add(pillar);
    }

    // Roof + rooftop carrier rack
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.14, l * 0.97), roofMat);
    roof.position.y = 2.65;
    group.add(roof);

    const carrier = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 4.6), steelMat);
    carrier.position.set(0, 2.8, 0.4);
    group.add(carrier);

    // Heavy front/rear steel bumper guards
    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.28, 0.24), steelMat);
    frontBumper.position.set(0, 0.55, -l / 2 - 0.1);
    group.add(frontBumper);

    // Bengali route signboard above windshield & rear
    const signTex = this.getDhakaBusSignTexture(liveryIdx);
    const frontSign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 0.44),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    frontSign.position.set(0, 2.6, -l / 2 - 0.02);
    group.add(frontSign);

    const rearSign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 0.42),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    rearSign.rotation.y = Math.PI;
    rearSign.position.set(0, 2.15, l / 2 + 0.03);
    group.add(rearSign);

    // Headlights & Taillights
    [-0.85, 0.85].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xfffbeb }));
      hl.position.set(hx, 0.78, -l / 2 - 0.03);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.08), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, 1.1, l / 2 + 0.03);
      group.add(tl);
    });

    // 6 Bus Wheels
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88 });
    const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.28, 14);
    const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 10);
    [
      [-w / 2 - 0.04, -2.7], [w / 2 + 0.04, -2.7],
      [-w / 2 - 0.04, 1.9], [w / 2 + 0.04, 1.9],
      [-w / 2 - 0.04, 3.0], [w / 2 + 0.04, 3.0],
    ].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const rim = new THREE.Mesh(rimGeo, steelMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);
      wg.position.set(wx, 0.48, wz);
      group.add(wg);
    });

    return group;
  }

  /**
   * 2. Iconic Dhaka Green CNG Auto-Rickshaw (সিএনজি অটোরিকশা)
   */
  public static createDhakaCNG(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'DhakaCNG';
    const w = 1.42;
    const l = 2.65;

    const greenBodyMat = new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.45, roughness: 0.35 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.72 });
    const yellowTrimMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const cageMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.25 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.8 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });

    // Lower tub body
    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.62, l * 0.78), greenBodyMat);
    lower.position.set(0, 0.56, 0.22);
    group.add(lower);

    // Front tapered Bajaj nose cowling
    const frontCowling = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.78, 0.78), greenBodyMat);
    frontCowling.position.set(0, 0.65, -0.95);
    group.add(frontCowling);

    // Front yellow safety bumper strip
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.14), yellowTrimMat);
    bumper.position.set(0, 0.42, -1.32);
    group.add(bumper);

    // Front mudguard
    const mudguard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.52), yellowTrimMat);
    mudguard.position.set(0, 0.36, -1.05);
    group.add(mudguard);

    // Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.52, 0.08), glassMat);
    windshield.position.set(0, 1.24, -0.85);
    windshield.rotation.x = 0.24;
    group.add(windshield);

    // Signature green CNG cage bars
    [-0.68, 0.68].forEach((sx) => {
      [-0.55, 0.15, 0.95].forEach((sz) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.82, 6), cageMat);
        post.position.set(sx, 1.25, sz);
        group.add(post);
      });
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.6), cageMat);
      sideRail.position.set(sx, 1.08, 0.2);
      group.add(sideRail);
    });

    // Arched Soft Canopy Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, 0.16, l * 0.88), canopyMat);
    roof.position.set(0, 1.66, 0.1);
    group.add(roof);

    // Central Front Headlamp + Twin Rear Tail Lights
    const headlamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
    );
    headlamp.rotation.x = Math.PI / 2;
    headlamp.position.set(0, 0.72, -1.36);
    group.add(headlamp);

    [-0.48, 0.48].forEach((tx) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(tx, 0.65, 1.28);
      group.add(tl);
    });

    // 3 Wheels (1 Front + 2 Rear)
    const tireGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12);
    const rimGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.18, 8);
    [[0, -1.04], [-w / 2 - 0.02, 0.88], [w / 2 + 0.02, 0.88]].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const rim = new THREE.Mesh(rimGeo, cageMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);
      wg.position.set(wx, 0.24, wz);
      group.add(wg);
    });

    return group;
  }

  /**
   * 3. Authentic Bangladeshi Cycle Rickshaw (প্যাডেল রিকশা)
   */
  public static createCycleRickshaw(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'CycleRickshaw';
    const hoodColors = [0xdc2626, 0x2563eb, 0xdb2777, 0x059669];
    const hoodColor = hoodColors[Math.floor(Math.random() * hoodColors.length)];

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.35 });
    const hoodMat = new THREE.MeshStandardMaterial({ color: hoodColor, roughness: 0.65 });
    const artMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.65 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.75 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 });

    // Rear passenger cabin base & painted backboard
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.14, 1.35), frameMat);
    chassis.position.set(0, 0.38, 0.48);
    group.add(chassis);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.22, 0.62), seatMat);
    seat.position.set(0, 0.56, 0.68);
    group.add(seat);

    const backArt = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.58, 0.1), artMat);
    backArt.position.set(0, 0.76, 1.06);
    group.add(backArt);

    // Colorful folding canopy hood
    const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.14, 0.96), hoodMat);
    hoodTop.position.set(0, 1.56, 0.66);
    hoodTop.rotation.x = -0.14;
    group.add(hoodTop);

    const hoodBack = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.78, 0.1), hoodMat);
    hoodBack.position.set(0, 1.24, 1.08);
    group.add(hoodBack);

    // Front neck tube & handlebars
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.3), frameMat);
    neck.position.set(0, 0.48, -0.45);
    group.add(neck);

    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.78, 8), frameMat);
    fork.position.set(0, 0.66, -1.04);
    fork.rotation.x = 0.25;
    group.add(fork);

    const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.05, 0.05), spokeMat);
    handlebar.position.set(0, 1.02, -0.94);
    group.add(handlebar);

    // Rickshaw puller figure pedaling at front
    const pullerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.22), shirtMat);
    pullerTorso.position.set(0, 1.04, -0.52);
    pullerTorso.rotation.x = 0.22;
    group.add(pullerTorso);

    const pullerHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), skinMat);
    pullerHead.position.set(0, 1.4, -0.58);
    group.add(pullerHead);

    // Front headlight + Rear reflector
    const frontLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
    frontLight.position.set(0, 0.82, -1.08);
    group.add(frontLight);

    const rearRefl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    rearRefl.position.set(0, 0.56, 1.14);
    group.add(rearRefl);

    // 3 Large Spoked Wheels
    const rimGeo = new THREE.TorusGeometry(0.34, 0.045, 8, 16);
    const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8);
    [[0, -1.12], [-0.62, 0.68], [0.62, 0.68]].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const rim = new THREE.Mesh(rimGeo, tireMat);
      rim.rotation.y = Math.PI / 2;
      wg.add(rim);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.04), spokeMat);
      wg.add(spoke);
      const spoke2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.62), spokeMat);
      wg.add(spoke2);
      const hub = new THREE.Mesh(hubGeo, spokeMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      wg.position.set(wx, 0.36, wz);
      group.add(wg);
    });

    return group;
  }

  /**
   * 4. Battery Easy-Bike (ইজিবাইক / টমটম)
   */
  public static createEasyBike(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'EasyBike';
    const w = 1.46;
    const l = 2.85;
    const colors = [0x0284c7, 0xdc2626, 0x0d9488, 0x7c3aed];
    const bodyPaint = colors[Math.floor(Math.random() * colors.length)];

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyPaint, metalness: 0.45, roughness: 0.32 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.85 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.48, l * 0.8), bodyMat);
    deck.position.set(0, 0.48, 0.22);
    group.add(deck);

    const frontFace = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.78, 0.56), bodyMat);
    frontFace.position.set(0, 0.64, -1.04);
    group.add(frontFace);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.64, 0.08), glassMat);
    windshield.position.set(0, 1.32, -1.06);
    windshield.rotation.x = 0.2;
    group.add(windshield);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.1, l * 0.92), whiteMat);
    roof.position.set(0, 1.72, 0.08);
    group.add(roof);

    [-w * 0.44, w * 0.44].forEach((px) => {
      [-0.95, 0.05, 1.05].forEach((pz) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), steelMat);
        post.position.set(px, 1.24, pz);
        group.add(post);
      });
    });

    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(0, 0.72, -1.34);
    group.add(hl);

    [-0.5, 0.5].forEach((tx) => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(tx, 0.56, 1.38);
      group.add(tl);
    });

    const tireGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12);
    [[0, -1.1], [-w / 2 - 0.03, 0.94], [w / 2 + 0.03, 0.94]].forEach(([wx, wz]) => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(wx, 0.26, wz);
      group.add(tire);
    });

    return group;
  }

  /**
   * 5. Traditional Colorful Painted Bangladeshi Truck (বাংলার ঐতিহ্যবাহী রঙিন ট্রাক)
   */
  public static createBangladeshiTruck(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'BangladeshiTruck';
    const w = 2.48;
    const l = 7.6;
    const idx = Math.floor(Math.random() * 3);

    const artTex = this.getBangladeshiTruckArtTexture(idx);
    const artMat = new THREE.MeshStandardMaterial({ map: artTex, roughness: 0.48, metalness: 0.15 });
    const cabMat = new THREE.MeshStandardMaterial({ color: idx === 0 ? 0xdc2626 : idx === 1 ? 0x0284c7 : 0xea580c, roughness: 0.35, metalness: 0.45 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const tarpMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.88 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.9, roughness: 0.15 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.85 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.88 });

    // Ornate Truck Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 1.75, 2.2), cabMat);
    cab.position.set(0, 1.38, -2.55);
    group.add(cab);

    const cabRoofSign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.42, 0.4), artMat);
    cabRoofSign.position.set(0, 2.46, -2.9);
    group.add(cabRoofSign);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.62, 0.1), glassMat);
    windshield.position.set(0, 1.76, -3.66);
    group.add(windshield);

    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 0.12), chromeMat);
    grille.position.set(0, 1.02, -3.68);
    group.add(grille);

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.34, 0.25), artMat);
    bumper.position.set(0, 0.48, -3.72);
    group.add(bumper);

    // Colorful Painted Folk-Art Cargo Box + Loaded Tarp
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w, 1.65, 4.9), artMat);
    bed.position.set(0, 1.52, 1.15);
    group.add(bed);

    const cargoTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.85, 4.75), tarpMat);
    cargoTop.position.set(0, 2.68, 1.15);
    group.add(cargoTop);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.18, 4.95), woodMat);
    rail.position.set(0, 2.34, 1.15);
    group.add(rail);

    // Headlights & Taillights
    [-0.88, 0.88].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      hl.position.set(hx, 0.9, -3.68);
      group.add(hl);

      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.08), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, 0.85, 3.64);
      group.add(tl);
    });

    // 6 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.3, 14);
    const hubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 10);
    [
      [-w / 2 - 0.04, -2.55], [w / 2 + 0.04, -2.55],
      [-w / 2 - 0.04, 1.2], [w / 2 + 0.04, 1.2],
      [-w / 2 - 0.04, 2.45], [w / 2 + 0.04, 2.45],
    ].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const hub = new THREE.Mesh(hubGeo, chromeMat);
      hub.rotation.z = Math.PI / 2;
      wg.add(hub);
      wg.position.set(wx, 0.48, wz);
      group.add(wg);
    });

    return group;
  }
}
