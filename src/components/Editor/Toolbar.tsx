import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSiteStore } from '../../state/useSiteStore';
import type { LayerKey, SubPOICategory } from '../../domain/types';
import {
  CategoryIcon,
  SUBPOI_LABELS,
  SUBPOI_STYLES,
} from '../Map/layers/SubPOILayerView';
import ContourGeneratorDialog from './ContourGeneratorDialog';

interface ToolDef {
  id: string;
  label: string;
  hint?: string;
  /** Optional 24x24 SVG icon (rendered as currentColor). When set, the tool is shown as an icon-only button. */
  icon?: ReactNode;
  /** Render a bigger button + icon — useful for richer iconography (e.g. sub-POI category badges). */
  largeIcon?: boolean;
  /** Special action — runs an arbitrary callback instead of selecting a tool. */
  action?: 'open-contour-generator' | 'import-illustration';
}

interface LayerSection {
  key: LayerKey;
  title: string;
  tools: ToolDef[];
}

const SECTIONS: LayerSection[] = [
  {
    key: 'waterBody',
    title: 'Water body / area',
    tools: [
      {
        id: 'draw-shoreline',
        label: 'Shoreline',
        hint: 'open curved line marking a coast or beach edge',
        icon: <ShorelineIcon />,
      },
      {
        id: 'draw-lake',
        label: 'Lake / pool',
        hint: 'closed curved polygon for a confined water body',
        icon: <LakeIcon />,
      },
      {
        id: 'draw-cave',
        label: 'Cave',
        hint: 'enclosed cave polygon — heavier styling',
        icon: <CaveIcon />,
      },
      {
        id: 'add-point',
        label: 'Add point',
        hint: 'click on the canvas near a selected shape to insert a new vertex',
        icon: <AddPointIcon />,
      },
      {
        id: 'remove-point',
        label: 'Remove point',
        hint: 'click a vertex handle on a selected shape to remove it',
        icon: <RemovePointIcon />,
      },
    ],
  },
  {
    key: 'measurements',
    title: 'Measurements',
    tools: [
      {
        id: 'add-sounding',
        label: 'Add measurement',
        hint: 'drop a depth measurement at this point',
        icon: <TapeMeasureIcon />,
      },
    ],
  },
  {
    key: 'depth',
    title: 'Depth',
    tools: [
      {
        id: 'draw-contour',
        label: 'Draw contour',
        hint: 'click to add points, double-click to finish',
        icon: <DrawContourIcon />,
      },
      {
        id: 'add-depth-label',
        label: 'Add depth label',
        hint: 'place a depth label between contours',
        icon: <DepthLabelIcon />,
      },
      {
        id: 'add-point',
        label: 'Add point',
        hint: 'insert a vertex into the selected contour',
        icon: <AddPointIcon />,
      },
      {
        id: 'remove-point',
        label: 'Remove point',
        hint: 'click a vertex handle on the selected contour to remove it',
        icon: <RemovePointIcon />,
      },
      { id: '__generate__', label: 'Generate contours…', action: 'open-contour-generator' },
    ],
  },
  {
    key: 'poi',
    title: 'POIs & bearings',
    tools: [
      { id: 'add-poi', label: 'Add POI', hint: 'click empty space', icon: <AddPoiIcon /> },
      {
        id: 'add-bearing',
        label: 'Add bearing',
        hint: 'click POI A then POI B',
        icon: <AddBearingIcon />,
      },
    ],
  },
  {
    key: 'subPoi',
    title: 'Sub-POIs',
    tools: ((): ToolDef[] => {
      const cats: SubPOICategory[] = [
        'fish',
        'coral',
        'hazard_high',
        'hazard_standard',
        'hazard_awareness',
        'access',
        'photo_spot',
        'note',
        'other',
      ];
      return cats.map((c) => ({
        id: `add-subpoi-${c}`,
        label: SUBPOI_LABELS[c],
        hint: 'click on empty canvas — auto-attached to the nearest POI',
        // Same button footprint as other tools; icon nearly fills the face
        // so the category glyph is recognisable.
        icon: <SubPoiBadgeIcon category={c} size={28} />,
      }));
    })(),
  },
  {
    key: 'illustrations',
    title: 'Illustrations',
    tools: [
      { id: 'add-boat', label: 'Boat', hint: 'click on the canvas to drop a top-down boat marker', icon: <BoatIcon /> },
      { id: 'add-square', label: 'Square', hint: 'click on the canvas to drop a square', icon: <SquareIcon /> },
      { id: 'add-circle', label: 'Circle', hint: 'click on the canvas to drop an ellipse', icon: <CircleIcon /> },
      { id: 'add-triangle', label: 'Triangle', hint: 'click on the canvas to drop a triangle', icon: <TriangleIcon /> },
      { id: '__import__', label: 'Import image', hint: 'upload a PNG / JPEG / SVG and place it on the canvas', icon: <ImportImageIcon />, action: 'import-illustration' },
    ],
  },
  {
    key: 'notes',
    title: 'Notes',
    tools: [
      {
        id: 'add-note',
        label: 'Add note',
        hint: 'click on the canvas to place a free-floating note',
        icon: <NoteIcon />,
      },
    ],
  },
];

export default function Toolbar() {
  const layers = useSiteStore((s) => s.site.layers);
  const tool = useSiteStore((s) => s.editor.tool);
  const setTool = useSiteStore((s) => s.setTool);
  const setLayerAndTool = useSiteStore((s) => s.setLayerAndTool);
  const [contourDialogOpen, setContourDialogOpen] = useState(false);
  const [importBumper, setImportBumper] = useState(0);

  const onClickTool = (sectionKey: LayerKey, t: ToolDef) => {
    if (t.action === 'open-contour-generator') {
      setLayerAndTool(sectionKey, 'select');
      setContourDialogOpen(true);
      return;
    }
    if (t.action === 'import-illustration') {
      setLayerAndTool(sectionKey, 'select');
      setImportBumper((b) => b + 1);
      return;
    }
    setLayerAndTool(sectionKey, t.id);
  };

  return (
    <div className="flex w-56 flex-col border-r border-water-200 bg-water-50">
      <div className="border-b border-water-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-water-700">
        Tools
      </div>
      <div className="border-b border-water-200 p-2">
        <button
          type="button"
          onClick={() => setTool('select')}
          title="Click an item to select it. Drag on the canvas to marquee-select multiple."
          className={[
            'w-full rounded px-2 py-1.5 text-left text-sm',
            tool === 'select'
              ? 'bg-water-600 text-white'
              : 'border border-water-300 bg-white text-water-900 hover:bg-water-100',
          ].join(' ')}
        >
          Select <span className="text-[10px] opacity-70">(drag to select)</span>
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 py-2">
        {SECTIONS.map((section) => {
          const layer = layers[section.key];
          const disabled = !layer.visible || layer.locked;
          const reason = !layer.visible ? 'hidden' : layer.locked ? 'locked' : null;
          return (
            <li key={section.key} className="mb-3">
              <div className="flex items-baseline justify-between px-1 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-water-700">
                  {section.title}
                </span>
                {reason && <span className="text-[10px] italic text-water-500">{reason}</span>}
              </div>
              {(() => {
                const iconTools = section.tools.filter((t) => !!t.icon);
                const plainTools = section.tools.filter((t) => !t.icon);
                return (
                  <>
                    {(iconTools.length > 0 || section.key === 'measurements') && (
                      <div className="flex flex-wrap items-center gap-1">
                        {iconTools.map((t) => {
                          const isActive = !disabled && tool === t.id;
                          const titleText = `${t.label}${t.hint ? ` — ${t.hint}` : ''}`;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => onClickTool(section.key, t)}
                              title={titleText}
                              aria-label={t.label}
                              className={[
                                'flex items-center justify-center rounded border transition-colors',
                                t.largeIcon ? 'h-10 w-10' : 'h-8 w-8',
                                disabled
                                  ? 'cursor-not-allowed border-water-200 bg-white/60 text-water-300'
                                  : isActive
                                  ? 'border-water-700 bg-water-600 text-white'
                                  : 'border-water-300 bg-white text-water-700 hover:bg-water-100 hover:text-water-900',
                              ].join(' ')}
                            >
                              {t.icon}
                            </button>
                          );
                        })}
                        {section.key === 'measurements' && (
                          <>
                            <DepthDefaultInput disabled={disabled} />
                            <SnapToGridToggle disabled={disabled} />
                          </>
                        )}
                      </div>
                    )}
                    {plainTools.map((t) => {
                      const isActive = !disabled && tool === t.id;
                      const isAction = !!t.action;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => onClickTool(section.key, t)}
                          title={t.hint ?? (disabled ? `${section.title} layer is ${reason}` : undefined)}
                          className={[
                            'mt-1 w-full rounded px-2 py-1 text-left text-xs',
                            disabled
                              ? 'cursor-not-allowed bg-white/60 text-water-300 line-through'
                              : isActive
                              ? 'bg-water-600 text-white'
                              : isAction
                              ? 'border border-water-300 bg-white text-water-900 hover:bg-water-100'
                              : 'bg-white text-water-900 hover:bg-water-100',
                          ].join(' ')}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </>
                );
              })()}
            </li>
          );
        })}
      </ul>
      <ImageImporter bumper={importBumper} />
      {contourDialogOpen && <ContourGeneratorDialog onClose={() => setContourDialogOpen(false)} />}
    </div>
  );
}

function DepthDefaultInput({ disabled }: { disabled: boolean }) {
  const defaultDepth = useSiteStore((s) => s.site.layers.measurements.defaultDepth);
  const mutate = useSiteStore((s) => s.mutateSite);
  return (
    <span
      className="ml-1 inline-flex items-center gap-1 text-[11px] text-water-700"
      title="Default depth used for new measurements & depth labels"
    >
      <span>Default</span>
      <input
        type="number"
        step={0.5}
        disabled={disabled}
        value={defaultDepth ?? ''}
        placeholder="0"
        onChange={(e) => {
          const v = e.target.value;
          mutate((d) => {
            d.layers.measurements.defaultDepth = v === '' ? undefined : Number(v);
          });
        }}
        className="w-10 rounded border border-water-200 px-1 py-0.5 text-right disabled:bg-water-100"
      />
      <span>m</span>
    </span>
  );
}

// ---- Water body / area icons -------------------------------------------------

interface IconProps {
  size?: number;
}

function IconShell({ size = 18, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ShorelineIcon(props: IconProps) {
  // Beach parasol over a small wave — shoreline / beach edge.
  return (
    <IconShell {...props}>
      {/* Parasol canopy */}
      <path
        d="M 12 4 L 4 11 L 20 11 Z"
        fill="currentColor"
        fillOpacity={0.25}
      />
      <path d="M 4 11 L 20 11" />
      <path d="M 12 4 L 4 11" />
      <path d="M 12 4 L 20 11" />
      {/* Pole */}
      <line x1="12" y1="11" x2="12" y2="18" />
      {/* Wavelets below */}
      <path d="M 3 20 Q 6 18 9 20 T 15 20 T 21 20" strokeWidth={1.3} />
    </IconShell>
  );
}

function LakeIcon(props: IconProps) {
  // Oasis: a palm tree leaning over a small pool.
  return (
    <IconShell {...props}>
      {/* Pool */}
      <ellipse
        cx="12"
        cy="19"
        rx="7"
        ry="1.6"
        fill="currentColor"
        fillOpacity={0.28}
        strokeWidth={1.2}
      />
      {/* Trunk — gentle S-curve */}
      <path d="M 13 19 Q 10 14 13 9" strokeWidth={1.4} />
      {/* Fronds */}
      <path d="M 13 9 Q 10 6 7 6" />
      <path d="M 13 9 Q 16 5 19 6" />
      <path d="M 13 9 Q 11 4 9 4" />
      <path d="M 13 9 Q 15 4 17 4" />
      {/* Coconut */}
      <circle cx="13" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </IconShell>
  );
}

function CaveIcon(props: IconProps) {
  // Cave entrance — irregular arched silhouette with a dark inner mouth.
  return (
    <IconShell {...props}>
      {/* Cliff face / outer boulder */}
      <path
        d="M 2 21 L 2 13 Q 3 7 8 5 Q 12 3 16 5 Q 21 7 22 13 L 22 21 Z"
        fill="currentColor"
        fillOpacity={0.18}
      />
      {/* Cave mouth */}
      <path
        d="M 6 21 Q 6 13 10 11 Q 12 10 14 11 Q 18 13 18 21 Z"
        fill="currentColor"
        fillOpacity={0.85}
        stroke="none"
      />
      {/* Ground line */}
      <line x1="2" y1="21" x2="22" y2="21" strokeWidth={1.2} />
    </IconShell>
  );
}

function AddPointIcon(props: IconProps) {
  // A vertex dot with a "+" badge.
  return (
    <IconShell {...props}>
      <circle cx={9} cy={15} r={3} fill="currentColor" stroke="none" />
      <circle cx={17} cy={8} r={4} fill="currentColor" stroke="none" />
      <line x1={17} y1={5.6} x2={17} y2={10.4} stroke="white" strokeWidth={1.6} />
      <line x1={14.6} y1={8} x2={19.4} y2={8} stroke="white" strokeWidth={1.6} />
    </IconShell>
  );
}

function RemovePointIcon(props: IconProps) {
  // A vertex dot with a "−" badge.
  return (
    <IconShell {...props}>
      <circle cx={9} cy={15} r={3} fill="currentColor" stroke="none" />
      <circle cx={17} cy={8} r={4} fill="currentColor" stroke="none" />
      <line x1={14.6} y1={8} x2={19.4} y2={8} stroke="white" strokeWidth={1.6} />
    </IconShell>
  );
}

function SnapToGridToggle({ disabled }: { disabled: boolean }) {
  const enabled = useSiteStore((s) => !!s.site.layers.measurements.snapToGridCenter);
  const mutate = useSiteStore((s) => s.mutateSite);
  const toggle = () => {
    mutate((d) => {
      d.layers.measurements.snapToGridCenter = !enabled;
    });
  };
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={`Snap to grid centre — ${enabled ? 'on' : 'off'}`}
      aria-label="Snap to grid centre"
      aria-pressed={enabled}
      className={[
        'ml-1 flex h-7 items-center gap-1 rounded border px-1.5 text-[11px] transition-colors',
        disabled
          ? 'cursor-not-allowed border-water-200 bg-white/60 text-water-300'
          : enabled
          ? 'border-water-700 bg-water-600 text-white'
          : 'border-water-300 bg-white text-water-700 hover:bg-water-100 hover:text-water-900',
      ].join(' ')}
    >
      <SnapToGridIcon size={14} />
      <span className="select-none">snap</span>
    </button>
  );
}

function SnapToGridIcon({ size = 18 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 2x2 grid */}
      <rect x={3} y={3} width={18} height={18} rx={1.5} />
      <line x1={12} y1={3} x2={12} y2={21} />
      <line x1={3} y1={12} x2={21} y2={12} />
      {/* Centred dot in one cell */}
      <circle cx={16.5} cy={16.5} r={2} fill="currentColor" stroke="none" />
    </svg>
  );
}

function AddPoiIcon({ size = 18 }: IconProps) {
  // Big circle with an X — "X marks the spot".
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx={12} cy={12} r={9} fill="currentColor" fillOpacity={0.15} />
      <line x1={7.5} y1={7.5} x2={16.5} y2={16.5} strokeWidth={2} />
      <line x1={16.5} y1={7.5} x2={7.5} y2={16.5} strokeWidth={2} />
    </svg>
  );
}

function AddBearingIcon({ size = 18 }: IconProps) {
  // Two filled circles joined by a line.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1={6} y1={12} x2={18} y2={12} stroke="currentColor" />
      <circle cx={6} cy={12} r={4} />
      <circle cx={18} cy={12} r={4} />
    </svg>
  );
}

function SubPoiBadgeIcon({ category, size = 18 }: IconProps & { category: SubPOICategory }) {
  // Smaller circle than a POI, filled with the category colour, with the
  // category glyph centred inside (re-uses the on-canvas CategoryIcon).
  const style = SUBPOI_STYLES[category] ?? SUBPOI_STYLES.other;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx={12}
        cy={12}
        r={7.5}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={1.4}
      />
      {/* CategoryIcon paths assume a ±2-unit space around (0,0); scale ~3x to
          fit our 24x24 viewBox. */}
      <g transform="translate(12 12) scale(3)">
        <CategoryIcon category={category} color={style.iconColor} />
      </g>
    </svg>
  );
}

function BoatIcon(props: IconProps) {
  // Top-down boat — pentagon with pointed bow, mirroring the canvas primitive.
  return (
    <IconShell {...props}>
      <polygon
        points="12,3 19,9 19,21 5,21 5,9"
        fill="currentColor"
        fillOpacity={0.25}
      />
    </IconShell>
  );
}

function SquareIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <rect x={4} y={4} width={16} height={16} rx={1.5} fill="currentColor" fillOpacity={0.25} />
    </IconShell>
  );
}

function CircleIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <circle cx={12} cy={12} r={8} fill="currentColor" fillOpacity={0.25} />
    </IconShell>
  );
}

function TriangleIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <polygon points="12,4 21,20 3,20" fill="currentColor" fillOpacity={0.25} />
    </IconShell>
  );
}

function ImportImageIcon(props: IconProps) {
  // Classic photo-import icon: picture frame with a sun + arrow indicating "import in".
  return (
    <IconShell {...props}>
      <rect x={3} y={5} width={18} height={14} rx={2} fill="currentColor" fillOpacity={0.18} />
      <circle cx={8.5} cy={10} r={1.6} fill="currentColor" stroke="none" />
      <path d="M 3 17 L 10 11 L 15 16 L 19 12 L 21 14" />
      <line x1={17} y1={2} x2={17} y2={8} strokeWidth={2} />
      <polyline points="14,5 17,2 20,5" strokeWidth={2} />
    </IconShell>
  );
}

function NoteIcon(props: IconProps) {
  // Sticky note with a folded corner + a few text lines.
  return (
    <IconShell {...props}>
      <path
        d="M 5 3 L 16 3 L 21 8 L 21 21 L 5 21 Z"
        fill="currentColor"
        fillOpacity={0.18}
      />
      <path d="M 16 3 L 16 8 L 21 8" />
      <line x1={8} y1={12} x2={17} y2={12} />
      <line x1={8} y1={15} x2={17} y2={15} />
      <line x1={8} y1={18} x2={13} y2={18} />
    </IconShell>
  );
}

function DrawContourIcon({ size = 18 }: IconProps) {
  // A clearly-dashed line — square caps + ample gaps so the breaks show even
  // at small icon sizes.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="butt"
      aria-hidden="true"
    >
      <path d="M 2 14 Q 7 6 12 12 Q 17 18 22 9" strokeDasharray="3 3" />
    </svg>
  );
}

function DepthLabelIcon({ size = 18 }: IconProps) {
  // "X m" text — meant to read as "depth value followed by metres".
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <text
        x={12}
        y={13}
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        fill="currentColor"
        fontFamily='ui-sans-serif, system-ui'
      >
        X m
      </text>
    </svg>
  );
}

function TapeMeasureIcon(props: IconProps) {
  // Tape measure: rounded case with a visible reel + tape spooling out the right.
  return (
    <IconShell {...props}>
      {/* Case */}
      <rect
        x={2.5}
        y={7}
        width={13.5}
        height={12}
        rx={2}
        fill="currentColor"
        fillOpacity={0.18}
      />
      {/* Reel */}
      <circle cx={9.25} cy={13} r={3.2} />
      {/* Hub */}
      <circle cx={9.25} cy={13} r={0.9} fill="currentColor" stroke="none" />
      {/* Tape coming out of the case */}
      <path
        d="M 16 12 L 22 12 L 22 14 L 16 14 Z"
        fill="currentColor"
        fillOpacity={0.32}
      />
      <line x1={16} y1={12} x2={22} y2={12} />
      <line x1={16} y1={14} x2={22} y2={14} />
      {/* Hook at the end of the tape */}
      <line x1={22} y1={10.8} x2={22} y2={15.2} strokeWidth={1.8} />
      {/* Tick marks on the tape */}
      <line x1={17.6} y1={12} x2={17.6} y2={14} strokeWidth={1} />
      <line x1={19.2} y1={12} x2={19.2} y2={14} strokeWidth={1} />
      <line x1={20.8} y1={12} x2={20.8} y2={14} strokeWidth={1} />
    </IconShell>
  );
}

// -----------------------------------------------------------------------------

function ImageImporter({ bumper }: { bumper: number }) {
  const mutate = useSiteStore((s) => s.mutateSite);
  const setSelection = useSiteStore((s) => s.setSelection);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (bumper > 0) inputRef.current?.click();
  }, [bumper]);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const id = crypto.randomUUID();
        mutate((d) => {
          d.layers.illustrations.items.push({
            id,
            src,
            mimeType: file.type as 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/webp',
            x: 0,
            y: 0,
            width: img.width,
            height: img.height,
            placement: 'under',
            opacity: 0.8,
            caption: file.name,
          });
        });
        setSelection({ kind: 'illustration', id });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/svg+xml"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );
}
