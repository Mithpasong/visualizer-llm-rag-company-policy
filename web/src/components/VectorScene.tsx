"use client";

// Vector DB를 3D로 보여주는 장면.
// - 점 하나 = 문서 조각 하나 (768차원 벡터를 PCA로 3차원에 찍은 위치)
// - 질문하면 질문 벡터(노란 점)가 나타나고, 검색된 조각까지 선이 뻗어 나간다.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, Line, OrbitControls, Sparkles } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { groupOf } from "@/lib/groups";
import type { AnswerMeta, MapPoint, Vec3 } from "@/lib/types";
import { useT } from "./I18nContext";

export type CameraMode = "overview" | "focus";

interface Props {
  points: MapPoint[];
  meta: AnswerMeta | null;
  focusRef: string | null;
  cameraMode: CameraMode;
  onPointClick: (point: MapPoint) => void;
}

const ORIGIN: Vec3 = [0, 0, 0];
const OVERVIEW_POSITION: Vec3 = [0, 5, 25]; // 처음 화면의 카메라 위치
const FOCUS_OFFSET: Vec3 = [0, 3, 13]; // 질문 위치로 확대할 때 질문 점에서 떨어진 거리

export default function VectorScene({ points, meta, focusRef, cameraMode, onPointClick }: Props) {
  const t = useT();
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = useMemo(() => new Map(points.map((p) => [p.id, p])), [points]);
  // 공 114개가 같은 모양(반지름 1인 구)을 함께 쓰고, 크기는 scale로 바꾼다.
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 40, 40), []);

  const query = meta?.queryPosition ?? null;
  const hits = (meta?.hits ?? [])
    .map((hit, i) => ({ hit, rank: i + 1, point: byId.get(hit.id) }))
    .filter((h): h is typeof h & { point: MapPoint } => Boolean(h.point));
  const hitIds = new Set(hits.map((h) => h.point.id));
  const hoveredPoint = hovered ? byId.get(hovered) : undefined;

  const focusing = query !== null && cameraMode === "focus";
  const target: Vec3 = focusing ? query : ORIGIN;
  const position: Vec3 = focusing
    ? [query[0] + FOCUS_OFFSET[0], query[1] + FOCUS_OFFSET[1], query[2] + FOCUS_OFFSET[2]]
    : OVERVIEW_POSITION;

  return (
    <Canvas camera={{ position: OVERVIEW_POSITION, fov: 50 }} dpr={[1, 2]} onPointerMissed={() => setHovered(null)}>
      <color attach="background" args={["#070b16"]} />
      <fog attach="fog" args={["#070b16", 30, 60]} />
      <Lighting />
      <gridHelper args={[26, 13, "#1c2742", "#121a2e"]} position={[0, -11, 0]} />
      {/* 바닥에 생기는 부드러운 그림자: 점들이 공중에 떠 있는 느낌을 준다. */}
      <ContactShadows position={[0, -10.95, 0]} scale={30} far={24} blur={2.6} opacity={0.55} resolution={512} color="#000000" />
      <Sparkles count={70} scale={[26, 22, 26]} size={2.2} speed={0.25} opacity={0.45} color="#a5b4fc" />

      {points.map((p) => {
        const isHit = hitIds.has(p.id);
        const isFocus = focusRef === p.ref;
        return (
          <DataPoint
            key={p.id}
            point={p}
            geometry={sphere}
            radius={isFocus ? 0.6 : isHit ? 0.45 : 0.25}
            highlighted={isHit || isFocus}
            dimmed={query !== null && !isHit && !isFocus}
            hovered={hovered === p.id}
            onHover={(on) => setHovered((h) => (on ? p.id : h === p.id ? null : h))}
            onClick={() => onPointClick(p)}
          />
        );
      })}

      {query && (
        // key를 질문 위치로 주면 새 질문마다 선 그리기 애니메이션이 처음부터 다시 시작된다.
        <SearchRays key={query.join(",")} query={query} hits={hits} />
      )}

      {hoveredPoint && (
        <Html position={hoveredPoint.position} style={{ pointerEvents: "none" }} zIndexRange={[20, 0]}>
          <div className="ml-3 w-56 -translate-y-1/2 rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-xs text-slate-100 shadow-xl">
            <div className="font-semibold" style={{ color: groupOf(hoveredPoint).color }}>
              {hoveredPoint.ref} · p.{hoveredPoint.pages.join(",")}
            </div>
            <div className="mt-1 line-clamp-3 text-slate-300">{hoveredPoint.preview}</div>
            <div className="mt-1 text-[10px] text-slate-500">{t.vector.clickToOpen}</div>
          </div>
        </Html>
      )}

      <OrbitControls makeDefault enableDamping autoRotate={!query} autoRotateSpeed={0.6} />
      <CameraRig target={target} position={position} />

      {/* 밝은 부분(반사광, 검색된 점)만 은은하게 번지게 한다. */}
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.8} luminanceSmoothing={0.2} intensity={0.9} radius={0.65} />
      </EffectComposer>
    </Canvas>
  );
}

/**
 * 조명과 반사. 공 표면에 비칠 가상의 조명판(Lightformer)을 코드로 만들어서
 * 외부 이미지 파일 없이도 유리구슬처럼 반짝이는 반사광이 생긴다.
 */
function Lighting() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 14, 10]} intensity={1.8} />
      <directionalLight position={[-10, -4, -8]} intensity={0.8} color="#8ab4ff" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 8, 6]} scale={[10, 3, 1]} onUpdate={(self) => self.lookAt(0, 0, 0)} />
        <Lightformer form="circle" intensity={2} position={[-8, 2, 4]} scale={3} onUpdate={(self) => self.lookAt(0, 0, 0)} />
        <Lightformer form="ring" color="#6d8bff" intensity={4} position={[9, -2, -6]} scale={6} onUpdate={(self) => self.lookAt(0, 0, 0)} />
      </Environment>
    </>
  );
}

interface DataPointProps {
  point: MapPoint;
  geometry: THREE.SphereGeometry;
  radius: number;
  highlighted: boolean;
  dimmed: boolean;
  hovered: boolean;
  onHover: (on: boolean) => void;
  onClick: () => void;
}

/** 문서 조각 하나를 나타내는 반짝이는 공. 크기 변화는 부드럽게 따라간다. */
function DataPoint({ point, geometry, radius, highlighted, dimmed, hovered, onHover, onClick }: DataPointProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const color = groupOf(point).color;

  useFrame(() => {
    if (!mesh.current) return;
    const goal = radius * (hovered ? 1.35 : 1);
    const now = mesh.current.scale.x;
    if (Math.abs(goal - now) > 0.001) mesh.current.scale.setScalar(THREE.MathUtils.lerp(now, goal, 0.2));
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      position={point.position}
      scale={radius}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(true);
      }}
      onPointerOut={() => onHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* 코팅된 플라스틱처럼 표면에 맑은 반사층(clearcoat)이 있는 재질 */}
      <meshPhysicalMaterial
        color={color}
        roughness={0.18}
        metalness={0.1}
        clearcoat={1}
        clearcoatRoughness={0.06}
        envMapIntensity={1.3}
        emissive={color}
        emissiveIntensity={highlighted ? 0.9 : hovered ? 0.45 : 0.12}
        transparent
        opacity={dimmed ? 0.22 : 1}
      />
    </mesh>
  );
}

/**
 * 목표(바라보는 곳, 카메라 위치)가 바뀌면 카메라를 부드럽게 옮긴다.
 * 도착하면 멈추므로, 그 뒤에는 사용자가 마우스로 자유롭게 돌리고 확대할 수 있다.
 */
function CameraRig({ target, position }: { target: Vec3; position: Vec3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;

  // 배열은 다시 그릴 때마다 새로 만들어지므로, 값이 실제로 바뀌었을 때만 이동을 시작하도록 문자열로 비교한다.
  const goalKey = [...target, ...position].join(",");
  const [goalTarget, goalPosition] = useMemo(() => {
    const v = goalKey.split(",").map(Number);
    return [new THREE.Vector3(v[0], v[1], v[2]), new THREE.Vector3(v[3], v[4], v[5])];
  }, [goalKey]);
  const moving = useRef(false);

  useEffect(() => {
    moving.current = true;
  }, [goalKey]);

  useFrame(() => {
    if (!controls || !moving.current) return;
    controls.target.lerp(goalTarget, 0.08);
    camera.position.lerp(goalPosition, 0.08);
    controls.update();
    if (controls.target.distanceTo(goalTarget) < 0.02 && camera.position.distanceTo(goalPosition) < 0.02) {
      moving.current = false;
    }
  });
  return null;
}

interface RayHit {
  hit: AnswerMeta["hits"][number];
  rank: number;
  point: MapPoint;
}

/** 질문 점에서 검색된 조각들로 선이 뻗어 나가는 애니메이션 */
function SearchRays({ query, hits }: { query: Vec3; hits: RayHit[] }) {
  const t = useT();
  const [progress, setProgress] = useState(0);
  const pulse = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (progress < 1) setProgress((p) => Math.min(1, p + delta * 1.2));
    if (pulse.current) pulse.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.15);
  });

  const start = new THREE.Vector3(...query);
  return (
    <>
      <mesh ref={pulse} position={query}>
        <sphereGeometry args={[0.55, 40, 40]} />
        <meshPhysicalMaterial
          color="#ffd166"
          roughness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.05}
          emissive="#ffb703"
          emissiveIntensity={1.8}
        />
      </mesh>
      <Html position={query} center style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
        <div className="-translate-y-6 whitespace-nowrap rounded-full bg-amber-300 px-2 py-0.5 text-[11px] font-bold text-slate-900">
          {t.vector.query}
        </div>
      </Html>

      {hits.map(({ hit, rank, point }, i) => {
        // 순위가 높은 조각부터 차례로 선이 닿는다.
        const reach = THREE.MathUtils.clamp(progress * 1.6 - i * 0.12, 0, 1);
        if (reach === 0) return null;
        const end = start.clone().lerp(new THREE.Vector3(...point.position), reach);
        return (
          <group key={hit.id}>
            <Line
              points={[start, end]}
              color={hit.followed ? "#c4b5fd" : "#ffd166"}
              lineWidth={hit.followed ? 1.2 : 2.2}
              dashed={hit.followed}
              dashSize={0.4}
              gapSize={0.3}
              transparent
              opacity={hit.followed ? 0.7 : 0.9}
            />
            {reach === 1 && (
              <Html position={point.position} style={{ pointerEvents: "none" }} zIndexRange={[10, 0]}>
                <div className="ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900/90 px-1.5 py-0.5 text-[10px] text-slate-100 ring-1 ring-white/10">
                  {hit.followed ? t.vector.ref : `#${rank}`} {hit.ref}
                  {hit.similarity !== null && <span className="ml-1 text-amber-300">{hit.similarity.toFixed(2)}</span>}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}
