import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";

const EARTH_TEXTURE =
  "./assets/bonus/earth-blue-marble.jpg";
const BUMP_TEXTURE =
  "./assets/bonus/earth-topology.png";
const EARTH_TEXTURE_CDN =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg";
const BUMP_TEXTURE_CDN =
  "https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png";

/** Bumped when drag feel changes — check Network tab loads this version. */
export const BONUS_GLOBE_DRAG_VERSION = "globe-arcball12";

const DEFAULT_CAMERA_Z = 2.8;
const MIN_CAMERA_Z = 1.55;
const MAX_CAMERA_Z = 5.5;

const CAM_FACING = new THREE.Vector3(0, 0, 1);
const WORLD_NORTH = new THREE.Vector3(0, 1, 0);

/** Face camera (+Z) with north pole (+Y local) toward world +Y. */
function quaternionFacePointNorthUp(localDir, quatOut, tmpNorth, qAlign) {
  qAlign.setFromUnitVectors(localDir, CAM_FACING);
  tmpNorth.set(0, 1, 0).applyQuaternion(qAlign);
  const twist = Math.atan2(tmpNorth.x, tmpNorth.y);
  quatOut.setFromAxisAngle(CAM_FACING, twist).multiply(qAlign);
}

function latLngToVector3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

class GlobeDragControls {
  constructor(camera, domElement, orientGroup, earthMesh) {
    this.camera = camera;
    this.domElement = domElement;
    this.orientGroup = orientGroup;
    this.earthMesh = earthMesh;
    this.dragging = false;
    this.cameraDistance = DEFAULT_CAMERA_Z;
    this._pinching = false;
    this._pinchStartSpan = 0;
    this._pinchStartDistance = DEFAULT_CAMERA_Z;
    this._pointers = new Map();
    this._lastWorldDir = null;
    this._raycaster = new THREE.Raycaster();
    this._pointer = new THREE.Vector2();
    this._axis = new THREE.Vector3();

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);

    domElement.addEventListener("pointerdown", this.onPointerDown);
    domElement.addEventListener("pointermove", this.onPointerMove);
    domElement.addEventListener("pointerup", this.onPointerUp);
    domElement.addEventListener("pointerleave", this.onPointerUp);
    domElement.addEventListener("pointercancel", this.onPointerUp);
    domElement.addEventListener("wheel", this.onWheel, { passive: false });
  }

  _pointerSpan() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2) {
      return 0;
    }
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  _setCameraDistance(next) {
    this.cameraDistance = Math.min(MAX_CAMERA_Z, Math.max(MIN_CAMERA_Z, next));
    this.camera.position.z = this.cameraDistance;
  }

  zoomByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) {
      return;
    }
    this._setCameraDistance(this.cameraDistance * factor);
  }

  resetZoom() {
    this._setCameraDistance(DEFAULT_CAMERA_Z);
  }

  onWheel(event) {
    event.preventDefault();
    const factor = Math.pow(1.002, event.deltaY);
    this.zoomByFactor(factor);
  }

  setBaseQuaternion(quaternion) {
    this.orientGroup.quaternion.copy(quaternion);
  }

  _pickWorldDirection(clientX, clientY) {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    this._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._pointer, this.camera);
    this.earthMesh.updateWorldMatrix(true, false);
    const hits = this._raycaster.intersectObject(this.earthMesh, false);
    if (!hits.length) {
      return null;
    }
    return hits[0].point.clone().normalize();
  }

  _applyArcballDrag(clientX, clientY) {
    const dir = this._pickWorldDirection(clientX, clientY);
    if (!dir) {
      return;
    }
    if (!this._lastWorldDir) {
      this._lastWorldDir = dir;
      return;
    }
    const dot = this._lastWorldDir.dot(dir);
    if (dot > 0.99999) {
      this._lastWorldDir.copy(dir);
      return;
    }
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    this._axis.crossVectors(this._lastWorldDir, dir);
    if (this._axis.lengthSq() < 1e-12) {
      this._lastWorldDir.copy(dir);
      return;
    }
    this._axis.normalize();
    this.orientGroup.rotateOnWorldAxis(this._axis, angle);
    this._lastWorldDir.copy(dir);
  }

  onPointerDown(event) {
    this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this._pointers.size >= 2) {
      event.preventDefault();
      this.dragging = false;
      this._lastWorldDir = null;
      this._pinching = true;
      this._pinchStartSpan = this._pointerSpan();
      this._pinchStartDistance = this.cameraDistance;
      return;
    }

    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.dragging = true;
    this._lastWorldDir = null;
    this._applyArcballDrag(event.clientX, event.clientY);
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (this._pointers.has(event.pointerId)) {
      this._pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this._pinching && this._pointers.size >= 2) {
      event.preventDefault();
      const span = this._pointerSpan();
      if (this._pinchStartSpan > 0 && span > 0) {
        const ratio = span / this._pinchStartSpan;
        this._setCameraDistance(this._pinchStartDistance / ratio);
      }
      return;
    }

    if (!this.dragging) {
      return;
    }
    event.preventDefault();
    this._applyArcballDrag(event.clientX, event.clientY);
  }

  onPointerUp(event) {
    this._pointers.delete(event.pointerId);
    if (this._pointers.size < 2) {
      this._pinching = false;
      this._pinchStartSpan = 0;
    }
    this.dragging = false;
    this._lastWorldDir = null;
    this.domElement.releasePointerCapture?.(event.pointerId);
  }

  update() {
    /* drag is immediate */
  }

  dispose() {
    this.domElement.removeEventListener("pointerdown", this.onPointerDown);
    this.domElement.removeEventListener("pointermove", this.onPointerMove);
    this.domElement.removeEventListener("pointerup", this.onPointerUp);
    this.domElement.removeEventListener("pointerleave", this.onPointerUp);
    this.domElement.removeEventListener("pointercancel", this.onPointerUp);
    this.domElement.removeEventListener("wheel", this.onWheel);
  }
}

function mountGlobeZoomButtons(hostEl, controls) {
  const bar = document.createElement("div");
  bar.className = "bonus-globe-zoom";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Globe zoom");

  const mkBtn = (label, title, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bonus-globe-zoom-btn";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  };

  bar.append(
    mkBtn("+", "Zoom in", () => controls.zoomByFactor(0.88)),
    mkBtn("−", "Zoom out", () => controls.zoomByFactor(1 / 0.88)),
    mkBtn("⟲", "Reset zoom", () => controls.resetZoom())
  );
  hostEl.appendChild(bar);
  return bar;
}

export class BonusGlobe {
  constructor(hostEl) {
    this._initPromise = this._init(hostEl);
  }

  async _init(hostEl) {
    this.hostEl = hostEl;
    this.markers = [];
    this.pinGlowMaterials = [];
    this.pinHaloMat = null;
    this.pinPulsePhase = 0;
    this.raf = 0;
    this._faceTmpNorth = new THREE.Vector3();
    this._faceQAlign = new THREE.Quaternion();
    this._faceTargetDir = new THREE.Vector3();
    this._pinWorldPos = new THREE.Vector3();
    this._pinRefDistance = DEFAULT_CAMERA_Z;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    if (!this.renderer.getContext()) {
      throw new Error("WebGL is not available in this browser.");
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.touchAction = "none";
    this.hostEl.classList.add("bonus-globe-host--ready");
    this.hostEl.replaceChildren(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, DEFAULT_CAMERA_Z);
    this.camera.lookAt(0, 0, 0);

    this.orientGroup = new THREE.Group();
    this.scene.add(this.orientGroup);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(4, 2, 5);
    this.scene.add(ambient, sun);

    const loader = new THREE.TextureLoader();
    const loadTexture = (localUrl, cdnUrl) =>
      new Promise((resolve, reject) => {
        loader.load(
          localUrl,
          resolve,
          undefined,
          () => {
            loader.load(cdnUrl, resolve, undefined, reject);
          }
        );
      });
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const [earthMap, bumpMap] = await Promise.all([
      loadTexture(EARTH_TEXTURE, EARTH_TEXTURE_CDN),
      loadTexture(BUMP_TEXTURE, BUMP_TEXTURE_CDN)
    ]);
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthMap,
      bumpMap,
      bumpScale: 0.025,
      specular: new THREE.Color(0x222222),
      shininess: 8
    });
    this.earth = new THREE.Mesh(earthGeo, earthMat);
    this.orientGroup.add(this.earth);

    this.controls = new GlobeDragControls(
      this.camera,
      this.renderer.domElement,
      this.orientGroup,
      this.earth
    );
    this._zoomBar = mountGlobeZoomButtons(this.hostEl, this.controls);

    const starGeo = new THREE.BufferGeometry();
    const starCount = 900;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const r = 14 + Math.random() * 18;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, sizeAttenuation: true })
    );
    this.scene.add(stars);

    this.onResize = this.onResize.bind(this);
    this.tick = this.tick.bind(this);
    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.tick();
  }

  async ready() {
    await this._initPromise;
  }

  onResize() {
    const width = this.hostEl.clientWidth || this.hostEl.parentElement?.clientWidth || 320;
    const height = this.hostEl.clientHeight || this.hostEl.parentElement?.clientHeight || 320;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  _updatePinScreenScale() {
    if (!this.markers.length || !this._pinRefDistance) {
      return;
    }
    this.markers.forEach((pin) => {
      pin.getWorldPosition(this._pinWorldPos);
      const dist = this.camera.position.distanceTo(this._pinWorldPos);
      pin.scale.setScalar(dist / this._pinRefDistance);
    });
  }

  tick() {
    this.controls.update();
    this._updatePinScreenScale();
    if (this.pinGlowMaterials.length) {
      this.pinPulsePhase += 0.07;
      const pulse = 0.5 + 0.45 * Math.sin(this.pinPulsePhase);
      this.pinGlowMaterials.forEach((mat) => {
        mat.emissiveIntensity = pulse;
      });
      if (this.pinHaloMat) {
        this.pinHaloMat.opacity = 0.2 + 0.22 * (0.5 + 0.5 * Math.sin(this.pinPulsePhase * 1.35));
      }
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  }

  clearMarkers() {
    this.markers.forEach((marker) => {
      this.earth.remove(marker);
      marker.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose?.());
          } else {
            obj.material.dispose?.();
          }
        }
      });
    });
    this.markers = [];
    this.pinGlowMaterials = [];
    this.pinHaloMat = null;
  }

  setTarget(lat, lng) {
    this.clearMarkers();
    const surfacePoint = latLngToVector3(lat, lng, 1.02);
    const normal = surfacePoint.clone().normalize();

    const pin = new THREE.Group();
    pin.position.copy(surfacePoint);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.062, 20, 20),
      new THREE.MeshBasicMaterial({
        color: 0xff5566,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    pin.add(halo);
    this.pinHaloMat = halo.material;

    const headMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xff3344,
      emissiveIntensity: 0.75,
      metalness: 0.35,
      roughness: 0.28
    });
    this.pinGlowMaterials.push(headMat);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 20), headMat);
    pin.add(head);

    const shine = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0f0 })
    );
    shine.position.set(0, 0.022, 0);
    pin.add(shine);

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      emissive: 0x660000,
      emissiveIntensity: 0.35,
      metalness: 0.2,
      roughness: 0.55
    });
    this.pinGlowMaterials.push(stemMat);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 10), stemMat);
    stem.position.set(0, 0.055, 0);
    pin.add(stem);

    this.earth.add(pin);
    this.markers.push(pin);
    this.pinPulsePhase = 0;

    this._faceTargetDir.copy(latLngToVector3(lat, lng, 1)).normalize();
    const faceCamera = new THREE.Quaternion();
    quaternionFacePointNorthUp(
      this._faceTargetDir,
      faceCamera,
      this._faceTmpNorth,
      this._faceQAlign
    );
    this.controls.resetZoom();
    this.controls.setBaseQuaternion(faceCamera);

    this.earth.updateWorldMatrix(true, true);
    pin.getWorldPosition(this._pinWorldPos);
    this._pinRefDistance = this.camera.position.distanceTo(this._pinWorldPos);
    pin.scale.setScalar(1);
  }

  flashMarker(kind) {
    const color = kind === "correct" ? 0x3ddc84 : 0xff6b6b;
    this.markers.forEach((group) => {
      group.traverse((obj) => {
        if (obj.material?.emissive) {
          obj.material.emissive.setHex(color);
          if (obj.material.emissiveIntensity !== undefined) {
            obj.material.emissiveIntensity = 1.1;
          }
        }
      });
    });
    if (this.pinHaloMat) {
      this.pinHaloMat.color.setHex(color);
    }
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this._zoomBar?.remove();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
