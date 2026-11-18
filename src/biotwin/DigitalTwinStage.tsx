import {
  Component,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Html,
  Lightformer,
} from "@react-three/drei";
import { Vector3 } from "three";
import { PatientAvatar, type PatientLayout } from "@/three/human/PatientAvatar";
import type { HumanRig } from "@/three/human/buildHuman";
import { CameraRig, computeCameraPresets } from "@/three/scene/CameraRig";
import {
  createDefaultVisualState,
  type AnatomyLayerId,
  type AnatomyLayerSettings,
  type AnatomyStructureInfo,
  type BodyShapeParams,
} from "@/three/types";
import { updateVisualState } from "@/client/visualState";
import type { SimSnapshot } from "@/sim/engine/snapshot";

export type Angle = "front" | "back" | "heart" | "abdomen" | "structure";
type Props = {
  body: BodyShapeParams;
  comparison?: boolean;
  snapshot?: SimSnapshot;
  animate: boolean;
  layers: AnatomyLayerSettings;
  isolate: AnatomyLayerId | null;
  isolateId: string | null;
  point: [number, number, number] | null;
  zoom: number;
  angle: Angle;
  nonce: number;
  selected: AnatomyStructureInfo | null;
  onSelect: (
    info: AnatomyStructureInfo | null,
    point?: [number, number, number],
  ) => void;
  uz: boolean;
};

class RenderBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Viewer(
  props: Props & { onStatus: (status: "loading" | "ready" | "error") => void },
) {
  const [geometry, setGeometry] = useState<{
    rig: HumanRig;
    layout: PatientLayout;
  } | null>(null);
  const visual = useRef(createDefaultVisualState());
  const previous = useRef<SimSnapshot | undefined>(undefined);
  const { onStatus } = props;
  const receiveRig = useCallback(
    (rig: HumanRig | null, layout: PatientLayout | null) => {
      setGeometry(rig && layout ? { rig, layout } : null);
      onStatus(rig && layout ? "ready" : "loading");
    },
    [onStatus],
  );
  const assetError = useCallback(() => onStatus("error"), [onStatus]);
  const reduceMotion = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame((_, dt) => {
    if (props.snapshot !== previous.current) {
      updateVisualState(visual.current, props.snapshot ?? null, 0.6, 1);
      previous.current = props.snapshot;
    }
    if (props.animate && !reduceMotion)
      updateVisualState(
        visual.current,
        props.snapshot ?? null,
        Math.min(dt, 0.1),
        1,
      );
  });
  const presets = useMemo(() => {
    const base = computeCameraPresets(
      geometry?.rig ?? null,
      geometry?.layout ?? null,
    );
    const hip = 0.15;
    const center = geometry
      ? -(geometry.layout.headTopX + geometry.layout.feetX) / 2 + hip
      : 0.12;
    const target = new Vector3(0.1, center - 0.11, 0);
    base.full = {
      target,
      position: target.clone().add(new Vector3(3.48, 0.27, 0.22)),
    };
    base.head = {
      target,
      position: target.clone().add(new Vector3(-3.48, 0.27, -0.22)),
    };
    for (const key of ["chest", "abdomen"] as const) {
      const focus = geometry
        ? base[key].target.clone()
        : new Vector3(0.75, key === "chest" ? 0.52 : 0.29, 0);
      base[key] = {
        target: focus,
        position: focus.clone().add(new Vector3(1.03, 0.09, 0.12)),
      };
    }
    if (props.point) {
      const focus = new Vector3(...props.point);
      base.arms = {
        target: focus,
        position: focus.clone().add(new Vector3(0.81, 0.1, 0.16)),
      };
    }
    for (const view of Object.values(base)) {
      view.position
        .sub(view.target)
        .multiplyScalar(props.zoom)
        .add(view.target);
    }
    return base;
  }, [geometry, props.point, props.zoom]);

  return (
    <>
      <ambientLight intensity={1.05} />
      <directionalLight position={[3, 4, 2]} intensity={2.1} />
      <directionalLight
        position={[-3, 1, -3]}
        intensity={1.1}
        color="#c4d8d2"
      />
      <Environment resolution={64}>
        <Lightformer
          position={[4, 3, 0]}
          rotation={[0, Math.PI / 2, 0]}
          scale={[6, 6]}
          intensity={2}
        />
        <Lightformer
          position={[-2, 1, 3]}
          scale={[3, 4]}
          intensity={1.5}
          color="#d9ecea"
        />
      </Environment>
      <group rotation={[0, 0, -Math.PI / 2]} position={[0, 0.15, 0]}>
        <PatientAvatar
          body={props.body}
          visual={visual}
          layers={props.layers}
          mattressTop={0}
          onRigReady={receiveRig}
          onError={assetError}
          onAnatomyPick={props.onSelect}
          isolateLayer={props.isolate}
          isolatedStructureId={props.isolateId}
          selectedStructureId={props.selected?.id}
          hideEyesInXray
          hideMedicalAttachments
        />
      </group>
      <ContactShadows
        key={geometry ? "patient" : "empty"}
        frames={1}
        position={[
          0,
          (geometry ? -geometry.layout.feetX + 0.15 : -0.75) - 0.025,
          0,
        ]}
        resolution={128}
        opacity={0.32}
        scale={2.5}
        blur={2.4}
        far={1.5}
      />
      {props.point && props.selected && (
        <Html position={props.point} pointerEvents="none" zIndexRange={[2, 1]}>
          <span className="organ-anchor" aria-hidden="true">
            <i className="organ-pin" />
            {props.selected.name}
          </span>
        </Html>
      )}
      <CameraRig
        presets={presets}
        preset={
          {
            front: "full",
            back: "head",
            heart: "chest",
            abdomen: "abdomen",
            structure: "arms",
          }[props.angle] as keyof typeof presets
        }
        presetNonce={props.nonce}
      />
    </>
  );
}

export function DigitalTwinStage(props: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [contextLost, setContextLost] = useState(false);
  const unavailable = (
    <div className="stage-message" role="status">
      {props.uz
        ? "3D ko‘rinishi mavjud emas. Simulyatsiya qiymatlari ochiq."
        : "3D view unavailable. The simulation and its data remain accessible."}
    </div>
  );
  return (
    <div className="canvas-wrap" data-stage={status}>
      <RenderBoundary fallback={null} onFailure={() => setStatus("error")}>
        <Canvas
          frameloop={props.animate ? "always" : "demand"}
          camera={{ fov: 36, near: 0.02, far: 20, position: [3.4, 0.4, 0.2] }}
          dpr={props.comparison ? 1 : [1, 1.5]}
          fallback={unavailable}
          onPointerMissed={() => props.onSelect(null)}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", () =>
              setContextLost(true),
            );
            gl.domElement.addEventListener("webglcontextrestored", () =>
              setContextLost(false),
            );
          }}
        >
          <Viewer {...props} onStatus={setStatus} />
        </Canvas>
      </RenderBoundary>
      {status === "loading" && !contextLost && (
        <div className="stage-message loading" role="status">
          <i />
          {props.uz ? "3D model yuklanmoqda…" : "Preparing the 3D patient…"}
        </div>
      )}
      {(status === "error" || contextLost) && unavailable}
    </div>
  );
}
