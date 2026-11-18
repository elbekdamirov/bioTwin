import { useEffect, useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { AnatomyLayerId, AnatomyLayerSettings, AnatomyStructureInfo, AvatarVisualState } from '../types';
import type { HumanRig } from '../human/buildHuman';
import { AnatomyManager } from './manager';

export interface AnatomyLayersProps {
  rig: HumanRig;
  visual: MutableRefObject<AvatarVisualState>;
  layers: AnatomyLayerSettings;
  isolateLayer: AnatomyLayerId | null;
  selectedStructureId: string | null;
  isolatedStructureId?: string | null;
  onSelectStructure?: (info: AnatomyStructureInfo | null) => void;
  onError?: (e: Error) => void;
}

/**
 * Anatomy layers for a patient rig. Meshes are created imperatively by
 * AnatomyManager (lazy per layer) and skinned to the patient's skeleton;
 * selection is resolved by PatientAvatar's pointer handler via
 * `mesh.userData.anatomyInfo`.
 */
export function AnatomyLayers({ rig, visual, layers, isolateLayer, isolatedStructureId, selectedStructureId, onError }: AnatomyLayersProps) {
  const mgr = useRef<AnatomyManager | null>(null);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    const m = new AnatomyManager(rig);
    m.onLoaded = invalidate;
    m.onError = (e) => onError?.(e);
    mgr.current = m;
    if (import.meta.env.DEV) (window as unknown as { __vitalisAnatomy?: AnatomyManager }).__vitalisAnatomy = m;
    return () => {
      m.dispose();
      mgr.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rig, invalidate]);

  useEffect(() => {
    mgr.current?.setLayers(layers, isolateLayer, isolatedStructureId);
    invalidate();
  }, [layers, isolateLayer, isolatedStructureId, rig, invalidate]);

  useEffect(() => {
    mgr.current?.setSelected(selectedStructureId);
    invalidate();
  }, [selectedStructureId, rig, invalidate]);

  useFrame(() => {
    mgr.current?.update(visual.current);
  });

  return null;
}
