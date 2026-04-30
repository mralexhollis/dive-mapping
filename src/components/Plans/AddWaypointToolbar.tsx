import { useSiteStore } from '../../state/useSiteStore';

/**
 * Floating toolbar shown over the Plans-page canvas while a route is selected.
 * Single tool: append a waypoint to the end of the route by clicking the
 * canvas. (Reordering and inserting stops happens in the itinerary, not here.)
 */
export default function AddWaypointToolbar() {
  const editingRouteId = useSiteStore((s) => s.editor.editingRouteId);
  const tool = useSiteStore((s) => s.editor.tool);
  const route = useSiteStore((s) =>
    editingRouteId ? s.site.routes.find((r) => r.id === editingRouteId) : null,
  );
  const setTool = useSiteStore((s) => s.setTool);

  if (!editingRouteId || !route) return null;
  const adding = tool === 'route-add-waypoint';

  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-water-200 bg-white px-3 py-1.5 text-xs shadow"
      role="toolbar"
      aria-label="Route editing toolbar"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: route.color }}
      />
      <span className="font-semibold text-water-900">{route.name}</span>
      <button
        type="button"
        onClick={() => setTool(adding ? 'select' : 'route-add-waypoint')}
        className={`rounded px-2 py-1 ${
          adding
            ? 'bg-water-700 text-white'
            : 'bg-white text-water-900 hover:bg-water-100'
        }`}
        title="Click on the canvas to append a waypoint to the end of the route"
      >
        + Add waypoint
      </button>
      {adding && (
        <button
          type="button"
          onClick={() => setTool('select')}
          className="rounded bg-water-700 px-2 py-1 font-semibold text-white hover:bg-water-800"
        >
          Done
        </button>
      )}
    </div>
  );
}
