import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * VoltSense X-ray EV + battery pack visualisation (single model).
 * - Smooth, tapered exterior built from an extruded side profile + roof/glass/wheel detail.
 * - Transparent shell so the battery pack and its (illustrative) modules are visible inside.
 * - Pack colour reflects ONLY the supplied pack-level SOH. No SOH => neutral slate. No cell-level data is implied.
 */
const COLORS = {
  neutral: { c: 0x94a3b8, e: 0x64748b, i: 0.12 },
  good: { c: 0x14b8a6, e: 0x0d9488, i: 0.55 },
  warn: { c: 0xf59e0b, e: 0xd97706, i: 0.5 },
  bad: { c: 0xef4444, e: 0xb91c1c, i: 0.5 },
};

function bodyShape() {
  // Side profile (x = length, y = height). Front is +x.
  const s = new THREE.Shape();
  s.moveTo(-2.05, 0.28);
  s.lineTo(-2.08, 0.62);
  s.quadraticCurveTo(-2.05, 0.82, -1.7, 0.9); // rear deck
  s.quadraticCurveTo(-1.2, 0.98, -0.95, 1.3); // rear window
  s.quadraticCurveTo(-0.6, 1.5, 0.0, 1.5); // roof
  s.quadraticCurveTo(0.65, 1.5, 1.0, 1.0); // windscreen
  s.quadraticCurveTo(1.5, 0.92, 1.9, 0.76); // bonnet
  s.quadraticCurveTo(2.12, 0.66, 2.1, 0.45); // nose
  s.lineTo(2.05, 0.28);
  s.closePath();
  return s;
}

export default function VehicleBattery3D({ soh = null, className = '', height = 'h-[220px] sm:h-[250px]' }) {
  const mountRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [webgl, setWebgl] = useState(true);
  const hasData = typeof soh === 'number' && Number.isFinite(soh);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;
    let renderer;
    try {
      // Check for jsdom/headless testing environment
      if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
        setWebgl(false);
        return undefined;
      }
      const probe = document.createElement('canvas');
      let ok = false;
      try {
        ok = typeof probe.getContext === 'function' && Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
      } catch {
        ok = false;
      }
      if (!ok) { setWebgl(false); return undefined; }
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch { setWebgl(false); return undefined; }

    const W = () => container.clientWidth || 700;
    const H = () => container.clientHeight || 420;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, W() / H(), 0.1, 100);
    const home = new THREE.Vector3(6.4, 2.9, 6.2);
    camera.position.copy(home);
    camera.lookAt(0, 0.65, 0);

    renderer.setSize(W(), H());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    const dom = renderer.domElement;

    // Lighting: soft key, cool rim, warm fill, teal under-glow
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe8e4da, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(5, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5; key.shadow.camera.right = 5;
    key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
    key.shadow.radius = 5;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5eead4, 1.4);
    rim.position.set(-6, 4, -5);
    scene.add(rim);
    const under = new THREE.PointLight(0x2dd4bf, 1.6, 6);
    under.position.set(0, 0.15, 0);
    scene.add(under);

    // Soft shadow catcher + subtle ring (no dark panel)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.04, 96),
      new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005;
    scene.add(ring);

    const root = new THREE.Group();
    scene.add(root);
    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    // Exterior shell (X-ray glass-like paint)
    const bodyGeo = track(new THREE.ExtrudeGeometry(bodyShape(), {
      depth: 1.7, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 6, curveSegments: 24,
    }));
    bodyGeo.translate(0, 0, -0.85);
    const shellMat = track(new THREE.MeshPhysicalMaterial({
      color: 0x99f6e4, transparent: true, opacity: 0.2, roughness: 0.12, metalness: 0.4,
      clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    }));
    const shell = new THREE.Mesh(bodyGeo, shellMat);
    shell.position.y = 0.08;
    root.add(shell);
    const edges = new THREE.LineSegments(
      track(new THREE.EdgesGeometry(bodyGeo, 28)),
      track(new THREE.LineBasicMaterial({ color: 0x0f766e, transparent: true, opacity: 0.55 }))
    );
    edges.position.copy(shell.position);
    root.add(edges);

    // Glasshouse accent (darker tint on the cabin region)
    const glass = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.5, 0.42, 1.5)),
      track(new THREE.MeshPhysicalMaterial({ color: 0x0f172a, transparent: true, opacity: 0.14, roughness: 0.05, metalness: 0.2, depthWrite: false }))
    );
    glass.position.set(-0.05, 1.28, 0);
    root.add(glass);

    // Headlights + tail light bar
    const headMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x67e8f9, emissiveIntensity: 1.1 }));
    [-0.62, 0.62].forEach((z) => {
      const h = new THREE.Mesh(track(new THREE.BoxGeometry(0.1, 0.07, 0.34)), headMat);
      h.position.set(2.14, 0.66, z); root.add(h);
    });
    const tail = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.06, 0.06, 1.5)),
      track(new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.7 }))
    );
    tail.position.set(-2.14, 0.8, 0); root.add(tail);

    // Wheels: tyre, rim, spokes
    const tyreMat = track(new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 }));
    const rimMat = track(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.25 }));
    const accentMat = track(new THREE.MeshStandardMaterial({ color: 0x14b8a6, emissive: 0x0d9488, emissiveIntensity: 0.5 }));
    const tyreGeo = track(new THREE.TorusGeometry(0.34, 0.13, 16, 36));
    const rimGeo = track(new THREE.CylinderGeometry(0.27, 0.27, 0.18, 32));
    const spokeGeo = track(new THREE.BoxGeometry(0.5, 0.04, 0.04));
    const hubGeo = track(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 16));
    [[1.35, 0.8], [-1.35, 0.8], [1.35, -0.8], [-1.35, -0.8]].forEach(([x, z]) => {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(tyreGeo, tyreMat));
      const r = new THREE.Mesh(rimGeo, rimMat); r.rotation.x = Math.PI / 2; w.add(r);
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Mesh(spokeGeo, rimMat);
        sp.rotation.z = (i * Math.PI) / 5; sp.position.z = Math.sign(z) * 0.1; w.add(sp);
      }
      const hub = new THREE.Mesh(hubGeo, accentMat); hub.rotation.x = Math.PI / 2; w.add(hub);
      w.position.set(x, 0.4, z); root.add(w);
    });

    // Battery pack (skateboard) + illustrative modules
    const pack = new THREE.Group(); root.add(pack);
    const tray = new THREE.Mesh(
      track(new THREE.BoxGeometry(3.0, 0.14, 1.4)),
      track(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.35, transparent: true, opacity: 0.9 }))
    );
    tray.position.set(0, 0.3, 0); pack.add(tray);
    tray.add(new THREE.LineSegments(
      track(new THREE.EdgesGeometry(tray.geometry)),
      track(new THREE.LineBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.8 }))
    ));

    const tone = !hasData ? COLORS.neutral : soh >= 85 ? COLORS.good : soh >= 80 ? COLORS.warn : COLORS.bad;
    const modMat = track(new THREE.MeshStandardMaterial({
      color: tone.c, emissive: tone.e, emissiveIntensity: tone.i, roughness: 0.3, metalness: 0.6,
    }));
    const modGeo = track(new THREE.BoxGeometry(0.3, 0.14, 0.58));
    const modEdge = track(new THREE.EdgesGeometry(modGeo));
    const modLine = track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    const cols = 8; const rows = 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = new THREE.Mesh(modGeo, modMat);
        m.position.set((c - (cols - 1) / 2) * 0.34, 0.44, (r - 0.5) * 0.64);
        m.userData = { name: `Module ${r * cols + c + 1} (illustrative)` };
        m.add(new THREE.LineSegments(modEdge, modLine));
        pack.add(m);
      }
    }
    // Glow plate that pulses gently when data is valid
    const glow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(3.0, 1.4)),
      track(new THREE.MeshBasicMaterial({ color: tone.c, transparent: true, opacity: hasData ? 0.16 : 0.05, side: THREE.DoubleSide, depthWrite: false }))
    );
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.24; root.add(glow);

    // Interaction
    let dragging = false; let moved = false; let last = { x: 0, y: 0 };
    let rotY = -0.5; let t = 0; let raf = 0; let visible = true;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const down = (e) => { dragging = true; moved = false; last = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - last.x; const dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      rotY += dx * 0.008;
      camera.position.y = Math.max(1.4, Math.min(6, camera.position.y - dy * 0.01));
      camera.lookAt(0, 0.65, 0);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => { dragging = false; };
    const wheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // never hijack page scroll
      e.preventDefault();
      const f = 1 + e.deltaY * 0.003;
      const d = camera.position.length() * f;
      if (d > 4 && d < 13) camera.position.multiplyScalar(f);
    };
    const ray = new THREE.Raycaster(); const mv = new THREE.Vector2();
    const click = (e) => {
      if (moved) return;
      const r = dom.getBoundingClientRect();
      mv.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mv, camera);
      const hit = ray.intersectObjects(pack.children, true).find((h) => h.object.userData?.name);
      setSelected(hit ? hit.object.userData.name : null);
    };
    dom.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    dom.addEventListener('click', click);

    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([en]) => { visible = en.isIntersecting; }) : null;
    io?.observe(container);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      t += 0.016;
      if (!dragging && !reduce) rotY += 0.0028;
      root.rotation.y = rotY;
      root.position.y = reduce ? 0 : Math.sin(t * 0.9) * 0.01;
      if (hasData && !reduce) glow.material.opacity = 0.12 + Math.sin(t * 1.4) * 0.04;
      ring.rotation.z = t * 0.05;
      renderer.render(scene, camera);
    };
    tick();

    const ro = new ResizeObserver(() => {
      camera.aspect = W() / H(); camera.updateProjectionMatrix();
      renderer.setSize(W(), H());
      // narrower containers: pull the camera back so the car stays framed
      const k = W() < 480 ? 1.25 : 1;
      camera.position.setLength(home.length() * k);
      camera.lookAt(0, 0.65, 0);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect(); io?.disconnect();
      dom.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dom.removeEventListener('wheel', wheel);
      dom.removeEventListener('click', click);
      disposables.forEach((d) => d.dispose && d.dispose());
      ground.geometry.dispose(); ground.material.dispose();
      ring.geometry.dispose(); ring.material.dispose();
      renderer.dispose();
      if (container.contains(dom)) container.removeChild(dom);
    };
  }, [soh, hasData]);

  if (!webgl) {
    return (
      <div className={`p-8 rounded-2xl bg-surface-container-low border border-outline-variant/30 text-center ${className}`}>
        <h4 className="font-semibold text-lg text-on-surface">3D view unavailable</h4>
        <p className="text-sm text-on-surface-variant max-w-md mx-auto mt-1">
          WebGL is not available in this browser. Your analysis results are unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-outline-variant/30 bg-gradient-to-b from-[#fbfaf7] to-[#ececf0] ${className}`}>
      <div ref={mountRef} className={`w-full ${height} cursor-grab active:cursor-grabbing`} />
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1.5 rounded-xl border border-teal-500/30 text-xs">
        <span className="font-semibold text-slate-700 tracking-wide uppercase">X-ray battery pack</span>
        <span className="text-slate-400">|</span>
        <span className="font-mono font-bold text-teal-700">
          {hasData ? `${soh}% SOH (pack)` : 'SOH unavailable'}
        </span>
      </div>
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-[11px] text-slate-500 pointer-events-none">
        <span className="bg-white/80 px-2 py-0.5 rounded">
          {selected ? `${selected} — layout is illustrative; health shown is pack-level only` : 'Drag to rotate · Ctrl+scroll to zoom · Module layout is illustrative'}
        </span>
      </div>
    </div>
  );
}
