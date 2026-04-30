import { useEffect } from 'react';
import { useSiteStore } from '../state/useSiteStore';
import type { LayerKey } from '../domain/types';

const LAYER_HOTKEYS: Record<string, LayerKey> = {
  '1': 'waterBody',
  '2': 'depth',
  '3': 'poi',
  '4': 'subPoi',
  '5': 'illustrations',
  '6': 'notes',
};

export function useKeyboard() {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      const store = useSiteStore.getState();

      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'y') {
        ev.preventDefault();
        store.redo();
        return;
      }
      if (ev.key === 'Escape') {
        store.setSelection(null);
        store.setPendingBearingFrom(null);
        store.setPendingSubPoiParent(null);
        store.setPendingPolyline(null);
        store.setTool('select');
        return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        const selection = store.editor.selection;
        if (selection.length === 0) return;
        ev.preventDefault();
        const poiIds = new Set<string>();
        const bearingIds = new Set<string>();
        const soundingIds = new Set<string>();
        const contourIds = new Set<string>();
        const depthLabelIds = new Set<string>();
        const subPoiIds = new Set<string>();
        const illustrationIds = new Set<string>();
        const illustrationLineIds = new Set<string>();
        const noteIds = new Set<string>();
        const shorelineIds = new Set<string>();
        for (const sel of selection) {
          switch (sel.kind) {
            case 'poi': poiIds.add(sel.id); break;
            case 'bearing': bearingIds.add(sel.id); break;
            case 'sounding': soundingIds.add(sel.id); break;
            case 'contour': contourIds.add(sel.id); break;
            case 'depthLabel': depthLabelIds.add(sel.id); break;
            case 'subpoi': subPoiIds.add(sel.id); break;
            case 'illustration': illustrationIds.add(sel.id); break;
            case 'illustrationLine': illustrationLineIds.add(sel.id); break;
            case 'note': noteIds.add(sel.id); break;
            case 'shoreline': shorelineIds.add(sel.id); break;
          }
        }
        store.mutateSite((d) => {
          if (poiIds.size > 0) {
            d.layers.poi.pois = d.layers.poi.pois.filter((p) => !poiIds.has(p.id));
            d.layers.poi.bearings = d.layers.poi.bearings.filter(
              (b) => !poiIds.has(b.fromId) && !poiIds.has(b.toId),
            );
            d.layers.subPoi.items = d.layers.subPoi.items.filter((s) => !poiIds.has(s.parentId));
          }
          if (bearingIds.size > 0) {
            d.layers.poi.bearings = d.layers.poi.bearings.filter((b) => !bearingIds.has(b.id));
          }
          if (soundingIds.size > 0) {
            d.layers.measurements.soundings = d.layers.measurements.soundings.filter(
              (s) => !soundingIds.has(s.id),
            );
          }
          if (contourIds.size > 0) {
            d.layers.depth.contours = d.layers.depth.contours.filter((c) => !contourIds.has(c.id));
          }
          if (depthLabelIds.size > 0 && d.layers.depth.labels) {
            d.layers.depth.labels = d.layers.depth.labels.filter((l) => !depthLabelIds.has(l.id));
          }
          if (subPoiIds.size > 0) {
            d.layers.subPoi.items = d.layers.subPoi.items.filter((s) => !subPoiIds.has(s.id));
          }
          if (illustrationIds.size > 0) {
            d.layers.illustrations.items = d.layers.illustrations.items.filter(
              (i) => !illustrationIds.has(i.id),
            );
            d.layers.references.items = d.layers.references.items.filter(
              (i) => !illustrationIds.has(i.id),
            );
          }
          if (illustrationLineIds.size > 0 && d.layers.illustrations.lines) {
            d.layers.illustrations.lines = d.layers.illustrations.lines.filter(
              (l) => !illustrationLineIds.has(l.id),
            );
          }
          if (noteIds.size > 0) {
            d.layers.notes.notes = d.layers.notes.notes.filter((n) => !noteIds.has(n.id));
          }
          if (shorelineIds.size > 0) {
            d.layers.waterBody.shoreline = d.layers.waterBody.shoreline.filter(
              (s) => !shorelineIds.has(s.id),
            );
          }
        });
        store.clearSelection();
        return;
      }
      if (LAYER_HOTKEYS[ev.key]) {
        store.setActiveLayer(LAYER_HOTKEYS[ev.key]!);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
