import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {
  CarConfig,
  GameStats,
  CashMission,
  RoadTheme,
  GlobalUpgrades,
  DynamicWeatherType,
  WeatherState,
  PassengerMissionState,
  GameEndReason,
} from '../types/game';
import { sound } from '../audio/sound';
import {
  INITIAL_MISSIONS,
  INITIAL_ROAD_THEMES,
  INITIAL_UPGRADES,
  DHAKA_BUS_STOPS,
  DHAKA_PASSENGER_NAMES,
} from '../data/cars';
import { PedestrianManager } from './Pedestrians';
import { HighwayVehicles } from './HighwayVehicles';
import {
  ParticleTrailSystem,
  createDhakaShopBuilding,
  createSpeedBreakerGroup,
  createPassengerBusStop,
  disposeDhakaCachedShopTextures,
} from './DhakaWorldProps';
import {
  createHighwayRoadTextureSet,
  createFlyoverTextureSet,
  createTerrainTextureSet,
  createContactShadowTexture,
  createHeadlightBeamTexture,
  createSpeedBreakerTexture,
  createZebraCrossingTexture,
  RoadTextureBundle,
  TerrainTextureBundle,
} from './RoadTextures';

// Custom screen-space radial speed motion blur shader
const SpeedMotionBlurShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.42) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    uniform vec2 uCenter;
    varying vec2 vUv;

    void main() {
      if (uStrength <= 0.002) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      vec2 dir = vUv - uCenter;
      float dist = length(dir);
      // Keep central focus crisp while streaking outer edges dynamically
      float radialMask = smoothstep(0.16, 0.65, dist);
      vec2 stepVec = dir * uStrength * radialMask * 0.065;
      vec4 sum = vec4(0.0);
      sum += texture2D(tDiffuse, vUv - stepVec * 3.0) * 0.08;
      sum += texture2D(tDiffuse, vUv - stepVec * 2.0) * 0.14;
      sum += texture2D(tDiffuse, vUv - stepVec * 1.0) * 0.20;
      sum += texture2D(tDiffuse, vUv) * 0.24;
      sum += texture2D(tDiffuse, vUv + stepVec * 1.0) * 0.18;
      sum += texture2D(tDiffuse, vUv + stepVec * 2.0) * 0.11;
      sum += texture2D(tDiffuse, vUv + stepVec * 3.0) * 0.05;
      gl_FragColor = sum;
    }
  `,
};

type TrafficVehicleKind =
  | 'dhaka_bus'
  | 'cng'
  | 'rickshaw'
  | 'easybike'
  | 'bd_truck'
  | 'bus'
  | 'truck'
  | 'police'
  | 'car'
  | 'suv';

interface TrafficCar {
  group: THREE.Group;
  lane: number;
  currentX: number;
  targetLane: number;
  laneChangeTimer: number;
  speed: number;
  isPolice: boolean;
  policeLights?: { r: THREE.PointLight; b: THREE.PointLight };
  passed: boolean;
  cycle: number;
  width: number;
  length: number;
  vehicleType: TrafficVehicleKind;
}

interface RoadPickup {
  group: THREE.Group;
  type: 'nitro' | 'fuel' | 'repair' | 'cash_bundle';
  lane: number;
  z: number;
  value: number;
  active: boolean;
}

interface SpeedBreakerEntity {
  group: THREE.Group;
  z: number;
  triggered: boolean;
}

interface PassengerStopEntity {
  group: THREE.Group;
  z: number;
  isDropoff: boolean;
  active: boolean;
  wavePhase: number;
}

interface Debris {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private motionBlurPass: ShaderPass | null = null;
  private isSoftwareGl = false;

  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private maxAnisotropy = 4;
  private clock: THREE.Clock;
  private reqId: number | null = null;

  // Active Car, Theme & Upgrades
  private activeCar: CarConfig;
  private currentTheme: RoadTheme;
  private upgrades: GlobalUpgrades;

  // Player Visual Groups & Suspension Mechanics
  private playerGroup: THREE.Group | null = null;
  private playerBodyShell: THREE.Group | null = null;
  private frontWheelSteerPivots: THREE.Group[] = [];
  private playerWheels: THREE.Group[] = [];
  private headlightPoolMesh: THREE.Mesh | null = null;
  private contactShadowTex: THREE.CanvasTexture | null = null;
  private headlightBeamTex: THREE.CanvasTexture | null = null;
  private leftExhaust: THREE.Mesh | null = null;
  private rightExhaust: THREE.Mesh | null = null;
  private underglowLight: THREE.PointLight | null = null;

  // Dynamic Suspension Springs
  private suspensionY = 0;
  private suspensionVelY = 0;
  private suspensionPitch = 0;
  private suspensionRoll = 0;
  private currentSteerAngle = 0;

  // Animated Windshield Wipers
  private leftWiper: THREE.Mesh | null = null;
  private rightWiper: THREE.Mesh | null = null;
  private wiperAngle = 0;

  // 4D Dynamic Particle Systems
  private tireSmokeParticles: ParticleTrailSystem;
  private dustTrailParticles: ParticleTrailSystem;
  private nitroFlameParticles: ParticleTrailSystem;
  private particleSpawnAccum = 0;

  // Pedestrian Sidewalk & Walking Manager
  private pedestrianManager: PedestrianManager;

  // Environment Meshes & Procedural PBR Textures
  private roadMesh: THREE.Mesh | null = null;
  private groundMesh: THREE.Mesh | null = null;
  private roadTexBundle: RoadTextureBundle | null = null;
  private flyoverTexBundle: RoadTextureBundle | null = null;
  private terrainTexBundle: TerrainTextureBundle | null = null;
  private speedBreakerTex: THREE.CanvasTexture | null = null;
  private zebraCrossingTex: THREE.CanvasTexture | null = null;

  private roadLines: THREE.Group[] = [];
  private guardrails: THREE.Group[] = [];
  private streetLamps: THREE.Group[] = [];
  private buildings: THREE.Group[] = [];
  private roadsideTrees: THREE.Group[] = [];
  private speedBreakers: SpeedBreakerEntity[] = [];
  private passengerStops: PassengerStopEntity[] = [];

  private cloudsGroup: THREE.Group | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private sunMesh: THREE.Mesh | null = null;
  private sunGlowMesh: THREE.Mesh | null = null;
  private stars: THREE.Points | null = null;
  private weatherParticles: THREE.Points | null = null;
  private weatherPositions: Float32Array | null = null;

  // Metro Rail Viaduct & Overhead Signboards
  private metroRailPillars: THREE.Group[] = [];
  private metroTrain: THREE.Group | null = null;
  private overheadSignboards: THREE.Group[] = [];

  // Coastal Highway Scenery & Ocean
  private marineDriveObjects: THREE.Group[] = [];
  private oceanMesh: THREE.Mesh | null = null;
  private oceanTime = 0;
  private rainPuddles: THREE.Mesh[] = [];
  private radioNewsTimer = 0;

  // Secondary Elevated Flyover Road & Moving Traffic
  private secondaryRoadMesh: THREE.Mesh | null = null;
  private secondaryRoadPillars: THREE.Group[] = [];
  private secondaryGuardrails: THREE.Group[] = [];
  private secondaryRoadLines: THREE.Mesh[] = [];
  private secondaryTraffic: Array<{
    group: THREE.Group;
    baseX: number;
    y: number;
    lane: number;
    z: number;
    speed: number;
    direction: 1 | -1;
  }> = [];

  // Overpass Crossing Bridges
  private overpassBridges: THREE.Group[] = [];
  private overpassTraffic: Array<{
    group: THREE.Group;
    x: number;
    baseZ: number;
    y: number;
    speed: number;
    direction: 1 | -1;
  }> = [];

  // Audio & Horns
  private trafficHornTimer = 2.5;
  private spatialAudioTimer = 0;
  private timerBeepAccum = 0;

  // Dynamic Weather Engine
  public currentWeatherType: DynamicWeatherType = 'clear';
  private weatherTimer = 0;
  private weatherDuration = 0;
  private nextWeatherInterval = 20;
  private lightningTimer = 0;
  private weatherAlert: { title: string; subtitle: string; icon: string; color: string } | null = null;
  private weatherAlertTimer = 0;
  private targetFogDensity = 0.0024;
  private targetFogColor: THREE.Color = new THREE.Color(0x87ceeb);
  private targetAmbientColor: THREE.Color = new THREE.Color(0xffffff);
  private targetAmbientIntensity = 1.0;

  // Lights
  private ambientLight: THREE.AmbientLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private dirLightA: THREE.DirectionalLight | null = null;
  private dirLightB: THREE.DirectionalLight | null = null;

  // Gameplay State
  public isRunning = false;
  public isPaused = false;
  public isBoosting = false;
  public isBraking = false;

  private lane = 0; // -2, -1, 0, 1, 2
  private targetX = 0;
  private readonly laneWidth = 3.2;

  // Metrics & Survival State
  public score = 0;
  public distance = 0;
  public speed = 160;
  public maxSpeedAchieved = 160;
  public nitro = 100;
  public health = 100;
  public maxHealth = 100;
  public fuel = 100;
  public maxFuel = 100;
  public countdownTimer = 50;
  public xp = 0;
  public driverLevel = 1;
  public passengersDropped = 0;
  public shields = 5;
  public maxShields = 5;
  public combo = 1;
  public comboTimer = 0;
  public nearMisses = 0;
  public cashCollectedThisRun = 0;
  private currentFov = 65;

  // Passenger Pickup / Drop-off Mission State
  private passengerMission: PassengerMissionState = {
    status: 'none',
    passengerName: '',
    pickupStopName: '',
    destinationName: '',
    fareTaka: 0,
    xpReward: 0,
    distanceRemaining: 0,
    timeRemaining: 0,
    needsSlowDown: false,
  };
  private passengerSpawnCooldown = 5.0;

  // Police Pursuit & Spawns
  public policeActive = false;
  private policeChaseIntensity = 0;
  private policeTimer = 0;
  private policeSpawnedInChase = false;
  private spawnTimer = 0;
  private pickupTimer = 0;
  private pickupCycleIndex = 0;
  private cameraShake = 0;
  private invulnerableTimer = 0;
  private lastCashDistanceChunk = 0;
  private lastTimerDistanceChunk = 0;
  private crashTimeoutId: number | null = null;
  private lightningTimeouts: number[] = [];

  // Mission
  public activeMissionIndex = 0;
  public missions: CashMission[] = INITIAL_MISSIONS.map((m) => ({ ...m, progress: 0 }));

  // Entities
  private traffic: TrafficCar[] = [];
  private pickups: RoadPickup[] = [];
  private debrisList: Debris[] = [];

  // Callbacks
  private onStatsUpdate: (stats: GameStats) => void;
  private onCrash: (reason: GameEndReason) => void;
  private onCashCollected: (amount: number, label: string) => void;
  private onNearMissOvertake: (combo: number, bonusTaka: number, label?: string) => void;
  private onMissionComplete: (mission: CashMission) => void;

  // Replay System
  public isReplaying = false;
  private replayIndex = 0;
  private onReplayFinished: (() => void) | null = null;
  public replayFrames: Array<{
    playerX: number;
    playerRotY: number;
    playerRotZ: number;
    speed: number;
    roadMovement: number;
    distance: number;
  }> = [];

  constructor(
    canvas: HTMLCanvasElement,
    car: CarConfig,
    theme: RoadTheme = INITIAL_ROAD_THEMES[0],
    upgrades: GlobalUpgrades = INITIAL_UPGRADES,
    callbacks: {
      onStatsUpdate: (stats: GameStats) => void;
      onCrash: (reason: GameEndReason) => void;
      onCashCollected: (amount: number, label: string) => void;
      onNearMissOvertake: (combo: number, bonusTaka: number, label?: string) => void;
      onMissionComplete: (mission: CashMission) => void;
    }
  ) {
    this.canvas = canvas;
    this.activeCar = car;
    this.currentTheme = theme;
    this.upgrades = upgrades;

    this.maxShields = car.maxShields ?? 5;
    this.shields = this.maxShields;

    this.onStatsUpdate = callbacks.onStatsUpdate;
    this.onCrash = callbacks.onCrash;
    this.onCashCollected = callbacks.onCashCollected;
    this.onNearMissOvertake = callbacks.onNearMissOvertake;
    this.onMissionComplete = callbacks.onMissionComplete;

    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.pedestrianManager = new PedestrianManager(this.scene);

    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1500);
    this.camera.position.set(0, 4.8, 9.8);
    this.camera.rotation.x = -0.22;

    // Detect software GL so heavy post-processing & MSAA don't stall frame pacing
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
      this.isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererStr);
    } catch {}

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 4);

    // Post-processing pipeline (UnrealBloom + Radial Speed Motion Blur on hardware WebGL)
    if (!this.isSoftwareGl) {
      try {
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
          new THREE.Vector2(window.innerWidth, window.innerHeight),
          0.32,
          0.55,
          0.88
        );
        this.composer.addPass(this.bloomPass);

        this.motionBlurPass = new ShaderPass(SpeedMotionBlurShader);
        this.composer.addPass(this.motionBlurPass);
      } catch {
        this.composer = null;
      }
    }

    // Procedural Studio/Sky IBL reflections for metallic clearcoat vehicles & wet asphalt
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envRenderTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.scene.environment = this.envRenderTarget.texture;
      this.scene.environmentIntensity = 0.78;
      pmrem.dispose();
    } catch {}

    this.contactShadowTex = createContactShadowTexture();
    this.headlightBeamTex = createHeadlightBeamTexture();
    this.speedBreakerTex = createSpeedBreakerTexture();
    this.zebraCrossingTex = createZebraCrossingTexture();

    // Pre-allocated 4D Particle Emitters
    this.tireSmokeParticles = new ParticleTrailSystem(this.scene, 140, 1.35, false);
    this.dustTrailParticles = new ParticleTrailSystem(this.scene, 120, 0.85, false);
    this.nitroFlameParticles = new ParticleTrailSystem(this.scene, 160, 1.15, true);

    this.setupLighting();
    this.applyTheme();
    this.buildPlayerCar();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    this.animate();
  }

  private enableShadowCasting(obj: THREE.Object3D) {
    if (this.isSoftwareGl) return;
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      }
    });
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (!m) return;
          const std = m as THREE.MeshStandardMaterial;
          if (
            std.map &&
            std.map.userData?.disposable &&
            std.map !== this.roadTexBundle?.map &&
            std.map !== this.flyoverTexBundle?.map &&
            std.map !== this.terrainTexBundle?.map &&
            std.map !== this.contactShadowTex &&
            std.map !== this.headlightBeamTex &&
            std.map !== this.speedBreakerTex &&
            std.map !== this.zebraCrossingTex
          ) {
            std.map.dispose();
          }
          m.dispose();
        });
      }
    });
    this.scene.remove(obj);
  }

  public updateCar(newCar: CarConfig) {
    this.activeCar = newCar;
    this.maxShields = newCar.maxShields ?? 5;
    this.shields = this.maxShields;
    this.buildPlayerCar();
  }

  public updateTheme(newTheme: RoadTheme) {
    this.currentTheme = newTheme;
    this.applyTheme();
  }

  public updateUpgrades(newUpgrades: GlobalUpgrades) {
    this.upgrades = newUpgrades;
  }

  public updateUnderglow(colorHex: string) {
    this.activeCar.underglow = colorHex;
    if (this.underglowLight) {
      this.underglowLight.color.set(colorHex);
    }
  }

  private setupLighting() {
    this.ambientLight = new THREE.AmbientLight(this.currentTheme.ambientLight, 0.9);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.65);
    this.scene.add(this.hemiLight);

    this.dirLightA = new THREE.DirectionalLight(this.currentTheme.dirLightA, 1.55);
    this.dirLightA.position.set(28, 48, -16);
    if (!this.isSoftwareGl) {
      this.dirLightA.castShadow = true;
      this.dirLightA.shadow.mapSize.set(1024, 1024);
      this.dirLightA.shadow.camera.near = 6;
      this.dirLightA.shadow.camera.far = 160;
      this.dirLightA.shadow.camera.left = -26;
      this.dirLightA.shadow.camera.right = 26;
      this.dirLightA.shadow.camera.top = 38;
      this.dirLightA.shadow.camera.bottom = -22;
      this.dirLightA.shadow.bias = -0.0005;
      this.dirLightA.shadow.normalBias = 0.025;
    }
    this.scene.add(this.dirLightA);
    this.scene.add(this.dirLightA.target);

    this.dirLightB = new THREE.DirectionalLight(this.currentTheme.dirLightB, 0.95);
    this.dirLightB.position.set(-50, 55, -50);
    this.scene.add(this.dirLightB);
  }

  private isDayTheme(): boolean {
    const s = this.currentTheme.skyType;
    return s === 'dhaka_day' || s === 'daytime' || s === 'coxsbazar_marine';
  }

  private applyTheme() {
    this.scene.background = new THREE.Color(this.currentTheme.fogColor);
    this.scene.fog = new THREE.FogExp2(this.currentTheme.fogColor, this.currentTheme.fogDensity);

    const isDayLike = this.isDayTheme();

    if (this.ambientLight) {
      this.ambientLight.color.setHex(this.currentTheme.ambientLight);
      this.ambientLight.intensity = isDayLike ? 0.95 : 0.72;
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(this.currentTheme.dirLightA);
      this.hemiLight.groundColor.setHex(this.currentTheme.roadColor);
      this.hemiLight.intensity = isDayLike ? 0.82 : 0.48;
    }
    if (this.dirLightA) {
      this.dirLightA.color.setHex(this.currentTheme.dirLightA);
      this.dirLightA.intensity = isDayLike ? 1.65 : 1.3;
    }
    if (this.dirLightB) {
      this.dirLightB.color.setHex(this.currentTheme.dirLightB);
    }

    this.buildRoad();
    this.updateWeatherTargets();
    this.buildSky();
    this.buildWeatherParticles();
    this.buildCity();
    this.buildHighwaySkyTrain();
    this.buildHighwaySignboards();
    this.buildCoastalHighway();
    this.buildSecondaryFlyoverRoad(1500);
    this.buildOverpassBridges();
  }

  private buildSky() {
    if (this.stars) {
      this.disposeObject(this.stars);
      this.stars = null;
    }
    if (this.skyMesh) {
      this.disposeObject(this.skyMesh);
      this.skyMesh = null;
    }
    if (this.sunMesh) {
      this.disposeObject(this.sunMesh);
      this.sunMesh = null;
    }
    if (this.sunGlowMesh) {
      this.disposeObject(this.sunGlowMesh);
      this.sunGlowMesh = null;
    }
    if (this.cloudsGroup) {
      this.disposeObject(this.cloudsGroup);
      this.cloudsGroup = null;
    }

    if (this.isDayTheme()) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        if (this.currentTheme.skyType === 'dhaka_day') {
          grad.addColorStop(0, '#1d6fd6');
          grad.addColorStop(0.45, '#59a6f8');
          grad.addColorStop(0.8, '#b5d8f7');
          grad.addColorStop(1, '#f3ebd8'); // Warm Dhaka horizon haze
        } else {
          grad.addColorStop(0, '#1a73e8');
          grad.addColorStop(0.45, '#56a5fc');
          grad.addColorStop(0.8, '#a0cfff');
          grad.addColorStop(1, '#e3f2fd');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);
      }
      const skyTex = new THREE.CanvasTexture(canvas);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      skyTex.userData.disposable = true;
      this.skyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(750, 32, 16),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide })
      );
      this.scene.add(this.skyMesh);

      this.sunMesh = new THREE.Mesh(
        new THREE.CircleGeometry(42, 32),
        new THREE.MeshBasicMaterial({ color: 0xfffbe6, transparent: true, opacity: 0.95 })
      );
      this.sunMesh.position.set(110, 160, -560);
      this.scene.add(this.sunMesh);

      this.sunGlowMesh = new THREE.Mesh(
        new THREE.CircleGeometry(85, 32),
        new THREE.MeshBasicMaterial({ color: 0xffea88, transparent: true, opacity: 0.28 })
      );
      this.sunGlowMesh.position.set(110, 160, -562);
      this.scene.add(this.sunGlowMesh);

      this.cloudsGroup = new THREE.Group();
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
        transparent: true,
        opacity: 0.88,
      });

      for (let c = 0; c < 14; c++) {
        const cloud = new THREE.Group();
        const numPuffs = 4 + Math.floor(Math.random() * 4);
        for (let p = 0; p < numPuffs; p++) {
          const r = 10 + Math.random() * 11;
          const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), cloudMat);
          puff.position.set(
            (p - numPuffs / 2) * 14 + (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 9
          );
          cloud.add(puff);
        }
        cloud.position.set((Math.random() - 0.5) * 580, 92 + Math.random() * 75, -200 - Math.random() * 500);
        this.cloudsGroup.add(cloud);
      }
      this.scene.add(this.cloudsGroup);
    } else {
      const starCount = 1100;
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 1000;
        pos[i + 1] = 20 + Math.random() * 300;
        pos[i + 2] = -150 - Math.random() * 1100;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.stars = new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: 0x8ceeff, size: 0.75, transparent: true, opacity: 0.8 })
      );
      this.scene.add(this.stars);

      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#c2f9ff');
        grad.addColorStop(0.35, '#00eaff');
        grad.addColorStop(0.7, '#9d4edd');
        grad.addColorStop(1, '#ff0077');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 256);
      }
      const moonTex = new THREE.CanvasTexture(canvas);
      moonTex.colorSpace = THREE.SRGBColorSpace;
      moonTex.userData.disposable = true;
      this.sunMesh = new THREE.Mesh(
        new THREE.CircleGeometry(105, 48),
        new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, opacity: 0.92 })
      );
      this.sunMesh.position.set(0, 65, -550);
      this.scene.add(this.sunMesh);
    }
  }

  private updateWeatherTargets() {
    const isRainTheme = this.currentTheme.weather === 'rain';
    const isDayLike = this.isDayTheme();

    if (this.currentWeatherType === 'rain') {
      this.targetFogDensity = 0.0085;
      this.targetFogColor.setHex(0x334155);
      this.targetAmbientColor.setHex(0x64748b);
      this.targetAmbientIntensity = 0.72;
      this.scene.environmentIntensity = 0.95;
      if (this.roadMesh) {
        const mat = this.roadMesh.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.28;
        mat.metalness = 0.25;
      }
    } else if (this.currentWeatherType === 'fog') {
      this.targetFogDensity = 0.017;
      this.targetFogColor.setHex(0xcfd8dc);
      this.targetAmbientColor.setHex(0xb0bec5);
      this.targetAmbientIntensity = 0.95;
      this.scene.environmentIntensity = 0.55;
      if (this.roadMesh) {
        const mat = this.roadMesh.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.72;
        mat.metalness = 0.1;
      }
    } else if (this.currentWeatherType === 'neon_snow') {
      this.targetFogDensity = 0.009;
      this.targetFogColor.setHex(0x180b2b);
      this.targetAmbientColor.setHex(0xa855f7);
      this.targetAmbientIntensity = 1.05;
      this.scene.environmentIntensity = 0.85;
      if (this.roadMesh) {
        const mat = this.roadMesh.material as THREE.MeshStandardMaterial;
        mat.roughness = 0.36;
        mat.metalness = 0.22;
      }
    } else {
      this.targetFogDensity = this.currentTheme.fogDensity;
      this.targetFogColor.setHex(this.currentTheme.fogColor);
      this.targetAmbientColor.setHex(this.currentTheme.ambientLight);
      this.targetAmbientIntensity = isDayLike ? 0.95 : 0.75;
      this.scene.environmentIntensity = isRainTheme ? 0.92 : isDayLike ? 0.78 : 0.62;
      if (this.roadMesh) {
        const mat = this.roadMesh.material as THREE.MeshStandardMaterial;
        mat.roughness = isRainTheme ? 0.32 : 0.86;
        mat.metalness = isRainTheme ? 0.22 : 0.08;
      }
    }
  }

  public setWeather(type: DynamicWeatherType) {
    if (this.currentWeatherType === type) return;
    this.currentWeatherType = type;

    this.updateWeatherTargets();
    this.buildWeatherParticles();
    sound.playWeatherAlert(type);

    if (type === 'rain') {
      this.weatherAlert = {
        title: '🌧️ ঝুম বৃষ্টি শুরু!',
        subtitle: 'পিচ্ছিল রাস্তা (-22% গ্রিপ) | +25% স্কোর',
        icon: '🌧️',
        color: 'from-blue-600/95 to-cyan-700/95',
      };
    } else if (type === 'fog') {
      this.weatherAlert = {
        title: '🌫️ ঘন কুয়াশা নেমেছে!',
        subtitle: 'দৃষ্টিসীমা কম | +40% স্কোর',
        icon: '🌫️',
        color: 'from-slate-700/95 to-gray-800/95',
      };
    } else if (type === 'neon_snow') {
      this.weatherAlert = {
        title: '❄️ নিয়ন তুষারপাত!',
        subtitle: 'আইসি ড্রিফট (-38% গ্রিপ) | +50% স্কোর',
        icon: '❄️',
        color: 'from-purple-700/95 to-pink-700/95',
      };
    } else {
      this.weatherAlert = {
        title: '☀️ পরিষ্কার আবহাওয়া!',
        subtitle: '১০০% গ্রিপ ফিরে এসেছে',
        icon: '☀️',
        color: 'from-amber-600/95 to-yellow-600/95',
      };
    }
    this.weatherAlertTimer = 3.8;
  }

  public getWeatherState(): WeatherState {
    switch (this.currentWeatherType) {
      case 'rain':
        return {
          type: 'rain',
          name: 'বৃষ্টিপাত',
          icon: '🌧️',
          effectLabel: 'পিচ্ছিল (-22% গ্রিপ)',
          gripFactor: 0.78,
          bonusMultiplier: 1.25,
        };
      case 'fog':
        return {
          type: 'fog',
          name: 'ঘন কুয়াশা',
          icon: '🌫️',
          effectLabel: 'কম দৃশ্যমানতা',
          gripFactor: 0.94,
          bonusMultiplier: 1.4,
        };
      case 'neon_snow':
        return {
          type: 'neon_snow',
          name: 'তুষারপাত',
          icon: '❄️',
          effectLabel: 'ড্রিফট (-38% গ্রিপ)',
          gripFactor: 0.62,
          bonusMultiplier: 1.5,
        };
      default:
        return {
          type: 'clear',
          name: 'পরিষ্কার',
          icon: '☀️',
          effectLabel: '১০০% গ্রিপ',
          gripFactor: 1.0,
          bonusMultiplier: 1.0,
        };
    }
  }

  private buildWeatherParticles() {
    if (this.weatherParticles) {
      this.scene.remove(this.weatherParticles);
      this.weatherParticles.geometry.dispose();
      const mat = this.weatherParticles.material as THREE.PointsMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.weatherParticles = null;
      this.weatherPositions = null;
    }

    const type = this.currentWeatherType;
    if (type === 'rain') {
      const count = 1100;
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 52;
        pos[i + 1] = Math.random() * 26;
        pos[i + 2] = -Math.random() * 220;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.weatherPositions = pos;
      this.weatherParticles = new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.36, transparent: true, opacity: 0.85, depthWrite: false })
      );
      this.scene.add(this.weatherParticles);
    } else if (type === 'fog') {
      const count = 320;
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 55;
        pos[i + 1] = 0.8 + Math.random() * 9.5;
        pos[i + 2] = 10 - Math.random() * 220;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.weatherPositions = pos;
      this.weatherParticles = new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: 0xe2e8f0, size: 12, transparent: true, opacity: 0.22, depthWrite: false })
      );
      this.scene.add(this.weatherParticles);
    } else if (type === 'neon_snow') {
      const count = 800;
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 50;
        pos[i + 1] = Math.random() * 25;
        pos[i + 2] = -Math.random() * 220;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.weatherPositions = pos;
      this.weatherParticles = new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: 0xc084fc, size: 0.65, transparent: true, opacity: 0.85, depthWrite: false })
      );
      this.scene.add(this.weatherParticles);
    } else {
      const weather = this.currentTheme.weather;
      if (!weather || weather === 'none') return;
      const count = weather === 'rain' ? 750 : 500;
      const geom = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i += 3) {
        pos[i] = (Math.random() - 0.5) * 45;
        pos[i + 1] = Math.random() * 25;
        pos[i + 2] = -Math.random() * 220;
      }
      geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.weatherPositions = pos;
      const pColor = weather === 'rain' ? 0x38bdf8 : weather === 'embers' ? 0xf97316 : 0xa855f7;
      this.weatherParticles = new THREE.Points(
        geom,
        new THREE.PointsMaterial({ color: pColor, size: 0.42, transparent: true, opacity: 0.75 })
      );
      this.scene.add(this.weatherParticles);
    }
  }

  public getRoadCurveX(z: number, distanceOverride?: number): number {
    if (!this.currentTheme.hasCurves) return 0;
    const dist = distanceOverride !== undefined ? distanceOverride : this.distance;
    const travelOffset = dist * 0.85;
    const sampleZ = (z - travelOffset) * 0.0035;
    return Math.sin(sampleZ) * 8.5 + Math.sin(sampleZ * 0.45 + 1.2) * 4.2;
  }

  private buildRoad() {
    if (this.roadMesh) {
      this.disposeObject(this.roadMesh);
      this.roadMesh = null;
    }
    if (this.groundMesh) {
      this.disposeObject(this.groundMesh);
      this.groundMesh = null;
    }
    if (this.roadTexBundle) {
      this.roadTexBundle.dispose();
      this.roadTexBundle = null;
    }
    if (this.terrainTexBundle) {
      this.terrainTexBundle.dispose();
      this.terrainTexBundle = null;
    }
    this.guardrails.forEach((r) => this.disposeObject(r));
    this.guardrails = [];
    this.roadLines.forEach((l) => this.disposeObject(l));
    this.roadLines = [];
    this.streetLamps.forEach((l) => this.disposeObject(l));
    this.streetLamps = [];
    this.rainPuddles.forEach((p) => this.disposeObject(p));
    this.rainPuddles = [];
    this.speedBreakers.forEach((sb) => this.disposeObject(sb.group));
    this.speedBreakers = [];
    this.passengerStops.forEach((ps) => this.disposeObject(ps.group));
    this.passengerStops = [];

    const length = 1500;
    const isDayLike = this.isDayTheme() || this.currentTheme.skyType === 'sahara_sunset';
    const isMarine =
      this.currentTheme.hasMarineDrive ||
      this.currentTheme.id === 'road-coastal-marine' ||
      this.currentTheme.skyType === 'coxsbazar_marine';

    // 1. Ground Terrain
    this.terrainTexBundle = createTerrainTextureSet(this.currentTheme, this.maxAnisotropy);
    const groundWidth = isMarine ? 360 : 520;
    this.groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(groundWidth, length, 1, 1),
      new THREE.MeshStandardMaterial({ map: this.terrainTexBundle.map, roughness: 0.94, metalness: 0.04 })
    );
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.position.set(isMarine ? -185 : 0, -0.22, -length / 2 + 100);
    this.scene.add(this.groundMesh);

    // 2. 5-Lane Highway Asphalt Deck (receives shadows)
    this.roadTexBundle = createHighwayRoadTextureSet(this.currentTheme, this.maxAnisotropy);
    const roadGeo = new THREE.PlaneGeometry(30, length, 12, 120);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.roadTexBundle.map,
      bumpMap: this.roadTexBundle.bumpMap,
      bumpScale: 0.035,
      roughnessMap: this.roadTexBundle.roughnessMap,
      roughness: this.currentTheme.weather === 'rain' ? 0.32 : 0.86,
      metalness: this.currentTheme.weather === 'rain' ? 0.22 : 0.08,
    });
    this.roadMesh = new THREE.Mesh(roadGeo, roadMat);
    this.roadMesh.rotation.x = -Math.PI / 2;
    this.roadMesh.position.set(0, 0, -length / 2 + 100);
    this.roadMesh.receiveShadow = !this.isSoftwareGl;

    const posAttr = roadGeo.attributes.position;
    const baseXs = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      baseXs[i] = posAttr.getX(i);
    }
    this.roadMesh.userData.baseXs = baseXs;
    this.scene.add(this.roadMesh);

    // 3. Guardrails
    const railSegmentLen = 32;
    const numSegments = Math.floor(length / railSegmentLen);
    const steelMat = new THREE.MeshStandardMaterial({
      color: isDayLike ? 0xcbd5e1 : 0x475569,
      metalness: 0.82,
      roughness: 0.34,
    });
    const postMat = new THREE.MeshStandardMaterial({
      color: isDayLike ? 0x64748b : 0x1e293b,
      metalness: 0.7,
      roughness: 0.45,
    });
    const beamGeo = new THREE.BoxGeometry(0.16, 0.34, railSegmentLen);
    const ribGeo = new THREE.BoxGeometry(0.22, 0.08, railSegmentLen);
    const postGeo = new THREE.BoxGeometry(0.14, 0.82, 0.16);
    const reflGeo = new THREE.BoxGeometry(0.06, 0.12, 0.18);

    [-1, 1].forEach((side, idx) => {
      const accentColor = idx === 0 ? this.currentTheme.guardrailColorA : this.currentTheme.guardrailColorB;
      const accentMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: isDayLike ? 0.15 : 0.65,
        roughness: 0.3,
        metalness: 0.4,
      });
      const reflectorMat = new THREE.MeshBasicMaterial({ color: side < 0 ? 0xfacc15 : 0xef4444 });

      for (let s = 0; s < numSegments; s++) {
        const z = -length + 100 + s * railSegmentLen + railSegmentLen / 2;
        const railGroup = new THREE.Group();
        const beam = new THREE.Mesh(beamGeo, steelMat);
        beam.position.set(0, 0.56, 0);
        railGroup.add(beam);

        const topRib = new THREE.Mesh(ribGeo, accentMat);
        topRib.position.set(-side * 0.03, 0.68, 0);
        railGroup.add(topRib);

        [-12, -4, 4, 12].forEach((pz) => {
          const post = new THREE.Mesh(postGeo, postMat);
          post.position.set(side * 0.1, 0.4, pz);
          railGroup.add(post);

          const refl = new THREE.Mesh(reflGeo, reflectorMat);
          refl.position.set(-side * 0.11, 0.64, pz);
          railGroup.add(refl);
        });

        railGroup.position.set(side * 14.2, 0, z);
        railGroup.userData = { side, initialZ: z };
        this.scene.add(railGroup);
        this.guardrails.push(railGroup);
      }
    });

    // 4. Crisp 5-Lane Dashed Dividers & Cat's-Eye Studs
    const dividers = [-6.4, -3.2, 0, 3.2, 6.4];
    const lineGeo = new THREE.BoxGeometry(0.16, 0.02, 5.2);
    const studGeo = new THREE.BoxGeometry(0.14, 0.045, 0.14);

    for (let z = -length + 100; z < 100; z += 12) {
      dividers.slice(0, 4).forEach((x, i) => {
        const lineColor = i % 2 === 0 ? this.currentTheme.lineColorA : this.currentTheme.lineColorB;
        const lineGroup = new THREE.Group();
        const stripe = new THREE.Mesh(
          lineGeo,
          new THREE.MeshStandardMaterial({
            color: lineColor,
            emissive: lineColor,
            emissiveIntensity: isDayLike ? 0.08 : 0.45,
            roughness: 0.45,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
        );
        stripe.position.y = 0.015;
        lineGroup.add(stripe);

        const stud = new THREE.Mesh(
          studGeo,
          new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xfef9c3 : lineColor })
        );
        stud.position.set(0, 0.03, 3.1);
        lineGroup.add(stud);

        lineGroup.position.set(x + 1.6, 0, z);
        lineGroup.userData = { baseX: x + 1.6 };
        this.scene.add(lineGroup);
        this.roadLines.push(lineGroup);
      });
    }

    // 5. Dhaka 3D Speed Breakers & Zebra Crossings
    if (this.speedBreakerTex && this.zebraCrossingTex) {
      for (let z = -220; z >= -1120; z -= 300) {
        const sbGroup = createSpeedBreakerGroup(this.speedBreakerTex, this.zebraCrossingTex);
        sbGroup.position.set(this.getRoadCurveX(z), 0, z);
        this.scene.add(sbGroup);
        this.speedBreakers.push({ group: sbGroup, z, triggered: false });
      }
    }

    // 6. Streetlights
    const lampPoleMat = new THREE.MeshStandardMaterial({
      color: isDayLike ? 0x94a3b8 : 0x334155,
      metalness: 0.85,
      roughness: 0.3,
    });
    const lampHousingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 6.8, 8);
    const armGeo = new THREE.BoxGeometry(2.6, 0.11, 0.11);
    const headGeo = new THREE.BoxGeometry(0.85, 0.16, 0.36);
    const lensGeo = new THREE.PlaneGeometry(0.75, 0.28);

    for (let z = -1200; z < 100; z += 40) {
      [-1, 1].forEach((side, idx) => {
        const bulbColor = isDayLike
          ? 0xfff3d6
          : idx === 0
          ? this.currentTheme.lineColorA
          : this.currentTheme.lineColorB;
        const poleGroup = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, lampPoleMat);
        pole.position.set(0, 3.4, 0);
        poleGroup.add(pole);

        const arm = new THREE.Mesh(armGeo, lampPoleMat);
        arm.position.set(-side * 1.25, 6.75, 0);
        arm.rotation.z = -side * 0.12;
        poleGroup.add(arm);

        const head = new THREE.Mesh(headGeo, lampHousingMat);
        head.position.set(-side * 2.35, 6.85, 0);
        poleGroup.add(head);

        const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({ color: bulbColor, side: THREE.DoubleSide }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(-side * 2.35, 6.76, 0);
        poleGroup.add(lens);

        poleGroup.position.set(side * 15.2, 0, z);
        poleGroup.userData = { baseX: side * 15.2 };
        this.scene.add(poleGroup);
        this.streetLamps.push(poleGroup);
      });
    }

    // 7. Rain Puddle Splashes
    for (let p = 0; p < 20; p++) {
      const puddle = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.42, 16),
        new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0, side: THREE.DoubleSide })
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set((Math.random() - 0.5) * 16, 0.025, -Math.random() * 90);
      puddle.userData = { scale: 0.2, alpha: 0, speed: 1.6 + Math.random() * 2 };
      this.scene.add(puddle);
      this.rainPuddles.push(puddle);
    }

    // 8. Sidewalks & Walking Pedestrians
    this.pedestrianManager.buildSidewalks(length);
    this.pedestrianManager.spawnPedestrians(34);
  }

  private buildCity() {
    this.buildings.forEach((b) => this.disposeObject(b));
    this.buildings = [];
    this.roadsideTrees.forEach((t) => this.disposeObject(t));
    this.roadsideTrees = [];

    const sky = this.currentTheme.skyType;
    const isDay = this.isDayTheme();
    const isDhaka = Boolean(this.currentTheme.hasDhakaCity || sky === 'dhaka_day');
    const isCoastal = sky === 'coxsbazar_marine';
    const isCanyon = sky === 'sahara_sunset';
    const isMagma = sky === 'magma';
    const isSpace = sky === 'space';

    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.65 });

    let shopCounter = 0;
    for (let z = -1200; z < 100; z += 30) {
      [-1, 1].forEach((side) => {
        if (isCoastal && side === 1) return;

        // Roadside Trees
        if (isDay && Math.random() > 0.18) {
          const treeGroup = new THREE.Group();
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.2, 8), treeTrunkMat);
          trunk.position.y = 1.6;
          treeGroup.add(trunk);

          [2.8, 4.0, 5.0].forEach((fy, idx) => {
            const rad = (3 - idx) * 0.9 + 0.4;
            const crown = new THREE.Mesh(new THREE.ConeGeometry(rad, 2.0, 8), treeFoliageMat);
            crown.position.y = fy;
            treeGroup.add(crown);
          });

          const treeX = side === -1 ? -(19.5 + Math.random() * 2.5) : 31.2 + Math.random() * 3.5;
          treeGroup.position.set(treeX, 0, z + (Math.random() - 0.5) * 8);
          treeGroup.userData.baseX = treeX;
          this.scene.add(treeGroup);
          this.roadsideTrees.push(treeGroup);
        }

        const h = isDhaka ? 16 + Math.random() * 44 : 35 + Math.random() * 115;
        const w = 12 + Math.random() * 16;
        const d = 14 + Math.random() * 16;
        let group: THREE.Group;

        if (isCanyon) {
          group = new THREE.Group();
          const cliff = new THREE.Mesh(
            new THREE.BoxGeometry(w * 1.2, h * 0.85, d * 1.1),
            new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0xb45309 : 0x92400e, roughness: 0.9 })
          );
          cliff.position.y = (h * 0.85) / 2;
          group.add(cliff);
        } else if (isMagma) {
          group = new THREE.Group();
          const rock = new THREE.Mesh(
            new THREE.ConeGeometry(w * 0.75, h, 6),
            new THREE.MeshStandardMaterial({ color: 0x1c1917, emissive: 0x450a0a, emissiveIntensity: 0.35, roughness: 0.85 })
          );
          rock.position.y = h / 2;
          group.add(rock);
        } else if (isSpace) {
          group = new THREE.Group();
          const crystal = new THREE.Mesh(
            new THREE.OctahedronGeometry(w * 0.65, 0),
            new THREE.MeshStandardMaterial({
              color: 0x312e81,
              emissive: side < 0 ? 0x6d28d9 : 0x0891b2,
              emissiveIntensity: 0.4,
              metalness: 0.9,
              roughness: 0.15,
            })
          );
          crystal.scale.set(1, h / (w * 0.9), 1);
          crystal.position.y = h / 2;
          group.add(crystal);
        } else if (isDhaka) {
          // Local Dhaka Commercial Buildings with Bengali Shop Signboards & Rooftop Water Tanks
          group = createDhakaShopBuilding(w, h, d, side, isDay, shopCounter++);
        } else {
          group = new THREE.Group();
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshStandardMaterial({
              color: isDay ? 0xe2e8f0 : 0x081022,
              roughness: 0.4,
              metalness: 0.45,
            })
          );
          b.position.y = h / 2;
          group.add(b);
        }

        const buildingX =
          side === -1 ? -(27 + w * 0.5 + Math.random() * 18) : 36 + w * 0.5 + Math.random() * 22;
        group.position.set(buildingX, 0, z + Math.random() * 10);
        group.userData.baseX = buildingX;
        this.scene.add(group);
        this.buildings.push(group);
      });
    }
  }

  private buildHighwaySkyTrain() {
    this.metroRailPillars.forEach((p) => this.disposeObject(p));
    this.metroRailPillars = [];
    if (this.metroTrain) {
      this.disposeObject(this.metroTrain);
      this.metroTrain = null;
    }

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.85, metalness: 0.1 });
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.7, metalness: 0.3 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.2 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.5 });

    const viaductX = -17.5;
    const trackY = 9.8;

    for (let z = -1200; z < 100; z += 35) {
      const g = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, trackY, 10), pillarMat);
      col.position.set(0, trackY / 2, 0);
      g.add(col);

      const beam = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.1, 2.2), pillarMat);
      beam.position.set(0, trackY + 0.3, 0);
      g.add(beam);

      const girder = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.8, 35.5), trackMat);
      girder.position.set(0, trackY + 1.1, 0);
      g.add(girder);

      [-2.1, 2.1].forEach((gx) => {
        const railWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 35.5), wallMat);
        railWall.position.set(gx, trackY + 1.8, 0);
        g.add(railWall);
      });

      [-0.8, 0.8].forEach((rx) => {
        const rTrack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 35.5), railMat);
        rTrack.position.set(rx, trackY + 1.6, 0);
        g.add(rTrack);
      });

      g.position.set(viaductX, 0, z);
      g.userData = { baseX: viaductX };
      this.scene.add(g);
      this.metroRailPillars.push(g);
    }

    // Dhaka MRT-6 Train
    const trainGroup = new THREE.Group();
    const trainLength = 52;
    const trainWidth = 3.2;
    const trainHeight = 2.8;
    const silverBodyMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.85, roughness: 0.2 });
    const greenRibbonMat = new THREE.MeshBasicMaterial({ color: 0x059669 });
    const redRibbonMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const trainGlassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 });

    const carLen = 12.2;
    for (let c = 0; c < 4; c++) {
      const cz = (c - 1.5) * (carLen + 0.8);
      const carGroup = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.BoxGeometry(trainWidth, trainHeight, carLen), silverBodyMat);
      shell.position.y = trainHeight / 2;
      carGroup.add(shell);

      const gStripe = new THREE.Mesh(new THREE.BoxGeometry(trainWidth + 0.04, 0.45, carLen + 0.02), greenRibbonMat);
      gStripe.position.y = 1.1;
      carGroup.add(gStripe);

      const rStripe = new THREE.Mesh(new THREE.BoxGeometry(trainWidth + 0.05, 0.25, carLen + 0.03), redRibbonMat);
      rStripe.position.y = 0.7;
      carGroup.add(rStripe);

      const win = new THREE.Mesh(new THREE.BoxGeometry(trainWidth + 0.06, 0.75, carLen * 0.85), trainGlassMat);
      win.position.y = 1.85;
      carGroup.add(win);

      carGroup.position.z = cz;
      trainGroup.add(carGroup);
    }

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 4), silverBodyMat);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, trainHeight / 2, -trainLength / 2 - 0.9);
    trainGroup.add(nose);

    trainGroup.position.set(viaductX, trackY + 1.6, -180);
    trainGroup.userData = { baseX: viaductX };
    this.scene.add(trainGroup);
    this.metroTrain = trainGroup;
  }

  private buildHighwaySignboards() {
    this.overheadSignboards.forEach((s) => this.disposeObject(s));
    this.overheadSignboards = [];

    const boardTexts = [
      {
        top: 'ঢাকা এলিভেটেড এক্সপ্রেসওয়ে (MRT-6)',
        sub: 'উত্তরা ↔ ফার্মগেট ↔ মতিঝিল · স্পিড মনিটরড',
        dirL: '⇖ মিরপুর ১০ ফ্লাইওভার',
        dirR: 'বিমানবন্দর টার্মিনাল ➜',
      },
      {
        top: 'বিজয় সরণি · কাজী নজরুল ইসলাম এভিনিউ',
        sub: 'বাম ও মাঝের লেন হাই-স্পিড · ডান লেনে যাত্রী স্টপেজ',
        dirL: '⇖ কারওয়ান বাজার',
        dirR: 'শাহবাগ মোড় ➜',
      },
      {
        top: 'ঢাকা মেট্রো ট্রাফিক কন্ট্রোল',
        sub: 'সামনে স্পিড ব্রেকার ও জেব্রা ক্রসিং • সতর্ক থাকুন',
        dirL: '⇖ বনানী ওভারপাস',
        dirR: 'গুলশান ১ সার্কেল ➜',
      },
      {
        top: 'মেয়র হানিফ ফ্লাইওভার সংযোগ সড়ক',
        sub: 'পুলিশ রাডার ও সিএনজি ক্রসিং নজরদারিতে',
        dirL: '⇖ মতিঝিল বাণিজ্যিক এলাকা',
        dirR: 'সদরঘাট এক্সপ্রেস ➜',
      },
    ];

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 });

    for (let i = 0; i < 4; i++) {
      const z = -190 - i * 270;
      const g = new THREE.Group();

      [-16, 16].forEach((tx) => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 8.5, 8), trussMat);
        post.position.set(tx, 4.25, 0);
        g.add(post);
      });

      const beam = new THREE.Mesh(new THREE.BoxGeometry(32.5, 0.5, 0.6), trussMat);
      beam.position.set(0, 7.8, 0);
      g.add(beam);

      const data = boardTexts[i % boardTexts.length];
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#065f46';
        ctx.fillRect(0, 0, 768, 200);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 10;
        ctx.strokeRect(8, 8, 752, 184);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px "Hind Siliguri", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(data.top, 384, 54);

        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 21px "Hind Siliguri", sans-serif';
        ctx.fillText(data.sub, 384, 90);

        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(30, 112);
        ctx.lineTo(738, 112);
        ctx.stroke();

        ctx.font = 'bold 26px "Hind Siliguri", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(data.dirL, 50, 156);
        ctx.textAlign = 'right';
        ctx.fillText(data.dirR, 718, 156);
      }

      const boardTex = new THREE.CanvasTexture(canvas);
      boardTex.colorSpace = THREE.SRGBColorSpace;
      boardTex.userData.disposable = true;
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(16, 4.2),
        new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide })
      );
      board.position.set(0, 6.2, -0.05);
      g.add(board);

      g.position.set(0, 0, z);
      g.userData = { baseX: 0 };
      this.scene.add(g);
      this.overheadSignboards.push(g);
    }
  }

  private buildCoastalHighway() {
    this.cleanMarineDrive();

    const isMarine =
      this.currentTheme.hasMarineDrive ||
      this.currentTheme.id === 'road-coastal-marine' ||
      this.currentTheme.skyType === 'coxsbazar_marine';
    if (!isMarine) return;

    this.oceanMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(380, 1500, 16, 40),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.16, metalness: 0.85 })
    );
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.position.set(205, -0.6, -650);
    this.scene.add(this.oceanMesh);

    const beachGroup = new THREE.Group();
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 1500),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.9, metalness: 0.1 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(30, -0.15, -650);
    beachGroup.add(beach);
    this.scene.add(beachGroup);
    this.marineDriveObjects.push(beachGroup);

    const palmTrunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const palmLeafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5, side: THREE.DoubleSide });
    for (let pz = -1100; pz < 100; pz += 36) {
      const palm = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 7.2, 7), palmTrunkMat);
      trunk.position.set(0.4, 3.6, 0);
      trunk.rotation.z = -0.12;
      palm.add(trunk);
      for (let a = 0; a < 6; a++) {
        const frond = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.6), palmLeafMat);
        frond.rotation.x = Math.PI / 3;
        frond.rotation.y = (a / 6) * Math.PI * 2;
        frond.position.set(0.8, 7.1, 0);
        palm.add(frond);
      }
      palm.position.set(17.5 + Math.random() * 5, 0, pz);
      palm.userData = { baseX: palm.position.x };
      this.scene.add(palm);
      this.marineDriveObjects.push(palm);
    }
  }

  private cleanMarineDrive() {
    if (this.oceanMesh) {
      this.disposeObject(this.oceanMesh);
      this.oceanMesh = null;
    }
    this.marineDriveObjects.forEach((obj) => this.disposeObject(obj));
    this.marineDriveObjects = [];
  }

  private cleanSecondaryRoad() {
    if (this.secondaryRoadMesh) {
      this.disposeObject(this.secondaryRoadMesh);
      this.secondaryRoadMesh = null;
    }
    if (this.flyoverTexBundle) {
      this.flyoverTexBundle.dispose();
      this.flyoverTexBundle = null;
    }
    this.secondaryRoadPillars.forEach((p) => this.disposeObject(p));
    this.secondaryRoadPillars = [];
    this.secondaryGuardrails.forEach((g) => this.disposeObject(g));
    this.secondaryGuardrails = [];
    this.secondaryRoadLines.forEach((l) => this.disposeObject(l));
    this.secondaryRoadLines = [];
    this.secondaryTraffic.forEach((t) => this.disposeObject(t.group));
    this.secondaryTraffic = [];

    this.overpassBridges.forEach((b) => this.disposeObject(b));
    this.overpassBridges = [];
    this.overpassTraffic.forEach((t) => this.disposeObject(t.group));
    this.overpassTraffic = [];
  }

  private buildSecondaryFlyoverRoad(length = 1500) {
    this.cleanSecondaryRoad();

    const flyoverX = 23.5;
    const flyoverY = 4.2;
    const roadWidth = 11.5;
    const isDayLike = this.isDayTheme() || this.currentTheme.skyType === 'sahara_sunset';

    this.flyoverTexBundle = createFlyoverTextureSet(this.currentTheme, this.maxAnisotropy);
    const flyGeo = new THREE.PlaneGeometry(roadWidth, length, 8, 100);
    this.secondaryRoadMesh = new THREE.Mesh(
      flyGeo,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.flyoverTexBundle.map,
        bumpMap: this.flyoverTexBundle.bumpMap,
        bumpScale: 0.025,
        roughnessMap: this.flyoverTexBundle.roughnessMap,
        roughness: this.currentTheme.weather === 'rain' ? 0.36 : 0.88,
        metalness: this.currentTheme.weather === 'rain' ? 0.2 : 0.06,
      })
    );
    this.secondaryRoadMesh.rotation.x = -Math.PI / 2;
    this.secondaryRoadMesh.position.set(flyoverX, flyoverY, -length / 2 + 100);
    this.scene.add(this.secondaryRoadMesh);

    const posAttr = flyGeo.attributes.position;
    const baseXs = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      baseXs[i] = posAttr.getX(i);
    }
    this.secondaryRoadMesh.userData.baseXs = baseXs;

    const pierMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85, metalness: 0.08 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72, metalness: 0.16 });
    const spineMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, metalness: 0.12 });

    for (let z = -length + 100; z < 100; z += 44) {
      const pierGroup = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, flyoverY - 0.6, 10), pierMat);
      col.position.set(0, (flyoverY - 0.6) / 2, 0);
      pierGroup.add(col);

      const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 1.0, 0.75, 2.4), beamMat);
      crossBeam.position.set(0, flyoverY - 0.55, 0);
      pierGroup.add(crossBeam);

      const girder = new THREE.Mesh(new THREE.BoxGeometry(roadWidth * 0.56, 0.9, 44.2), spineMat);
      girder.position.set(0, flyoverY - 0.52, 0);
      pierGroup.add(girder);

      pierGroup.position.set(flyoverX, 0, z);
      pierGroup.userData = { baseX: flyoverX, initialZ: z };
      this.scene.add(pierGroup);
      this.secondaryRoadPillars.push(pierGroup);
    }

    const railSegmentLen = 32;
    const numSegments = Math.floor(length / railSegmentLen);
    const parapetMat = new THREE.MeshStandardMaterial({ color: isDayLike ? 0xcbd5e1 : 0x475569, roughness: 0.85 });
    const parapetWallGeo = new THREE.BoxGeometry(0.38, 0.62, railSegmentLen);
    const parapetCapGeo = new THREE.BoxGeometry(0.42, 0.12, railSegmentLen);

    [-1, 1].forEach((side, idx) => {
      const accentColor = idx === 0 ? this.currentTheme.guardrailColorA : this.currentTheme.guardrailColorB;
      const accentMat = new THREE.MeshStandardMaterial({
        color: accentColor,
        emissive: accentColor,
        emissiveIntensity: isDayLike ? 0.15 : 0.55,
      });

      for (let s = 0; s < numSegments; s++) {
        const z = -length + 100 + s * railSegmentLen + railSegmentLen / 2;
        const railGroup = new THREE.Group();
        const wall = new THREE.Mesh(parapetWallGeo, parapetMat);
        wall.position.y = 0.31;
        railGroup.add(wall);
        const cap = new THREE.Mesh(parapetCapGeo, accentMat);
        cap.position.y = 0.64;
        railGroup.add(cap);

        const gx = flyoverX + side * (roadWidth / 2 - 0.18);
        railGroup.position.set(gx, flyoverY, z);
        railGroup.userData = { baseX: gx, side, initialZ: z };
        this.scene.add(railGroup);
        this.secondaryGuardrails.push(railGroup);
      }
    });

    const lanes = [flyoverX - 3.8, flyoverX, flyoverX + 3.8];
    for (let i = 0; i < 12; i++) {
      const laneIdx = i % 3;
      const baseX = lanes[laneIdx];
      const z = -Math.random() * 1100 + 30;
      const direction: 1 | -1 = laneIdx === 2 ? -1 : 1;
      const speed = 70 + Math.random() * 50;

      const roll = Math.random();
      const vehicleGroup =
        roll < 0.3
          ? HighwayVehicles.createDhakaCityBus()
          : roll < 0.55
          ? HighwayVehicles.createDhakaCNG()
          : roll < 0.8
          ? HighwayVehicles.createBangladeshiTruck()
          : this.createCivilianCar(0x0284c7, false);

      vehicleGroup.position.set(baseX, flyoverY, z);
      vehicleGroup.rotation.y = direction === 1 ? 0 : Math.PI;
      this.scene.add(vehicleGroup);

      this.secondaryTraffic.push({ group: vehicleGroup, baseX, y: flyoverY, lane: laneIdx, z, speed, direction });
    }
  }

  private buildOverpassBridges() {
    this.overpassBridges.forEach((b) => this.disposeObject(b));
    this.overpassBridges = [];
    this.overpassTraffic.forEach((t) => this.disposeObject(t.group));
    this.overpassTraffic = [];

    const overpassZs = [-380, -820];
    const bridgeCenterX = 4.0;
    const bridgeWidth = 9.5;
    const bridgeSpan = 74;
    const bridgeHeight = 8.6;

    const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.78, metalness: 0.14 });
    const girderMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72, metalness: 0.2 });
    const bridgeRailMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.6 });
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });

    overpassZs.forEach((bz) => {
      const bridgeGroup = new THREE.Group();
      const deck = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 0.55, bridgeWidth), bridgeDeckMat);
      deck.position.y = bridgeHeight;
      bridgeGroup.add(deck);

      const underGirder = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 0.55, bridgeWidth * 0.82), girderMat);
      underGirder.position.y = bridgeHeight - 0.5;
      bridgeGroup.add(underGirder);

      [-bridgeWidth / 2 + 0.18, bridgeWidth / 2 - 0.18].forEach((ry) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(bridgeSpan, 0.95, 0.32), bridgeRailMat);
        rail.position.set(0, bridgeHeight + 0.72, ry);
        bridgeGroup.add(rail);
      });

      [-27.5, 27.8].forEach((px) => {
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, bridgeHeight, 10), pierMat);
        pier.position.set(px, bridgeHeight / 2, 0);
        bridgeGroup.add(pier);
      });

      bridgeGroup.position.set(bridgeCenterX, 0, bz);
      bridgeGroup.userData = { baseX: bridgeCenterX, baseZ: bz };
      this.scene.add(bridgeGroup);
      this.overpassBridges.push(bridgeGroup);

      [-2.6, 2.6].forEach((laneZ, lIdx) => {
        const dir: 1 | -1 = lIdx === 0 ? 1 : -1;
        const speed = 18 + Math.random() * 12;
        const car = lIdx === 0 ? HighwayVehicles.createDhakaCNG() : this.createCivilianCar(0xdc2626, false);
        const startLocalX = (Math.random() - 0.5) * (bridgeSpan - 14);
        car.position.set(bridgeCenterX + startLocalX, bridgeHeight + 0.28, bz + laneZ);
        car.rotation.y = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(car);

        this.overpassTraffic.push({ group: car, x: startLocalX, baseZ: bz, y: laneZ, speed, direction: dir });
      });
    });
  }

  private updateSecondaryTraffic(dt: number, roadMovement: number, distanceOverride?: number) {
    if (this.flyoverTexBundle) {
      const uvDelta = (roadMovement * this.flyoverTexBundle.repeatY) / 1500;
      this.flyoverTexBundle.map.offset.y = (this.flyoverTexBundle.map.offset.y + uvDelta) % 1;
      this.flyoverTexBundle.bumpMap.offset.y = (this.flyoverTexBundle.bumpMap.offset.y + uvDelta) % 1;
      this.flyoverTexBundle.roughnessMap.offset.y = (this.flyoverTexBundle.roughnessMap.offset.y + uvDelta) % 1;
    }

    this.secondaryRoadPillars.forEach((p) => {
      p.position.z += roadMovement;
      if (p.position.z > 50) p.position.z -= 1300;
      p.position.x = (p.userData.baseX || 23.5) + this.getRoadCurveX(p.position.z, distanceOverride);
      const dCurv =
        this.getRoadCurveX(p.position.z - 4, distanceOverride) -
        this.getRoadCurveX(p.position.z + 4, distanceOverride);
      p.rotation.y = Math.atan2(dCurv, 8);
    });

    this.secondaryGuardrails.forEach((g) => {
      g.position.z += roadMovement;
      if (g.position.z > 50) g.position.z -= 1300;
      g.position.x = (g.userData.baseX || 23.5) + this.getRoadCurveX(g.position.z, distanceOverride);
      const dCurv =
        this.getRoadCurveX(g.position.z - 4, distanceOverride) -
        this.getRoadCurveX(g.position.z + 4, distanceOverride);
      g.rotation.y = Math.atan2(dCurv, 8);
    });

    for (let i = 0; i < this.secondaryTraffic.length; i++) {
      const car = this.secondaryTraffic[i];
      const relSpeed =
        car.direction === 1
          ? (this.speed - car.speed) * 0.055 + 8
          : (this.speed + car.speed) * 0.055 + 10;

      car.z += relSpeed * dt;
      if (car.z > 60) car.z -= 1180;
      else if (car.z < -1180) car.z += 1180;

      const curveX = this.getRoadCurveX(car.z, distanceOverride);
      car.group.position.set(car.baseX + curveX, car.y, car.z);
      const dCurve =
        this.getRoadCurveX(car.z - 3, distanceOverride) -
        this.getRoadCurveX(car.z + 3, distanceOverride);
      const angle = Math.atan2(dCurve, 6);
      car.group.rotation.y = car.direction === 1 ? angle : Math.PI + angle;
    }

    this.overpassBridges.forEach((b) => {
      b.position.z += roadMovement;
      if (b.position.z > 50) b.position.z -= 1300;
      b.position.x = (b.userData.baseX ?? 4.0) + this.getRoadCurveX(b.position.z, distanceOverride);
      const dCurv =
        this.getRoadCurveX(b.position.z - 4, distanceOverride) -
        this.getRoadCurveX(b.position.z + 4, distanceOverride);
      b.rotation.y = Math.atan2(dCurv, 8);
    });

    const bridgeHeightY = 8.88;
    const bridgeCenterX = 4.0;
    for (let j = 0; j < this.overpassTraffic.length; j++) {
      const op = this.overpassTraffic[j];
      op.baseZ += roadMovement;
      if (op.baseZ > 50) op.baseZ -= 1300;

      op.x += op.speed * op.direction * dt;
      if (op.direction === 1 && op.x > 34) op.x = -34;
      else if (op.direction === -1 && op.x < -34) op.x = 34;

      const dCurv =
        this.getRoadCurveX(op.baseZ - 4, distanceOverride) -
        this.getRoadCurveX(op.baseZ + 4, distanceOverride);
      const bridgeAngle = Math.atan2(dCurv, 8);
      const cosA = Math.cos(bridgeAngle);
      const sinA = Math.sin(bridgeAngle);
      const localZ = op.y;
      const worldX = bridgeCenterX + this.getRoadCurveX(op.baseZ, distanceOverride) + op.x * cosA + localZ * sinA;
      const worldZ = op.baseZ - op.x * sinA + localZ * cosA;

      op.group.position.set(worldX, bridgeHeightY, worldZ);
      op.group.rotation.y = (op.direction === 1 ? -Math.PI / 2 : Math.PI / 2) + bridgeAngle;
    }
  }

  private buildPlayerCar() {
    if (this.playerGroup) {
      this.disposeObject(this.playerGroup);
      this.playerGroup = null;
    }
    this.playerBodyShell = null;
    this.frontWheelSteerPivots = [];
    this.playerWheels = [];
    this.headlightPoolMesh = null;

    const group = new THREE.Group();
    const shell = new THREE.Group(); // Suspended chassis/body for pitch/roll/bounce
    group.add(shell);
    this.playerBodyShell = shell;

    // Ground Contact Shadow & Headlight Light-Pool
    if (this.contactShadowTex) {
      const shadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2.75, 5.2),
        new THREE.MeshBasicMaterial({
          map: this.contactShadowTex,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        })
      );
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.025, 0);
      group.add(shadowMesh);
    }

    if (this.headlightBeamTex) {
      this.headlightPoolMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(5.6, 17.5),
        new THREE.MeshBasicMaterial({
          map: this.headlightBeamTex,
          transparent: true,
          opacity: 0.45,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        })
      );
      this.headlightPoolMesh.rotation.x = -Math.PI / 2;
      this.headlightPoolMesh.position.set(0, 0.035, -10.8);
      group.add(this.headlightPoolMesh);
    }

    // Glossy Metallic Clearcoat Supercar Body (Physical PBR reflections)
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0x111625, metalness: 0.85, roughness: 0.36 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.22, 4.3), chassisMat);
    chassis.position.y = 0.22;
    shell.add(chassis);

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.32, 0.4), chassisMat);
    frontBumper.position.set(0, 0.28, -2.15);
    shell.add(frontBumper);

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: this.activeCar.bodyColor,
      metalness: 0.88,
      roughness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.35,
    });
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.52, 3.9), bodyMat);
    mainBody.position.y = 0.52;
    shell.add(mainBody);

    const hoodMat = new THREE.MeshPhysicalMaterial({
      color: this.activeCar.accentColor || this.activeCar.bodyColor,
      metalness: 0.9,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.4,
    });
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.18, 1.4), hoodMat);
    hood.position.set(0, 0.68, -1.25);
    hood.rotation.x = 0.08;
    shell.add(hood);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a1424,
      metalness: 0.9,
      roughness: 0.05,
      clearcoat: 1.0,
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.45, 1.95), glassMat);
    cabin.position.set(0, 0.96, -0.05);
    shell.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.06, 1.35), bodyMat);
    roof.position.set(0, 1.2, -0.05);
    shell.add(roof);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 0.1), glassMat);
    windshield.position.set(0, 0.95, -1.05);
    windshield.rotation.x = -0.55;
    shell.add(windshield);

    [-0.85, 0.85].forEach((mx) => {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.16), bodyMat);
      mirror.position.set(mx, 0.85, -0.7);
      shell.add(mirror);
    });

    const wingMat = new THREE.MeshStandardMaterial({ color: 0x050814, metalness: 0.8, roughness: 0.25 });
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.4), wingMat);
    wingBlade.position.set(0, 1.15, 1.85);
    shell.add(wingBlade);
    [-0.55, 0.55].forEach((sx) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.12), wingMat);
      strut.position.set(sx, 0.95, 1.85);
      shell.add(strut);
    });

    [-0.65, 0.65].forEach((hx) => {
      const headlight = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.14, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      headlight.position.set(hx, 0.58, -1.98);
      shell.add(headlight);
    });

    const taillightBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.65, 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xff002b })
    );
    taillightBar.position.set(0, 0.65, 1.98);
    shell.add(taillightBar);

    // Dual Exhaust Nitro Jet Cones
    const exhGeom = new THREE.CylinderGeometry(0.07, 0.22, 1.35, 8);
    const exhMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });
    this.leftExhaust = new THREE.Mesh(exhGeom, exhMat);
    this.leftExhaust.rotation.x = Math.PI / 2;
    this.leftExhaust.position.set(-0.4, 0.42, 2.55);
    this.leftExhaust.visible = false;
    shell.add(this.leftExhaust);

    this.rightExhaust = new THREE.Mesh(exhGeom, exhMat);
    this.rightExhaust.rotation.x = Math.PI / 2;
    this.rightExhaust.position.set(0.4, 0.42, 2.55);
    this.rightExhaust.visible = false;
    shell.add(this.rightExhaust);

    // Wipers
    const wiperMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const wiperGeo = new THREE.BoxGeometry(0.04, 0.36, 0.02);
    wiperGeo.translate(0, 0.18, 0);
    this.leftWiper = new THREE.Mesh(wiperGeo, wiperMat);
    this.leftWiper.position.set(-0.35, 0.86, -1.05);
    this.leftWiper.rotation.x = -0.55;
    this.leftWiper.rotation.z = -0.5;
    shell.add(this.leftWiper);

    this.rightWiper = new THREE.Mesh(wiperGeo, wiperMat);
    this.rightWiper.position.set(0.25, 0.86, -1.05);
    this.rightWiper.rotation.x = -0.55;
    this.rightWiper.rotation.z = -0.5;
    shell.add(this.rightWiper);

    // 4 Realistic Wheels with Front Steering Pivots
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.82 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xd9e2ec, metalness: 0.95, roughness: 0.15 });
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35, metalness: 0.5 });

    const wheelPositions: Array<[number, number, number, boolean]> = [
      [-0.94, 0.38, -1.25, true],
      [0.94, 0.38, -1.25, true],
      [-0.94, 0.38, 1.25, false],
      [0.94, 0.38, 1.25, false],
    ];

    wheelPositions.forEach(([x, y, z, isFront]) => {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(x, y, z);

      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 18), tireMat);
      tire.rotation.z = Math.PI / 2;
      wheelGroup.add(tire);

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 16), rimMat);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);

      const spokeA = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.055), caliperMat);
      wheelGroup.add(spokeA);
      const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.055, 0.42), rimMat);
      wheelGroup.add(spokeB);

      steerPivot.add(wheelGroup);
      group.add(steerPivot);
      this.playerWheels.push(wheelGroup);
      if (isFront) {
        this.frontWheelSteerPivots.push(steerPivot);
      }
    });

    this.underglowLight = new THREE.PointLight(this.activeCar.underglow, 2.5, 6);
    this.underglowLight.position.set(0, 0.15, 0);
    group.add(this.underglowLight);

    this.enableShadowCasting(group);
    group.position.set(0, 0, 3);
    this.scene.add(group);
    this.playerGroup = group;
  }

  private createPoliceCar(): { group: THREE.Group; lights: { r: THREE.PointLight; b: THREE.PointLight } } {
    const group = new THREE.Group();
    const w = 1.8;
    const h = 0.65;
    const l = 4.05;

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      metalness: 0.78,
      roughness: 0.18,
      clearcoat: 1.0,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
    body.position.y = h / 2 + 0.22;
    group.add(body);

    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.35 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.18, l * 0.95), stripeMat);
    stripe.position.y = body.position.y + 0.05;
    group.add(stripe);

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.9, roughness: 0.1 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.45, l * 0.52), glassMat);
    cab.position.set(0, body.position.y + h / 2 + 0.2, 0.1);
    group.add(cab);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.06, l * 0.46), bodyMat);
    roof.position.set(0, cab.position.y + 0.24, 0.1);
    group.add(roof);

    const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.24), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    barBase.position.set(0, roof.position.y + 0.06, 0.1);
    group.add(barBase);

    const redLight = new THREE.PointLight(0xff0000, 3.0, 14);
    redLight.position.set(-0.35, roof.position.y + 0.16, 0.1);
    group.add(redLight);

    const blueLight = new THREE.PointLight(0x0055ff, 3.0, 14);
    blueLight.position.set(0.35, roof.position.y + 0.16, 0.1);
    group.add(blueLight);

    [-w * 0.35, w * 0.35].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(hx, body.position.y, -l / 2 - 0.04);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, body.position.y + 0.05, l / 2 + 0.04);
      group.add(tl);
    });

    const whGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14);
    const whMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.2 });

    [[-w / 2 - 0.08, -1.2], [w / 2 + 0.08, -1.2], [-w / 2 - 0.08, 1.2], [w / 2 + 0.08, 1.2]].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(whGeom, whMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);
      wg.position.set(wx, 0.36, wz);
      group.add(wg);
    });

    return { group, lights: { r: redLight, b: blueLight } };
  }

  private createCivilianCar(color: number, isSUV: boolean): THREE.Group {
    const group = new THREE.Group();
    const w = isSUV ? 1.85 : 1.72;
    const h = isSUV ? 0.78 : 0.6;
    const l = isSUV ? 4.1 : 3.8;

    const bodyMat = new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.82,
      roughness: 0.18,
      clearcoat: 0.85,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), bodyMat);
    body.position.y = h / 2 + 0.22;
    group.add(body);

    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1424, metalness: 0.9, roughness: 0.1 });
    const cabHeight = isSUV ? 0.55 : 0.44;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, cabHeight, l * 0.55), glassMat);
    cab.position.set(0, body.position.y + h / 2 + cabHeight / 2 - 0.05, 0.1);
    group.add(cab);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 0.06, l * 0.48), bodyMat);
    roof.position.set(0, cab.position.y + cabHeight / 2 + 0.02, 0.1);
    group.add(roof);

    [-w * 0.35, w * 0.35].forEach((hx) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      hl.position.set(hx, body.position.y, -l / 2 - 0.04);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      tl.position.set(hx, body.position.y + 0.05, l / 2 + 0.04);
      group.add(tl);
    });

    const whGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 14);
    const whMat = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

    [[-w / 2 - 0.08, -1.2], [w / 2 + 0.08, -1.2], [-w / 2 - 0.08, 1.2], [w / 2 + 0.08, 1.2]].forEach(([wx, wz]) => {
      const wg = new THREE.Group();
      const tire = new THREE.Mesh(whGeom, whMat);
      tire.rotation.z = Math.PI / 2;
      wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.26, 12), rimMat);
      rim.rotation.z = Math.PI / 2;
      wg.add(rim);
      wg.position.set(wx, 0.36, wz);
      group.add(wg);
    });

    return group;
  }

  // --- AUTHENTIC DHAKA & HIGHWAY TRAFFIC SPAWNER (ANTI-WALL + CHAOTIC AI) ---
  private spawnTraffic(forcePolice = false) {
    const allLanes = [-2, -1, 0, 1, 2];
    const occupiedNearSpawn = new Set<number>();
    const occupiedInBand = new Set<number>();

    for (const t of this.traffic) {
      if (t.group.position.z < -170) {
        occupiedInBand.add(t.lane);
        if (Math.abs(t.group.position.z - -250) < 34) {
          occupiedNearSpawn.add(t.lane);
        }
      }
    }

    // Never form an impassable 5-lane wall
    if (occupiedInBand.size >= 4 && !forcePolice) return;

    const freeLanes = allLanes.filter((l) => !occupiedNearSpawn.has(l));
    if (freeLanes.length === 0) return;

    const lane = forcePolice
      ? this.lane
      : freeLanes[Math.floor(Math.random() * freeLanes.length)];

    const isPolice = forcePolice || (this.policeActive && !this.policeSpawnedInChase);

    let group: THREE.Group;
    let w = 1.75;
    let l = 3.9;
    let vehicleSpeed = 70 + Math.random() * 45;
    let lights: { r: THREE.PointLight; b: THREE.PointLight } | undefined;
    let vehicleType: TrafficVehicleKind = 'car';

    if (isPolice) {
      this.policeSpawnedInChase = true;
      vehicleType = 'police';
      const policeRes = this.createPoliceCar();
      group = policeRes.group;
      lights = policeRes.lights;
      w = 1.8;
      l = 4.05;
      vehicleSpeed = Math.max(150, this.speed * 0.85);
    } else {
      const roll = Math.random();
      if (roll < 0.22) {
        vehicleType = 'cng';
        group = HighwayVehicles.createDhakaCNG();
        w = 1.44;
        l = 2.68;
        vehicleSpeed = 62 + Math.random() * 26;
      } else if (roll < 0.36) {
        vehicleType = 'rickshaw';
        group = HighwayVehicles.createCycleRickshaw();
        w = 1.32;
        l = 2.65;
        vehicleSpeed = 28 + Math.random() * 14;
      } else if (roll < 0.5) {
        vehicleType = 'easybike';
        group = HighwayVehicles.createEasyBike();
        w = 1.48;
        l = 2.85;
        vehicleSpeed = 48 + Math.random() * 20;
      } else if (roll < 0.68) {
        vehicleType = 'dhaka_bus';
        group = HighwayVehicles.createDhakaCityBus();
        w = 2.45;
        l = 8.4;
        vehicleSpeed = 65 + Math.random() * 24;
      } else if (roll < 0.82) {
        vehicleType = 'bd_truck';
        group = HighwayVehicles.createBangladeshiTruck();
        w = 2.48;
        l = 7.6;
        vehicleSpeed = 54 + Math.random() * 18;
      } else if (roll < 0.91) {
        vehicleType = 'suv';
        group = HighwayVehicles.createHighwaySUV();
        w = 1.95;
        l = 4.4;
        vehicleSpeed = 88 + Math.random() * 35;
      } else {
        vehicleType = 'car';
        const paints = [0xd32f2f, 0x1976d2, 0xf8fafc, 0xf59e0b, 0x1e293b, 0x10b981];
        group = this.createCivilianCar(paints[Math.floor(Math.random() * paints.length)], false);
        w = 1.75;
        l = 3.9;
        vehicleSpeed = 90 + Math.random() * 36;
      }
    }

    this.enableShadowCasting(group);
    const spawnZ = -250;
    const initX = lane * this.laneWidth + this.getRoadCurveX(spawnZ);
    group.position.set(initX, 0, spawnZ);
    this.scene.add(group);

    this.traffic.push({
      group,
      lane,
      currentX: lane * this.laneWidth,
      targetLane: lane,
      laneChangeTimer: vehicleType === 'cng' || vehicleType === 'easybike' ? 1.8 + Math.random() * 2.8 : 3.2 + Math.random() * 5.0,
      speed: vehicleSpeed,
      isPolice,
      policeLights: lights,
      passed: false,
      cycle: 0,
      width: w,
      length: l,
      vehicleType,
    });
  }

  // --- PICKUP SPAWNER (FUEL, REPAIR, NITRO, CASH BUNDLE) ---
  private spawnRoadPickup() {
    const lane = Math.floor(Math.random() * 5) - 2;
    const group = new THREE.Group();

    // Prioritize Fuel or Repair when low!
    let type: 'nitro' | 'fuel' | 'repair' | 'cash_bundle';
    if (this.fuel < 40 && Math.random() < 0.65) {
      type = 'fuel';
    } else if (this.health < 55 && Math.random() < 0.55) {
      type = 'repair';
    } else {
      const cycle: Array<'fuel' | 'nitro' | 'repair' | 'cash_bundle'> = ['fuel', 'cash_bundle', 'nitro', 'repair'];
      type = cycle[this.pickupCycleIndex % cycle.length];
      this.pickupCycleIndex++;
    }

    if (type === 'fuel') {
      // Bright Orange-Red Jerrycan + Golden Glow Ring
      const can = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.92, 0.42),
        new THREE.MeshStandardMaterial({
          color: 0xf97316,
          emissive: 0xea580c,
          emissiveIntensity: 0.65,
          roughness: 0.35,
        })
      );
      group.add(can);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.62, 0.055, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    } else if (type === 'repair') {
      // Emerald Green Repair Crate + Cross
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.75, 0.75),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.65,
          roughness: 0.3,
        })
      );
      group.add(box);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      group.add(barH, barV);
    } else if (type === 'cash_bundle') {
      const bundle = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.45, 0.52),
        new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x16a34a,
          emissiveIntensity: 0.7,
          roughness: 0.35,
        })
      );
      group.add(bundle);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.48, 0.54), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      group.add(band);
    } else {
      const canister = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 1.1, 14),
        new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00ffff,
          emissiveIntensity: 0.65,
          metalness: 0.8,
          roughness: 0.2,
        })
      );
      group.add(canister);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.05, 8, 16),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    group.position.set(lane * this.laneWidth, 0.85, -240);
    this.scene.add(group);

    this.pickups.push({
      group,
      type,
      lane,
      z: -240,
      value: type === 'cash_bundle' ? 750 : 45,
      active: true,
    });
  }

  private spawnPassengerPickupStop() {
    const pickupStop = DHAKA_BUS_STOPS[Math.floor(Math.random() * DHAKA_BUS_STOPS.length)];
    let destStop = DHAKA_BUS_STOPS[Math.floor(Math.random() * DHAKA_BUS_STOPS.length)];
    if (destStop === pickupStop) {
      destStop = DHAKA_BUS_STOPS[(DHAKA_BUS_STOPS.indexOf(pickupStop) + 3) % DHAKA_BUS_STOPS.length];
    }
    const passengerName = DHAKA_PASSENGER_NAMES[Math.floor(Math.random() * DHAKA_PASSENGER_NAMES.length)];

    const stopGroup = createPassengerBusStop(false);
    const z = -235;
    stopGroup.position.set(this.getRoadCurveX(z), 0, z);
    this.scene.add(stopGroup);

    this.passengerStops.push({ group: stopGroup, z, isDropoff: false, active: true, wavePhase: 0 });
    this.passengerMission = {
      status: 'waiting_ahead',
      passengerName,
      pickupStopName: pickupStop,
      destinationName: destStop,
      fareTaka: 2400 + Math.floor(Math.random() * 1800),
      xpReward: 150 + Math.floor(Math.random() * 100),
      distanceRemaining: 238,
      timeRemaining: 24,
      needsSlowDown: true,
    };
  }

  private spawnPassengerDropoffStop(distAhead: number) {
    const dropGroup = createPassengerBusStop(true);
    const z = -Math.max(150, Math.min(260, distAhead));
    dropGroup.position.set(this.getRoadCurveX(z), 0, z);
    this.scene.add(dropGroup);
    this.passengerStops.push({ group: dropGroup, z, isDropoff: true, active: true, wavePhase: 0 });
  }

  // --- CONTROLS ---
  public moveLeft() {
    if (!this.isRunning || this.isPaused) return;
    if (this.lane > -2) {
      this.lane--;
      this.targetX = this.lane * this.laneWidth;
      sound.playTurn(true);
      sound.vibrate(20);
    }
  }

  public moveRight() {
    if (!this.isRunning || this.isPaused) return;
    if (this.lane < 2) {
      this.lane++;
      this.targetX = this.lane * this.laneWidth;
      sound.playTurn(false);
      sound.vibrate(20);
    }
  }

  public setBoost(boosting: boolean) {
    if (!this.isRunning || this.isPaused) {
      this.isBoosting = false;
      return;
    }
    if (boosting && this.nitro > 8 && this.fuel > 0) {
      if (!this.isBoosting) {
        sound.playNitro();
      }
      this.isBoosting = true;
      this.isBraking = false;
    } else {
      this.isBoosting = false;
    }
  }

  public setBrake(braking: boolean) {
    if (!this.isRunning || this.isPaused) {
      this.isBraking = false;
      return;
    }
    if (braking && !this.isBraking && this.speed > 170) {
      sound.playBrakeScreech();
    }
    this.isBraking = braking;
    if (braking) this.isBoosting = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!e || typeof e.key !== 'string') return;
    const k = e.key.toLowerCase();
    if (this.isReplaying && e.key === 'Escape') {
      e.preventDefault();
      this.stopReplay();
      return;
    }
    if (!this.isRunning) return;

    if (e.key === 'ArrowLeft' || k === 'a') {
      e.preventDefault();
      this.moveLeft();
    } else if (e.key === 'ArrowRight' || k === 'd') {
      e.preventDefault();
      this.moveRight();
    } else if (e.key === 'ArrowUp' || k === 'w' || e.key === 'Shift') {
      e.preventDefault();
      this.setBoost(true);
    } else if (e.key === 'ArrowDown' || k === 's') {
      e.preventDefault();
      this.setBrake(true);
    } else if (e.key === 'Escape' || e.key === ' ') {
      e.preventDefault();
      this.togglePause();
    } else if (k === 'r') {
      sound.cycleRadioStation();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!e || typeof e.key !== 'string') return;
    const k = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || k === 'w' || e.key === 'Shift') {
      this.setBoost(false);
    } else if (e.key === 'ArrowDown' || k === 's') {
      this.setBrake(false);
    }
  };

  private onWindowBlur = () => {
    this.isBoosting = false;
    this.isBraking = false;
  };

  public togglePause() {
    if (!this.isRunning) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.isBoosting = false;
      this.isBraking = false;
      sound.stopEngine();
    } else {
      sound.startEngine();
    }
  }

  private checkMissionProgress(type: CashMission['type'], amount: number) {
    const mission = this.missions[this.activeMissionIndex];
    if (mission && mission.type === type) {
      mission.progress += amount;
      if (mission.progress >= mission.target) {
        this.cashCollectedThisRun += mission.rewardTaka;
        this.xp += 120;
        this.driverLevel = Math.floor(this.xp / 500) + 1;
        this.onMissionComplete(mission);
        this.activeMissionIndex = (this.activeMissionIndex + 1) % this.missions.length;
        this.missions[this.activeMissionIndex].progress = 0;
      }
    }
  }

  private clearScheduledTimeouts() {
    if (this.crashTimeoutId !== null) {
      clearTimeout(this.crashTimeoutId);
      this.crashTimeoutId = null;
    }
    this.lightningTimeouts.forEach((id) => clearTimeout(id));
    this.lightningTimeouts = [];
  }

  public start() {
    this.clearScheduledTimeouts();
    if (this.isReplaying) {
      this.stopReplay();
    }
    this.replayFrames = [];

    this.isRunning = true;
    this.isPaused = false;
    this.isBoosting = false;
    this.isBraking = false;

    this.score = 0;
    this.distance = 0;
    this.speed = 165;
    this.maxSpeedAchieved = 165;
    this.nitro = 100;
    this.health = 100;
    this.maxHealth = 100;
    this.fuel = 100;
    this.maxFuel = 100;
    this.countdownTimer = 50;
    this.xp = 0;
    this.driverLevel = 1;
    this.passengersDropped = 0;
    this.shields = this.activeCar.maxShields ?? 5;
    this.maxShields = this.shields;
    this.combo = 1;
    this.comboTimer = 0;
    this.nearMisses = 0;
    this.cashCollectedThisRun = 0;
    this.lastCashDistanceChunk = 0;
    this.lastTimerDistanceChunk = 0;
    this.cameraShake = 0;
    this.suspensionY = 0;
    this.suspensionVelY = 0;
    this.suspensionPitch = 0;
    this.suspensionRoll = 0;
    this.currentSteerAngle = 0;

    this.lane = 0;
    this.targetX = 0;
    this.spawnTimer = 0;
    this.pickupTimer = 0;
    this.policeTimer = 0;
    this.policeActive = false;
    this.policeChaseIntensity = 0;
    this.policeSpawnedInChase = false;
    this.invulnerableTimer = 0;
    this.lightningTimer = 4.0;
    this.passengerSpawnCooldown = 4.0;
    this.passengerMission = {
      status: 'none',
      passengerName: '',
      pickupStopName: '',
      destinationName: '',
      fareTaka: 0,
      xpReward: 0,
      distanceRemaining: 0,
      timeRemaining: 0,
      needsSlowDown: false,
    };

    this.traffic.forEach((t) => this.disposeObject(t.group));
    this.traffic = [];
    this.pickups.forEach((p) => this.disposeObject(p.group));
    this.pickups = [];
    this.debrisList.forEach((d) => this.disposeObject(d.mesh));
    this.debrisList = [];
    this.passengerStops.forEach((ps) => this.disposeObject(ps.group));
    this.passengerStops = [];

    this.tireSmokeParticles.clear();
    this.dustTrailParticles.clear();
    this.nitroFlameParticles.clear();

    if (this.playerGroup) {
      this.playerGroup.position.set(0, 0, 3);
      this.playerGroup.rotation.set(0, 0, 0);
      this.playerGroup.visible = true;
    }
    if (this.playerBodyShell) {
      this.playerBodyShell.position.set(0, 0, 0);
      this.playerBodyShell.rotation.set(0, 0, 0);
    }

    this.currentFov = 65;
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 4.8, 9.8);
    this.camera.rotation.set(-0.22, 0, 0);

    this.currentWeatherType = 'clear';
    this.weatherTimer = 0;
    this.weatherDuration = 0;
    this.nextWeatherInterval = 20 + Math.random() * 12;
    this.weatherAlert = null;
    this.weatherAlertTimer = 0;
    this.updateWeatherTargets();
    this.buildWeatherParticles();

    sound.setInGame(true);
    sound.startEngine();
    sound.startMusic();
  }

  public stop() {
    this.clearScheduledTimeouts();
    if (this.isReplaying) {
      this.stopReplay();
    }
    this.isRunning = false;
    this.isPaused = false;
    this.isBoosting = false;
    this.isBraking = false;
    sound.setInGame(false);
    sound.stopEngine();
    sound.stopMusic();
  }

  private spawnCrashDebris(originX: number, originZ: number, count = 16) {
    const colors = [this.activeCar.bodyColor, 0xff5500, 0xffcc00, 0x334155, 0x00eaff];
    for (let i = 0; i < count; i++) {
      const size = 0.14 + Math.random() * 0.22;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.7, size * 1.4),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 1 })
      );
      mesh.position.set(
        originX + (Math.random() - 0.5) * 1.4,
        0.5 + Math.random() * 0.8,
        originZ + (Math.random() - 0.5) * 2.2
      );
      this.scene.add(mesh);
      this.debrisList.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 18, 4 + Math.random() * 10, (Math.random() - 0.5) * 14 - 4),
        rotVel: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
        life: 0.85 + Math.random() * 0.45,
      });
    }
  }

  private triggerGameOver(reason: GameEndReason) {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.isBoosting = false;
    this.isBraking = false;
    this.cameraShake = reason === 'wrecked' ? 1.6 : 0.65;
    sound.setInGame(false);
    if (reason === 'wrecked') {
      sound.playCrash();
    } else {
      sound.stopEngine();
    }
    sound.stopMusic();
    sound.vibrate(250);

    const px = this.playerGroup?.position.x || 0;
    const pz = this.playerGroup?.position.z || 3;
    if (reason === 'wrecked') {
      this.spawnCrashDebris(px, pz, 20);
      if (this.playerGroup) this.playerGroup.visible = false;
    }

    this.crashTimeoutId = window.setTimeout(() => {
      this.crashTimeoutId = null;
      this.onCrash(reason);
    }, reason === 'wrecked' ? 650 : 350);
  }

  private update(dt: number) {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
      if (this.playerGroup) {
        this.playerGroup.visible = Math.floor(performance.now() / 80) % 2 === 0;
      }
    } else if (this.playerGroup) {
      this.playerGroup.visible = true;
    }

    if (this.weatherAlertTimer > 0) {
      this.weatherAlertTimer -= dt;
      if (this.weatherAlertTimer <= 0) this.weatherAlert = null;
    }

    // Dynamic Weather Cycle
    this.weatherTimer += dt;
    if (this.currentWeatherType !== 'clear') {
      this.weatherDuration -= dt;
      if (this.weatherDuration <= 0) {
        this.setWeather('clear');
        this.weatherTimer = 0;
        this.nextWeatherInterval = 22 + Math.random() * 18;
      }
    } else if (this.weatherTimer >= this.nextWeatherInterval) {
      const choices: DynamicWeatherType[] = ['rain', 'fog', 'neon_snow'];
      this.setWeather(choices[Math.floor(Math.random() * choices.length)]);
      this.weatherDuration = 16 + Math.random() * 14;
      this.weatherTimer = 0;
    }

    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density += (this.targetFogDensity - this.scene.fog.density) * Math.min(1, dt * 1.5);
      this.scene.fog.color.lerp(this.targetFogColor, Math.min(1, dt * 1.5));
      this.scene.background = this.scene.fog.color;
    }
    if (this.ambientLight) {
      this.ambientLight.color.lerp(this.targetAmbientColor, Math.min(1, dt * 1.5));
      this.ambientLight.intensity += (this.targetAmbientIntensity - this.ambientLight.intensity) * Math.min(1, dt * 1.5);
    }

    const weather = this.getWeatherState();

    // Upgrades Calculations
    const engineUpgradeBonus = (this.upgrades.engineLevel - 1) * 24;
    const nitroUpgradeBonus = (this.upgrades.nitroLevel - 1) * 22;
    const gripUpgradeBonus = (this.upgrades.shieldLevel - 1) * 0.06;
    const steeringUpgradeMultiplier = 1 + (this.upgrades.shieldLevel - 1) * 0.12;
    const armorDamageReduction = Math.min(0.65, (this.upgrades.shieldLevel - 1) * 0.14);
    const multiplierBonus = 1 + (this.upgrades.multiplierLevel - 1) * 0.42;

    const baseTop = this.activeCar.topSpeed + engineUpgradeBonus;
    const boostPower = this.activeCar.nitroBoost + nitroUpgradeBonus;
    const level = Math.max(1, Math.floor(this.distance / 750) + 1);
    const difficulty = Math.min(2.4, 1 + (level - 1) * 0.12 + this.distance / 3500);
    const grip = Math.min(1.0, weather.gripFactor + gripUpgradeBonus);

    // Fuel Consumption Mechanic
    const fuelDrainBase = (1.35 + (this.speed / 460) * 1.15) * (this.isBoosting ? 2.15 : 1.0);
    this.fuel = Math.max(0, this.fuel - fuelDrainBase * dt);

    let targetSpeed: number;
    if (this.fuel <= 0) {
      this.isBoosting = false;
      targetSpeed = 0;
    } else if (this.isBraking) {
      targetSpeed = Math.max(115, baseTop * 0.36);
    } else {
      targetSpeed = baseTop * (0.58 + 0.42 * (difficulty / 2.4 + 0.3)) * (0.9 + 0.1 * grip);
      if (this.isBoosting && this.nitro > 0) {
        targetSpeed += boostPower;
        const drainRate = Math.max(14, 34 - (this.upgrades.nitroLevel - 1) * 4);
        this.nitro = Math.max(0, this.nitro - dt * drainRate);
        if (this.nitro <= 0) this.isBoosting = false;
      } else {
        const chargeRate = 3.8 + (this.upgrades.nitroLevel - 1) * 0.9;
        this.nitro = Math.min(100, this.nitro + dt * chargeRate);
      }
    }

    const accelLerp = this.fuel <= 0 ? 1.8 : this.isBraking ? 6.2 : this.isBoosting ? 5.2 : 2.5;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, accelLerp, dt);
    this.maxSpeedAchieved = Math.max(this.maxSpeedAchieved, this.speed);
    sound.updateEngine(this.speed / 460, this.isBoosting);

    if (this.fuel <= 0 && this.speed <= 22) {
      this.triggerGameOver('out_of_fuel');
      return;
    }

    // Countdown Timer & Urgent Beep
    this.countdownTimer = Math.max(0, this.countdownTimer - dt);
    if (this.countdownTimer <= 0) {
      this.triggerGameOver('time_up');
      return;
    }
    if (this.countdownTimer <= 8) {
      this.timerBeepAccum += dt;
      if (this.timerBeepAccum >= 0.95) {
        this.timerBeepAccum = 0;
        sound.playTimerBeep();
      }
    }

    // Dynamic FOV & Post-Processing Motion Blur Intensity
    const targetFov = Math.min(78, 64 + Math.max(0, (this.speed - 160) / 28) + (this.isBoosting ? 5.0 : 0) - (this.isBraking ? 3.0 : 0));
    if (Math.abs(targetFov - this.currentFov) > 0.05) {
      this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 5.5, dt);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.motionBlurPass) {
      const blurStrength =
        Math.max(0, (this.speed - 210) / 360) * 0.65 + (this.isBoosting ? 0.25 : 0);
      this.motionBlurPass.uniforms.uStrength.value = THREE.MathUtils.clamp(blurStrength, 0, 0.85);
    }

    for (let w = 0; w < this.playerWheels.length; w++) {
      this.playerWheels[w].rotation.x -= this.speed * 0.16 * dt;
    }

    if (this.headlightPoolMesh) {
      const isNight = !this.isDayTheme();
      const beamOp =
        this.currentWeatherType === 'fog' || this.currentWeatherType === 'rain' ? 0.68 : isNight ? 0.56 : 0.16;
      (this.headlightPoolMesh.material as THREE.MeshBasicMaterial).opacity = beamOp;
    }

    if (this.leftExhaust && this.rightExhaust) {
      this.leftExhaust.visible = this.isBoosting;
      this.rightExhaust.visible = this.isBoosting;
      if (this.isBoosting) {
        const flicker = 0.85 + Math.random() * 0.45;
        this.leftExhaust.scale.set(1, flicker, 1);
        this.rightExhaust.scale.set(1, flicker, 1);
      }
    }

    const forward = this.speed * 0.26 * dt;
    this.distance += forward;
    this.checkMissionProgress('distance', forward);

    // Distance Cash Chunks & Checkpoint Time Extensions
    const distChunk = Math.floor(this.distance / 50);
    if (distChunk > this.lastCashDistanceChunk) {
      const gainedChunks = distChunk - this.lastCashDistanceChunk;
      this.lastCashDistanceChunk = distChunk;
      this.cashCollectedThisRun += gainedChunks * Math.round(45 * multiplierBonus);
      this.xp += gainedChunks * 4;
      this.driverLevel = Math.floor(this.xp / 500) + 1;
    }

    const timerChunk = Math.floor(this.distance / 500);
    if (timerChunk > this.lastTimerDistanceChunk) {
      this.lastTimerDistanceChunk = timerChunk;
      this.countdownTimer = Math.min(75, this.countdownTimer + 11);
      sound.tone(740, 0.1, 'triangle', 0.14);
    }

    this.score += this.speed * 0.18 * (this.isBoosting ? 2.4 : 1.0) * dt * this.combo * weather.bonusMultiplier;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1;
    }

    // Police Chase Pursuit Triggers (aggressive when speeding > 265 KM/H)
    this.policeTimer += dt * (this.speed > 265 ? 1.8 : 1.0);
    if (!this.policeActive && this.policeTimer > 22) {
      this.policeActive = true;
      this.policeSpawnedInChase = false;
      this.policeTimer = 0;
      this.policeChaseIntensity = 0.85;
      sound.playSiren();
      this.spawnTraffic(true);
    } else if (this.policeActive) {
      this.policeChaseIntensity = Math.min(1, 0.55 + Math.sin(performance.now() * 0.005) * 0.25 + (this.speed > 320 ? 0.2 : 0));
      if (this.policeTimer > 18) {
        // Survived pursuit -> Cash + XP escape bonus!
        this.policeActive = false;
        this.policeChaseIntensity = 0;
        this.policeTimer = 0;
        this.cashCollectedThisRun += Math.round(1200 * multiplierBonus);
        this.xp += 95;
        this.driverLevel = Math.floor(this.xp / 500) + 1;
      }
    }

    // Steering, Suspension & Wheel Angle Kinematics
    let handlingSpeed = 14.2 * steeringUpgradeMultiplier;
    let bodyRollFactor = 0.075;
    if (this.currentWeatherType === 'rain') {
      handlingSpeed = 10.4 * steeringUpgradeMultiplier;
      bodyRollFactor = 0.115;
    } else if (this.currentWeatherType === 'neon_snow') {
      handlingSpeed = 8.0 * steeringUpgradeMultiplier;
      bodyRollFactor = 0.155;
    }

    this.radioNewsTimer += dt;
    if (this.radioNewsTimer > 9.5) {
      sound.updateRadioTrafficNews();
      this.radioNewsTimer = 0;
    }

    const pz = this.playerGroup?.position.z || 3;
    const targetWorldX = this.targetX + this.getRoadCurveX(pz);
    let steerDeltaX = 0;

    if (this.playerGroup) {
      steerDeltaX = targetWorldX - this.playerGroup.position.x;
      this.playerGroup.position.x = THREE.MathUtils.damp(this.playerGroup.position.x, targetWorldX, handlingSpeed, dt);

      const roadHeading = Math.atan2(this.getRoadCurveX(pz - 3) - this.getRoadCurveX(pz + 3), 6);
      this.playerGroup.rotation.y = roadHeading + (-steerDeltaX * 0.036);

      // Front Wheel Visual Steering Turn
      const targetWheelSteer = THREE.MathUtils.clamp(-steerDeltaX * 0.14, -0.42, 0.42);
      this.currentSteerAngle = THREE.MathUtils.damp(this.currentSteerAngle, targetWheelSteer, 15, dt);
      for (let i = 0; i < this.frontWheelSteerPivots.length; i++) {
        this.frontWheelSteerPivots[i].rotation.y = this.currentSteerAngle;
      }

      // Suspension Pitch (dip forward on brake, squat back on Nitro), Roll, & Speed-Breaker Bounce
      const targetPitch = this.isBraking ? -0.055 : this.isBoosting ? 0.048 : 0.0;
      const targetRoll = -steerDeltaX * bodyRollFactor;
      this.suspensionPitch = THREE.MathUtils.damp(this.suspensionPitch, targetPitch, 10, dt);
      this.suspensionRoll = THREE.MathUtils.damp(this.suspensionRoll, targetRoll, 12, dt);

      // Damped harmonic spring for vertical suspension
      const springAccel = -140 * this.suspensionY - 15 * this.suspensionVelY;
      this.suspensionVelY += springAccel * dt;
      this.suspensionY += this.suspensionVelY * dt;

      if (this.playerBodyShell) {
        this.playerBodyShell.position.y = Math.max(-0.08, Math.min(0.42, this.suspensionY));
        this.playerBodyShell.rotation.x = this.suspensionPitch;
        this.playerBodyShell.rotation.z = this.suspensionRoll;
      }
    }

    // Update Shadow Light Frustum to track player car tightly
    const px = this.playerGroup?.position.x || 0;
    if (this.dirLightA && !this.isSoftwareGl) {
      this.dirLightA.position.set(px + 28, 48, pz - 16);
      this.dirLightA.target.position.set(px, 0, pz - 16);
      this.dirLightA.target.updateMatrixWorld();
    }

    // Road Movement
    const roadMovement = (this.speed * 0.065 + 12) * dt;

    // Emit 4D Particle Effects (Tire Smoke, Road Dust, Glowing Nitro Flames)
    this.particleSpawnAccum += dt;
    if (this.particleSpawnAccum >= 0.022 && this.playerGroup) {
      this.particleSpawnAccum = 0;
      const isDrifting = Math.abs(steerDeltaX) > 0.42 || this.isBraking || this.currentWeatherType === 'neon_snow';
      if (isDrifting && this.speed > 95) {
        this.tireSmokeParticles.emit(
          px - 0.9 + (Math.random() - 0.5) * 0.25,
          0.18,
          pz + 1.3,
          (Math.random() - 0.5) * 2.2,
          0.9 + Math.random() * 1.1,
          2.0,
          0.86,
          0.89,
          0.94,
          0.42
        );
        this.tireSmokeParticles.emit(
          px + 0.9 + (Math.random() - 0.5) * 0.25,
          0.18,
          pz + 1.3,
          (Math.random() - 0.5) * 2.2,
          0.9 + Math.random() * 1.1,
          2.0,
          0.86,
          0.89,
          0.94,
          0.42
        );
      }
      if (this.speed > 175) {
        const side = Math.random() > 0.5 ? 0.9 : -0.9;
        this.dustTrailParticles.emit(
          px + side + (Math.random() - 0.5) * 0.3,
          0.12,
          pz + 1.4,
          (Math.random() - 0.5) * 1.4,
          0.45 + Math.random() * 0.5,
          3.2,
          0.65,
          0.6,
          0.52,
          0.32
        );
      }
      if (this.isBoosting) {
        [-0.4, 0.4].forEach((ex) => {
          const hot = Math.random() > 0.35;
          this.nitroFlameParticles.emit(
            px + ex + (Math.random() - 0.5) * 0.14,
            0.42 + (Math.random() - 0.5) * 0.1,
            pz + 2.25,
            (Math.random() - 0.5) * 0.9,
            (Math.random() - 0.5) * 0.6,
            10 + Math.random() * 6,
            hot ? 0.15 : 1.0,
            hot ? 0.92 : 0.45,
            hot ? 1.0 : 0.12,
            0.22
          );
        });
      }
    }

    this.tireSmokeParticles.update(dt, roadMovement * 0.55);
    this.dustTrailParticles.update(dt, roadMovement * 0.65);
    this.nitroFlameParticles.update(dt, roadMovement * 0.25);

    // PBR Road & Terrain Scrolling
    if (this.roadTexBundle) {
      const uvDelta = (roadMovement * this.roadTexBundle.repeatY) / 1500;
      this.roadTexBundle.map.offset.y = (this.roadTexBundle.map.offset.y + uvDelta) % 1;
      this.roadTexBundle.bumpMap.offset.y = (this.roadTexBundle.bumpMap.offset.y + uvDelta) % 1;
      this.roadTexBundle.roughnessMap.offset.y = (this.roadTexBundle.roughnessMap.offset.y + uvDelta) % 1;
    }
    if (this.terrainTexBundle) {
      const tDelta = (roadMovement * this.terrainTexBundle.repeatY) / 1500;
      this.terrainTexBundle.map.offset.y = (this.terrainTexBundle.map.offset.y + tDelta) % 1;
    }

    // Dynamic Road Curve Mesh Bending
    if (this.roadMesh && this.currentTheme.hasCurves && this.roadMesh.userData.baseXs) {
      const posAttr = this.roadMesh.geometry.attributes.position;
      const baseXs: Float32Array = this.roadMesh.userData.baseXs;
      for (let i = 0; i < posAttr.count; i++) {
        const worldZ = this.roadMesh.position.z - posAttr.getY(i);
        posAttr.setX(i, baseXs[i] + this.getRoadCurveX(worldZ));
      }
      posAttr.needsUpdate = true;
    }
    if (this.secondaryRoadMesh && this.currentTheme.hasCurves && this.secondaryRoadMesh.userData.baseXs) {
      const posAttr = this.secondaryRoadMesh.geometry.attributes.position;
      const baseXs: Float32Array = this.secondaryRoadMesh.userData.baseXs;
      for (let i = 0; i < posAttr.count; i++) {
        const worldZ = this.secondaryRoadMesh.position.z - posAttr.getY(i);
        posAttr.setX(i, baseXs[i] + this.getRoadCurveX(worldZ));
      }
      posAttr.needsUpdate = true;
    }

    this.roadLines.forEach((line) => {
      line.position.z += roadMovement;
      if (line.position.z > 25) line.position.z -= 1400;
      if (line.userData.baseX !== undefined) {
        line.position.x = line.userData.baseX + this.getRoadCurveX(line.position.z);
        const dCurv = this.getRoadCurveX(line.position.z - 3) - this.getRoadCurveX(line.position.z + 3);
        line.rotation.y = Math.atan2(dCurv, 6);
      }
    });

    this.guardrails.forEach((rail) => {
      rail.position.z += roadMovement;
      if (rail.position.z > 25) rail.position.z -= 1400;
      if (rail.userData.side !== undefined) {
        rail.position.x = rail.userData.side * 14.2 + this.getRoadCurveX(rail.position.z);
        const dCurv = this.getRoadCurveX(rail.position.z - 4) - this.getRoadCurveX(rail.position.z + 4);
        rail.rotation.y = Math.atan2(dCurv, 8);
      }
    });

    // Dhaka Speed Breakers Update + Suspension Bounce Physics
    this.speedBreakers.forEach((sb) => {
      sb.z += roadMovement;
      if (sb.z > 30) {
        sb.z -= 1200;
        sb.triggered = false;
      }
      sb.group.position.z = sb.z;
      sb.group.position.x = this.getRoadCurveX(sb.z);
      const dCurv = this.getRoadCurveX(sb.z - 3) - this.getRoadCurveX(sb.z + 3);
      sb.group.rotation.y = Math.atan2(dCurv, 6);

      if (!sb.triggered && Math.abs(sb.z - pz) < 1.8) {
        sb.triggered = true;
        if (this.speed > 240) {
          this.suspensionVelY = 4.4;
          this.cameraShake = Math.max(this.cameraShake, 0.38);
          this.speed *= 0.9;
          sound.tone(110, 0.08, 'triangle', 0.16);
        } else {
          this.suspensionVelY = 1.9;
        }
      }
    });

    // Passenger Pickup & Drop-off Management
    if (this.passengerMission.status === 'none') {
      this.passengerSpawnCooldown -= dt;
      if (this.passengerSpawnCooldown <= 0) {
        this.spawnPassengerPickupStop();
        this.passengerSpawnCooldown = 14;
      }
    } else if (this.passengerMission.status === 'onboard') {
      this.passengerMission.distanceRemaining = Math.max(0, this.passengerMission.distanceRemaining - forward);
      this.passengerMission.timeRemaining = Math.max(0, this.passengerMission.timeRemaining - dt);
      if (this.passengerMission.timeRemaining <= 0) {
        // Missed tight deadline for passenger! Passenger leaves disappointed without fare
        this.passengerMission.status = 'none';
        this.passengerSpawnCooldown = 8;
        this.passengerStops = this.passengerStops.filter((s) => {
          if (s.isDropoff) {
            this.disposeObject(s.group);
            return false;
          }
          return true;
        });
      }
    }

    for (let i = this.passengerStops.length - 1; i >= 0; i--) {
      const stop = this.passengerStops[i];
      stop.z += roadMovement;
      stop.group.position.z = stop.z;
      stop.group.position.x = this.getRoadCurveX(stop.z);
      const dCurv = this.getRoadCurveX(stop.z - 4) - this.getRoadCurveX(stop.z + 4);
      stop.group.rotation.y = Math.atan2(dCurv, 8);

      stop.wavePhase += dt * 7;
      const paxObj = stop.group.getObjectByName('WaitingPassenger');
      if (paxObj) {
        paxObj.position.y = 0.12 + Math.abs(Math.sin(stop.wavePhase)) * 0.12;
      }

      if (stop.active && !stop.isDropoff && this.passengerMission.status === 'waiting_ahead') {
        this.passengerMission.distanceRemaining = Math.max(0, Math.round(pz - stop.z));
      }

      const roadCurveX = this.getRoadCurveX(stop.z);
      const playerLocalX = px - roadCurveX;
      const inPickupLaneZone = playerLocalX >= 2.2; // Right half / shoulder lanes (lanes 1 or 2)
      const closeZ = Math.abs(stop.z - pz) < 10.5;

      if (stop.active && closeZ && inPickupLaneZone) {
        if (!stop.isDropoff) {
          // Pickup check: slow down <= 290 or braking makes boarding reliable
          if (this.speed <= 295 || this.isBraking) {
            stop.active = false;
            sound.playPassengerBoard();
            this.passengerMission.status = 'onboard';
            const tripDist = 360 + Math.floor(Math.random() * 140);
            this.passengerMission.distanceRemaining = tripDist;
            this.passengerMission.timeRemaining = 26;
            this.passengerMission.needsSlowDown = false;
            this.spawnPassengerDropoffStop(240);
          }
        } else if (this.passengerMission.status === 'onboard') {
          if (this.speed <= 315 || this.isBraking) {
            stop.active = false;
            sound.playPassengerDropoff();
            const earned = Math.round(this.passengerMission.fareTaka * multiplierBonus);
            this.cashCollectedThisRun += earned;
            this.xp += this.passengerMission.xpReward;
            this.driverLevel = Math.floor(this.xp / 500) + 1;
            this.passengersDropped += 1;
            this.countdownTimer = Math.min(75, this.countdownTimer + 18);
            this.score += earned * 1.5;
            this.passengerMission.status = 'none';
            this.passengerSpawnCooldown = 10;
            this.onCashCollected(earned, `যাত্রী নামানো হয়েছে (${this.passengerMission.destinationName})`);
          }
        }
      }

      if (stop.z > 32) {
        if (!stop.isDropoff && stop.active && this.passengerMission.status === 'waiting_ahead') {
          this.passengerMission.status = 'none';
          this.passengerSpawnCooldown = 9;
        } else if (stop.isDropoff && stop.active && this.passengerMission.status === 'onboard') {
          // Respawn drop-off beacon further ahead if player missed right curb at high speed
          stop.z = -190;
          stop.group.position.z = stop.z;
          continue;
        }
        this.disposeObject(stop.group);
        this.passengerStops.splice(i, 1);
      }
    }

    // Rain puddles & wipers
    const isRain = this.currentWeatherType === 'rain' || this.currentTheme.weather === 'rain';
    this.rainPuddles.forEach((puddle) => {
      if (isRain) {
        puddle.userData.scale += dt * puddle.userData.speed;
        puddle.scale.set(puddle.userData.scale, puddle.userData.scale, 1);
        (puddle.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - puddle.userData.scale * 0.22);
        if (puddle.userData.scale > 3.2) {
          puddle.userData.scale = 0.2;
          puddle.position.set((Math.random() - 0.5) * 16 + this.getRoadCurveX(puddle.position.z), 0.025, -Math.random() * 90);
        }
      } else {
        (puddle.material as THREE.MeshBasicMaterial).opacity = 0;
      }
    });

    if (isRain && this.leftWiper && this.rightWiper) {
      this.wiperAngle += dt * 8.0;
      const swing = Math.sin(this.wiperAngle) * 0.55;
      this.leftWiper.rotation.z = -0.1 + swing;
      this.rightWiper.rotation.z = -0.1 + swing;
    } else if (this.leftWiper && this.rightWiper) {
      this.leftWiper.rotation.z = -0.5;
      this.rightWiper.rotation.z = -0.5;
    }

    if (isRain) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 7 + Math.random() * 10;
        if (this.ambientLight) {
          const prevInt = this.targetAmbientIntensity;
          this.ambientLight.intensity = 3.5;
          this.lightningTimeouts.push(window.setTimeout(() => { if (this.ambientLight) this.ambientLight.intensity = prevInt; }, 120));
        }
        sound.tone(75, 0.45, 'sawtooth', 0.22);
      }
    }

    if (this.oceanMesh) {
      this.oceanTime += dt * 1.6;
      this.oceanMesh.position.y = -0.6 + Math.sin(this.oceanTime) * 0.15;
    }

    this.marineDriveObjects.forEach((mObj) => {
      mObj.position.z += roadMovement;
      if (mObj.position.z > 60) mObj.position.z -= 1300;
      if (mObj.userData.baseX !== undefined) {
        mObj.position.x = mObj.userData.baseX + this.getRoadCurveX(mObj.position.z);
      }
    });

    this.buildings.forEach((b) => {
      b.position.z += roadMovement * 0.85;
      if (b.position.z > 60) b.position.z -= 1300;
      if (b.userData.baseX !== undefined) {
        b.position.x = b.userData.baseX + this.getRoadCurveX(b.position.z);
      }
    });

    this.roadsideTrees.forEach((t) => {
      t.position.z += roadMovement;
      if (t.position.z > 40) t.position.z -= 1300;
      if (t.userData.baseX !== undefined) {
        t.position.x = t.userData.baseX + this.getRoadCurveX(t.position.z);
      }
    });

    this.streetLamps.forEach((lamp) => {
      lamp.position.z += roadMovement;
      if (lamp.position.z > 35) lamp.position.z -= 1300;
      if (lamp.userData.baseX !== undefined) {
        lamp.position.x = lamp.userData.baseX + this.getRoadCurveX(lamp.position.z);
        const dCurv = this.getRoadCurveX(lamp.position.z - 3) - this.getRoadCurveX(lamp.position.z + 3);
        lamp.rotation.y = Math.atan2(dCurv, 6);
      }
    });

    this.metroRailPillars.forEach((p) => {
      p.position.z += roadMovement;
      if (p.position.z > 40) p.position.z -= 1300;
      p.position.x = (p.userData.baseX ?? -17.5) + this.getRoadCurveX(p.position.z);
      const dCurv = this.getRoadCurveX(p.position.z - 4) - this.getRoadCurveX(p.position.z + 4);
      p.rotation.y = Math.atan2(dCurv, 8);
    });

    this.overheadSignboards.forEach((s) => {
      s.position.z += roadMovement;
      if (s.position.z > 35) s.position.z -= 1080;
      s.position.x = (s.userData.baseX ?? 0) + this.getRoadCurveX(s.position.z);
      const dCurv = this.getRoadCurveX(s.position.z - 4) - this.getRoadCurveX(s.position.z + 4);
      s.rotation.y = Math.atan2(dCurv, 8);
    });

    this.pedestrianManager.update(dt, roadMovement, (z) => this.getRoadCurveX(z));
    this.updateSecondaryTraffic(dt, roadMovement);

    if (this.metroTrain) {
      this.metroTrain.position.z += roadMovement - 26 * dt;
      if (this.metroTrain.position.z > 80) this.metroTrain.position.z -= 1300;
      this.metroTrain.position.x = (this.metroTrain.userData.baseX ?? -17.5) + this.getRoadCurveX(this.metroTrain.position.z);
      const dCurv = this.getRoadCurveX(this.metroTrain.position.z - 6) - this.getRoadCurveX(this.metroTrain.position.z + 6);
      this.metroTrain.rotation.y = Math.atan2(dCurv, 12);
    }

    if (this.cloudsGroup) {
      this.cloudsGroup.children.forEach((c) => {
        c.position.x += dt * 4;
        if (c.position.x > 320) c.position.x = -320;
      });
    }

    if (this.weatherParticles && this.weatherPositions) {
      const currentActiveWeather = this.currentWeatherType !== 'clear' ? this.currentWeatherType : this.currentTheme.weather;
      const count = this.weatherPositions.length / 3;
      for (let i = 0; i < count; i++) {
        const idx = i * 3;
        if (currentActiveWeather === 'rain') {
          this.weatherPositions[idx + 1] -= dt * 195;
          this.weatherPositions[idx + 2] += roadMovement * 0.95;
          if (this.weatherPositions[idx + 1] < 0) {
            this.weatherPositions[idx + 1] = 24;
            this.weatherPositions[idx + 2] = -Math.random() * 220;
          }
        } else if (currentActiveWeather === 'fog') {
          this.weatherPositions[idx + 2] += roadMovement * 0.45;
          if (this.weatherPositions[idx + 2] > 25) this.weatherPositions[idx + 2] = -220;
        } else if (currentActiveWeather === 'neon_snow') {
          this.weatherPositions[idx + 1] -= dt * 14;
          this.weatherPositions[idx + 2] += roadMovement * 0.55;
          if (this.weatherPositions[idx + 1] < 0) {
            this.weatherPositions[idx + 1] = 24;
            this.weatherPositions[idx + 2] = -Math.random() * 220;
          }
        } else if (currentActiveWeather === 'embers') {
          this.weatherPositions[idx + 1] += dt * 12;
          if (this.weatherPositions[idx + 1] > 25) this.weatherPositions[idx + 1] = 0;
        } else if (currentActiveWeather === 'warp_stars') {
          this.weatherPositions[idx + 2] += (this.speed * 0.28 + 20) * dt;
          if (this.weatherPositions[idx + 2] > 20) this.weatherPositions[idx + 2] = -240;
        }
      }
      this.weatherParticles.geometry.attributes.position.needsUpdate = true;
    }

    // Traffic & Pickup Spawners
    this.spawnTimer += dt;
    const spawnInterval = Math.max(0.45, 0.95 - (level - 1) * 0.05 - this.distance / 11000);
    if (this.spawnTimer > spawnInterval) {
      this.spawnTraffic();
      this.spawnTimer = 0;
    }

    this.pickupTimer += dt;
    if (this.pickupTimer > 2.4) {
      this.spawnRoadPickup();
      this.pickupTimer = 0;
    }

    // Camera Shake & Smooth Follow
    if (this.cameraShake > 0) {
      this.cameraShake -= dt * 2.8;
      const shakeAmt = Math.max(0, this.cameraShake) * 0.45;
      this.camera.position.x = px * 0.65 + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y = 4.8 + (Math.random() - 0.5) * shakeAmt;
    } else {
      this.camera.position.x = px * 0.65;
      this.camera.position.y = 4.8;
    }

    // Traffic AI (Chaotic Dhaka weaving + Aggressive Police Pursuit Blocking!)
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      let relSpeed = (this.speed - t.speed) * 0.055 + 9;

      if (t.isPolice && this.policeActive) {
        // Aggressive Police Pursuit: tries to cut into player's lane ahead of player to block!
        const zDiff = pz - t.group.position.z;
        if (zDiff > 8 && zDiff < 60) {
          t.targetLane = this.lane;
          t.lane = this.lane;
          relSpeed = (this.speed - Math.max(120, this.speed * 0.88)) * 0.055 + 3.5;
        }
      } else {
        // Smart chaotic Dhaka traffic AI weaving
        t.laneChangeTimer -= dt;
        if (t.laneChangeTimer <= 0 && Math.abs(t.group.position.z - pz) > 16) {
          const shift = Math.random() > 0.5 ? 1 : -1;
          const candidateLane = Math.max(-2, Math.min(2, t.lane + shift));
          if (candidateLane !== t.lane) {
            const blocked = this.traffic.some(
              (other) =>
                other !== t &&
                (other.lane === candidateLane || other.targetLane === candidateLane) &&
                Math.abs(other.group.position.z - t.group.position.z) < (t.length + other.length) * 0.65 + 9
            );
            if (!blocked) {
              t.targetLane = candidateLane;
              t.lane = candidateLane;
            }
          }
          t.laneChangeTimer = t.vehicleType === 'cng' || t.vehicleType === 'easybike' ? 2.2 + Math.random() * 3.0 : 4.0 + Math.random() * 6.0;
        }
      }

      const targetLaneX = t.targetLane * this.laneWidth;
      t.currentX += (targetLaneX - t.currentX) * Math.min(1, dt * (t.isPolice ? 3.8 : 2.5));

      t.group.position.z += relSpeed * dt;
      t.group.position.x = t.currentX + this.getRoadCurveX(t.group.position.z);
      const dCurve = this.getRoadCurveX(t.group.position.z - 3) - this.getRoadCurveX(t.group.position.z + 3);
      t.group.rotation.y = Math.atan2(dCurve, 6);

      if (t.isPolice && t.policeLights) {
        t.cycle += dt * 16;
        const phase = Math.sin(t.cycle);
        t.policeLights.r.intensity = phase > 0 ? 3.8 : 0.2;
        t.policeLights.b.intensity = phase <= 0 ? 3.8 : 0.2;
      }

      const cx = Math.abs(px - t.group.position.x);
      const cz = Math.abs(pz - t.group.position.z);
      const hitX = t.width * 0.44 + 0.82;
      const hitZ = t.length * 0.44 + 1.88;

      // Near-Miss Bonus
      if (!t.passed && t.group.position.z - t.length * 0.42 > pz) {
        t.passed = true;
        if (cx >= hitX && cx < hitX + 1.8) {
          this.combo = Math.min(8, this.combo + 1);
          this.comboTimer = 3.8;
          this.nearMisses++;
          this.nitro = Math.min(100, this.nitro + 16);
          const cashBonus = Math.round(80 * this.combo * multiplierBonus);
          this.cashCollectedThisRun += cashBonus;
          this.xp += 18;
          this.driverLevel = Math.floor(this.xp / 500) + 1;
          this.score += 360 * this.combo * weather.bonusMultiplier;
          sound.playNearMiss();
          this.onNearMissOvertake(this.combo, cashBonus);
          this.checkMissionProgress('near_miss', 1);
        }
      }

      // Collision with Vehicle Damage System
      if (this.invulnerableTimer <= 0 && cx < hitX && cz < hitZ) {
        const isHeavy = t.vehicleType === 'dhaka_bus' || t.vehicleType === 'bd_truck' || t.vehicleType === 'bus' || t.vehicleType === 'truck' || t.isPolice;
        const rawDamage = (isHeavy ? 42 : 28) + (this.speed / 450) * 30;
        const actualDamage = Math.max(14, Math.round(rawDamage * (1 - armorDamageReduction)));
        this.health = Math.max(0, this.health - actualDamage);
        this.combo = 1;
        this.comboTimer = 0;

        if (this.health <= 0) {
          this.triggerGameOver('wrecked');
          break;
        } else {
          // Survivable Impact: Sparks, Camera Shake, Slowdown & Knockback Separation
          this.invulnerableTimer = 1.15;
          this.cameraShake = 1.05;
          this.speed = Math.max(95, this.speed * 0.44);
          this.suspensionVelY = 3.8;
          this.spawnCrashDebris(px, pz, 10);
          sound.playDamageImpact();
          sound.vibrate(140);

          // Push traffic car forward/away cleanly so collision never loops
          t.group.position.z -= 12;
        }
      }

      if (t.group.position.z > 32) {
        this.disposeObject(t.group);
        this.traffic.splice(i, 1);
      }
    }

    // Spatial Traffic Horns
    this.trafficHornTimer -= dt;
    this.spatialAudioTimer += dt;
    if (this.spatialAudioTimer > 0.1) {
      this.spatialAudioTimer = 0;
      let closestDist = 999;
      let closestRelX = 0;
      let closestRelZ = 0;
      let closestType: TrafficVehicleKind = 'car';

      for (const t of this.traffic) {
        const rx = t.group.position.x - px;
        const rz = t.group.position.z - pz;
        const dist = Math.hypot(rx, rz);
        if (dist < closestDist) {
          closestDist = dist;
          closestRelX = rx;
          closestRelZ = rz;
          closestType = t.vehicleType;
        }
      }

      if (this.trafficHornTimer <= 0 && closestDist < 42) {
        sound.playDhakaTrafficHorn(closestType, closestRelX, closestRelZ);
        this.trafficHornTimer = 2.0 + Math.random() * 3.2;
      }
    }

    // Pickups Update (Fuel, Repair, Nitro, Cash) + Magnet Pull
    const magnetPullRadius = 3.6 + (this.upgrades.magnetLevel - 1) * 3.4;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.group.position.z += roadMovement;
      p.group.position.x = p.lane * this.laneWidth + this.getRoadCurveX(p.group.position.z);
      p.group.rotation.y += dt * 3.5;

      if (this.playerGroup && p.active) {
        const distToCar = this.playerGroup.position.distanceTo(p.group.position);
        if (distToCar < magnetPullRadius && distToCar >= 2.6) {
          const targetLane = (this.playerGroup.position.x - this.getRoadCurveX(p.group.position.z)) / this.laneWidth;
          p.lane += (targetLane - p.lane) * Math.min(1, dt * 9.0);
          p.group.position.x = p.lane * this.laneWidth + this.getRoadCurveX(p.group.position.z);
        }
        if (distToCar < 2.6) {
          p.active = false;
          if (p.type === 'fuel') {
            this.fuel = Math.min(100, this.fuel + 45);
            sound.playFuelPickup();
          } else if (p.type === 'repair') {
            this.health = Math.min(100, this.health + 40);
            sound.playRepairPickup();
          } else if (p.type === 'cash_bundle') {
            const cashVal = Math.round(p.value * multiplierBonus);
            this.cashCollectedThisRun += cashVal;
            sound.playCashCollect();
            this.onCashCollected(cashVal, 'ক্যাশ বান্ডিল');
          } else {
            this.nitro = 100;
            this.cashCollectedThisRun += Math.round(110 * multiplierBonus);
            sound.tone(620, 0.1, 'sine', 0.16);
          }
          this.score += 220;
          this.xp += 25;
          this.driverLevel = Math.floor(this.xp / 500) + 1;
          this.checkMissionProgress('cash_collect', 1);
          this.disposeObject(p.group);
          this.pickups.splice(i, 1);
          continue;
        }
      }

      if (p.group.position.z > 25) {
        this.disposeObject(p.group);
        this.pickups.splice(i, 1);
      }
    }

    // Update debris
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life -= dt;
      d.vel.y -= 24 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vel.y *= -0.45;
      }
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life);
      if (d.life <= 0) {
        this.disposeObject(d.mesh);
        this.debrisList.splice(i, 1);
      }
    }

    // Record Replay Frame
    this.replayFrames.push({
      playerX: px,
      playerRotY: this.playerGroup?.rotation.y || 0,
      playerRotZ: this.playerGroup?.rotation.z || 0,
      speed: this.speed,
      roadMovement,
      distance: this.distance,
    });
    if (this.replayFrames.length > 320) this.replayFrames.shift();

    // Broadcast Live Telemetry Stats
    this.onStatsUpdate({
      score: Math.floor(this.score),
      distance: Math.floor(this.distance),
      speed: Math.floor(this.speed),
      maxSpeed: Math.floor(this.maxSpeedAchieved),
      nitro: Math.floor(this.nitro),
      health: Math.floor(this.health),
      maxHealth: this.maxHealth,
      fuel: Math.floor(this.fuel),
      maxFuel: this.maxFuel,
      countdownTimer: Math.ceil(this.countdownTimer),
      xp: this.xp,
      driverLevel: this.driverLevel,
      passengersDropped: this.passengersDropped,
      passengerMission: { ...this.passengerMission },
      isBraking: this.isBraking,
      shields: this.shields,
      maxShields: this.maxShields,
      combo: this.combo,
      comboTimer: this.comboTimer,
      policeActive: this.policeActive,
      policeChaseIntensity: this.policeChaseIntensity,
      policeEscortActive: false,
      policeEscortTimer: 0,
      policeEscortMultiplier: 1.0,
      nearMisses: this.nearMisses,
      cashCollectedThisRun: this.cashCollectedThisRun,
      activeMission: this.missions[this.activeMissionIndex],
      magnetActive: this.upgrades.magnetLevel > 1,
      level,
      weather: weather,
      weatherAlert: this.weatherAlert,
      radio: sound.getRadioState(),
    });
  }

  public playCinematicReplay(onFinished?: () => void) {
    if (this.replayFrames.length === 0) {
      if (onFinished) onFinished();
      return;
    }
    this.isReplaying = true;
    this.replayIndex = 0;
    this.onReplayFinished = onFinished || null;
    if (this.playerGroup) this.playerGroup.visible = true;
  }

  public stopReplay() {
    this.isReplaying = false;
    this.replayIndex = 0;
    this.currentFov = 65;
    this.camera.fov = 65;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 4.8, 9.8);
    this.camera.rotation.set(-0.22, 0, 0);
    if (this.onReplayFinished) {
      const cb = this.onReplayFinished;
      this.onReplayFinished = null;
      cb();
    }
  }

  private updateReplay(dt: number) {
    if (this.replayIndex >= this.replayFrames.length) {
      this.stopReplay();
      return;
    }
    const frame = this.replayFrames[this.replayIndex++];
    if (this.playerGroup) {
      this.playerGroup.position.x = frame.playerX;
      this.playerGroup.rotation.y = frame.playerRotY;
      this.playerGroup.rotation.z = frame.playerRotZ;
    }
    for (let w = 0; w < this.playerWheels.length; w++) {
      this.playerWheels[w].rotation.x -= frame.speed * 0.16 * dt;
    }

    if (this.roadTexBundle) {
      const uvDelta = (frame.roadMovement * this.roadTexBundle.repeatY) / 1500;
      this.roadTexBundle.map.offset.y = (this.roadTexBundle.map.offset.y + uvDelta) % 1;
      this.roadTexBundle.bumpMap.offset.y = (this.roadTexBundle.bumpMap.offset.y + uvDelta) % 1;
      this.roadTexBundle.roughnessMap.offset.y = (this.roadTexBundle.roughnessMap.offset.y + uvDelta) % 1;
    }
    if (this.terrainTexBundle) {
      const tDelta = (frame.roadMovement * this.terrainTexBundle.repeatY) / 1500;
      this.terrainTexBundle.map.offset.y = (this.terrainTexBundle.map.offset.y + tDelta) % 1;
    }

    this.pedestrianManager.update(dt, frame.roadMovement, (z) => this.getRoadCurveX(z, frame.distance));
    this.updateSecondaryTraffic(dt, frame.roadMovement, frame.distance);

    const progress = this.replayIndex / this.replayFrames.length;
    if (progress < 0.35) {
      this.camera.position.set(frame.playerX * 0.7 + 1.2, 2.4, 7.8);
      this.camera.lookAt(frame.playerX, 1.0, -10);
    } else if (progress < 0.7) {
      this.camera.position.set(frame.playerX - 2.8, 1.2, 3.8);
      this.camera.lookAt(frame.playerX + 0.4, 0.9, -12);
    } else {
      this.camera.position.set(frame.playerX * 0.5 - 2.0, 5.8, 9.5);
      this.camera.lookAt(frame.playerX, 0.9, -6);
    }
  }

  private updatePostCrashAndIdle(dt: number) {
    for (let i = this.debrisList.length - 1; i >= 0; i--) {
      const d = this.debrisList[i];
      d.life -= dt;
      d.vel.y -= 24 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.1) {
        d.mesh.position.y = 0.1;
        d.vel.y *= -0.45;
      }
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life);
      if (d.life <= 0) {
        this.disposeObject(d.mesh);
        this.debrisList.splice(i, 1);
      }
    }
    if (this.cameraShake > 0) {
      this.cameraShake -= dt * 2.8;
      const shakeAmt = Math.max(0, this.cameraShake) * 0.45;
      this.camera.position.x = (this.playerGroup?.position.x || 0) * 0.65 + (Math.random() - 0.5) * shakeAmt;
      this.camera.position.y = 4.8 + (Math.random() - 0.5) * shakeAmt;
    }
    if (this.cloudsGroup) {
      this.cloudsGroup.children.forEach((c) => {
        c.position.x += dt * 2.5;
        if (c.position.x > 320) c.position.x = -320;
      });
    }
    if (this.oceanMesh) {
      this.oceanTime += dt * 1.2;
      this.oceanMesh.position.y = -0.6 + Math.sin(this.oceanTime) * 0.12;
    }
    if (this.motionBlurPass) {
      this.motionBlurPass.uniforms.uStrength.value = 0;
    }
  }

  private animate = () => {
    this.reqId = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.isReplaying) {
      this.updateReplay(dt);
    } else if (this.isRunning && !this.isPaused) {
      this.update(dt);
    } else if (!this.isPaused) {
      this.updatePostCrashAndIdle(dt);
    }

    if (this.composer && !this.isSoftwareGl) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    if (this.reqId !== null) {
      cancelAnimationFrame(this.reqId);
      this.reqId = null;
    }
  };

  private onContextRestored = () => {
    this.clock.getDelta();
    if (this.reqId === null) {
      this.animate();
    }
  };

  private onResize = () => {
    if (!this.camera || !this.renderer) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setSize(w, h);
    }
    if (this.bloomPass) {
      this.bloomPass.setSize(w, h);
    }
  };

  public cycleRadioStation() {
    return sound.cycleRadioStation();
  }

  public destroy() {
    this.clearScheduledTimeouts();
    if (this.reqId !== null) cancelAnimationFrame(this.reqId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.pedestrianManager.destroy();
    this.cleanMarineDrive();
    this.cleanSecondaryRoad();
    disposeDhakaCachedShopTextures();

    this.tireSmokeParticles.dispose(this.scene);
    this.dustTrailParticles.dispose(this.scene);
    this.nitroFlameParticles.dispose(this.scene);

    this.traffic.forEach((t) => this.disposeObject(t.group));
    this.traffic = [];
    this.pickups.forEach((p) => this.disposeObject(p.group));
    this.pickups = [];
    this.debrisList.forEach((d) => this.disposeObject(d.mesh));
    this.debrisList = [];
    this.speedBreakers.forEach((sb) => this.disposeObject(sb.group));
    this.speedBreakers = [];
    this.passengerStops.forEach((ps) => this.disposeObject(ps.group));
    this.passengerStops = [];

    if (this.playerGroup) {
      this.disposeObject(this.playerGroup);
      this.playerGroup = null;
    }
    if (this.roadMesh) {
      this.disposeObject(this.roadMesh);
      this.roadMesh = null;
    }
    if (this.groundMesh) {
      this.disposeObject(this.groundMesh);
      this.groundMesh = null;
    }
    this.guardrails.forEach((g) => this.disposeObject(g));
    this.guardrails = [];
    this.roadLines.forEach((l) => this.disposeObject(l));
    this.roadLines = [];
    this.streetLamps.forEach((l) => this.disposeObject(l));
    this.streetLamps = [];
    this.buildings.forEach((b) => this.disposeObject(b));
    this.buildings = [];
    this.roadsideTrees.forEach((t) => this.disposeObject(t));
    this.roadsideTrees = [];
    this.rainPuddles.forEach((p) => this.disposeObject(p));
    this.rainPuddles = [];
    this.metroRailPillars.forEach((p) => this.disposeObject(p));
    this.metroRailPillars = [];
    if (this.metroTrain) {
      this.disposeObject(this.metroTrain);
      this.metroTrain = null;
    }
    this.overheadSignboards.forEach((s) => this.disposeObject(s));
    this.overheadSignboards = [];

    if (this.stars) {
      this.disposeObject(this.stars);
      this.stars = null;
    }
    if (this.skyMesh) {
      this.disposeObject(this.skyMesh);
      this.skyMesh = null;
    }
    if (this.sunMesh) {
      this.disposeObject(this.sunMesh);
      this.sunMesh = null;
    }
    if (this.sunGlowMesh) {
      this.disposeObject(this.sunGlowMesh);
      this.sunGlowMesh = null;
    }
    if (this.cloudsGroup) {
      this.disposeObject(this.cloudsGroup);
      this.cloudsGroup = null;
    }
    if (this.weatherParticles) {
      this.disposeObject(this.weatherParticles);
      this.weatherParticles = null;
    }

    this.roadTexBundle?.dispose();
    this.roadTexBundle = null;
    this.flyoverTexBundle?.dispose();
    this.flyoverTexBundle = null;
    this.terrainTexBundle?.dispose();
    this.terrainTexBundle = null;
    this.contactShadowTex?.dispose();
    this.contactShadowTex = null;
    this.headlightBeamTex?.dispose();
    this.headlightBeamTex = null;
    this.speedBreakerTex?.dispose();
    this.speedBreakerTex = null;
    this.zebraCrossingTex?.dispose();
    this.zebraCrossingTex = null;
    this.envRenderTarget?.dispose();
    this.envRenderTarget = null;

    this.bloomPass?.dispose();
    this.composer?.dispose();
    this.composer = null;

    sound.setInGame(false);
    sound.stopEngine();
    sound.stopMusic();
    this.renderer.dispose();
  }
}
