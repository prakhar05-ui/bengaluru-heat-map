import { useCallback, useMemo, useState } from 'react';
import { ChartColumn, Flag, Layers, LifeBuoy, LocateFixed } from 'lucide-react';
import { INCIDENT_TYPE_LABELS, MAX_YEAR, MIN_YEAR } from '@app/shared';
import { api } from '../api/http.js';
import { useJurisdictions, useLayerData, useLayers, useMeta, useReports, useStations } from '../api/queries.js';
import ChoroplethLegend from '../components/ChoroplethLegend.jsx';
import CitySummary from '../components/CitySummary.jsx';
import DataNotice from '../components/DataNotice.jsx';
import FilterBar from '../components/FilterBar.jsx';
import JurisdictionLayer from '../components/JurisdictionLayer.jsx';
import LayerPanel from '../components/LayerPanel.jsx';
import MapLayers from '../components/MapLayers.jsx';
import MapMarker from '../components/MapMarker.jsx';
import MapView from '../components/MapView.jsx';
import PoliceStationCard from '../components/PoliceStationCard.jsx';
import ReportPinDialog from '../components/ReportPinDialog.jsx';
import ReportPins from '../components/ReportPins.jsx';
import SosButton from '../components/SosButton.jsx';
import StationSelect from '../components/StationSelect.jsx';
import StationTrend from '../components/StationTrend.jsx';
import { EmptyState, ErrorState, Loading } from '../components/StatusMessage.jsx';
import { SectionHeader, Spinner, Tabs } from '../components/ui.jsx';
import { computeClasses, fillColorExpression } from '../lib/choropleth.js';
import { getCurrentPosition } from '../lib/geo.js';

const DEFAULT_LAYERS = ['hospitals', 'metro'];
const PANEL_WIDTH = 392; // px, desktop floating panel
const TABS = [
  { id: 'help', label: 'Help', icon: LifeBuoy },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'figures', label: 'Figures', icon: ChartColumn },
];

export default function MapPage() {
  const [filters, setFilters] = useState({ yearFrom: MIN_YEAR, yearTo: MAX_YEAR, type: '' });
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [finding, setFinding] = useState({ status: 'idle', message: null });
  const [enabledLayers, setEnabledLayers] = useState(() => new Set(DEFAULT_LAYERS));
  const [streetlightClasses, setStreetlightClasses] = useState([]);
  // 'idle' -> 'picking' (tap map) -> 'form' (dialog open)
  const [reportStep, setReportStep] = useState('idle');
  const [draftPin, setDraftPin] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [tab, setTab] = useState('help');

  const meta = useMeta();
  const hasCounts = meta.data?.counts.source === 'imported';
  // Community reports are switched off on the deployed site until storage and moderation exist.
  const reportsEnabled = meta.data?.features.reports ?? false;
  const jurisdictionFilters = useMemo(() => ({ ...filters, type: filters.type || undefined }), [filters]);
  const jurisdictions = useJurisdictions(jurisdictionFilters);
  const stations = useStations();
  const reports = useReports();
  const layerCatalog = useLayers();

  // Optional layers: data is fetched only when a layer is switched on.
  const catalog = useMemo(() => layerCatalog.data ?? [], [layerCatalog.data]);
  const layerIds = useMemo(() => catalog.map((l) => l.id), [catalog]);
  const layerQueries = useLayerData(layerIds, enabledLayers);
  const activeLayers = catalog
    .map((l, i) => ({ ...l, data: layerQueries[i]?.data }))
    .filter((l) => enabledLayers.has(l.id) && l.data);
  const layerStatus = Object.fromEntries(
    catalog.map((l, i) => [l.id, { loading: layerQueries[i]?.isFetching && !layerQueries[i]?.data, error: layerQueries[i]?.error?.message }]),
  );
  const toggleLayer = useCallback((id) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Per-station shading only when real figures have been imported.
  const areaProps = useMemo(() => jurisdictions.data?.features.map((f) => f.properties) ?? [], [jurisdictions.data]);
  const classes = useMemo(() => (hasCounts ? computeClasses(areaProps.map((p) => p.count)) : []), [areaProps, hasCounts]);
  const fillColor = useMemo(() => fillColorExpression(classes), [classes]);
  const withData = areaProps.filter((p) => p.count !== null);
  const total = withData.reduce((sum, p) => sum + p.count, 0);
  const yearLabel = filters.yearFrom === filters.yearTo ? `${filters.yearFrom}` : `${filters.yearFrom}–${filters.yearTo}`;
  const typeLabel = filters.type ? INCIDENT_TYPE_LABELS[filters.type] : 'all types';

  const stationFeatures = stations.data?.features ?? [];
  const selected = stationFeatures.find((f) => f.properties.id === selectedStationId);

  const selectStation = useCallback((id) => {
    setSelectedStationId(id || null);
    if (id) {
      setSheetOpen(true);
      setTab('help');
    }
  }, []);

  const findMyStation = async () => {
    setFinding({ status: 'locating', message: null });
    try {
      const position = await getCurrentPosition();
      setUserLocation(position);
      const { station } = await api.getStationAt(position);
      selectStation(station.id);
      setFinding({ status: 'idle', message: null });
    } catch (err) {
      const message =
        err.status === 404
          ? 'You seem to be outside the mapped Bengaluru police station areas. In an emergency, call 112.'
          : `${err.message} You can also tap your location on the map.`;
      setFinding({ status: 'error', message });
    }
  };

  const handleMapClick = useCallback(
    (lngLat) => {
      if (reportStep !== 'picking') return;
      setDraftPin(lngLat);
      setReportStep('form');
    },
    [reportStep],
  );
  const startReport = () => {
    setDraftPin(null);
    setReportStep('picking');
    setSheetOpen(false);
  };
  const cancelReport = useCallback(() => {
    setDraftPin(null);
    setReportStep('idle');
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <MapView
        onMapClick={handleMapClick}
        cursor={reportStep === 'picking' ? 'crosshair' : undefined}
        desktopPadding={{ left: PANEL_WIDTH + 16 }}
      >
        <JurisdictionLayer
          jurisdictions={jurisdictions.data}
          stations={stations.data}
          hasCounts={hasCounts}
          fillColor={fillColor}
          selectedId={selectedStationId}
          interactive={reportStep === 'idle'}
          onSelect={selectStation}
        />
        <MapLayers layers={activeLayers} interactive={reportStep === 'idle'} onStreetlightClasses={setStreetlightClasses} />
        <ReportPins reports={reports.data?.items ?? []} draftPin={draftPin} />
        {userLocation && (
          <MapMarker lng={userLocation.lng} lat={userLocation.lat}>
            <span className="relative flex h-4 w-4" role="img" aria-label="Your location">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-60" />
              <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow" />
            </span>
          </MapMarker>
        )}
      </MapView>

      <SosButton className="absolute right-3 top-3 z-10 md:right-4 md:top-4" />

      {reportStep === 'picking' && (
        <div className="absolute inset-x-3 top-16 z-10 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink-900/95 px-4 py-3 text-sm text-white shadow-float backdrop-blur md:left-[420px] md:right-4 md:top-4">
          <span className="flex items-center gap-2">
            <Flag aria-hidden="true" className="h-4 w-4 text-rose-300" />
            Tap the map to place your pin
          </span>
          <button type="button" onClick={cancelReport} className="rounded-lg px-2 py-1 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">
            Cancel
          </button>
        </div>
      )}

      {/* Floating panel (desktop) / bottom sheet (mobile) */}
      <aside
        style={{ '--panel-w': `${PANEL_WIDTH}px` }}
        className={`absolute inset-x-0 bottom-0 z-20 flex max-h-[56%] flex-col rounded-t-3xl border border-ink-100 bg-white/95 shadow-float backdrop-blur transition-transform duration-300 md:bottom-4 md:left-4 md:top-4 md:max-h-none md:w-[var(--panel-w)] md:translate-y-0 md:rounded-2xl ${
          sheetOpen ? 'translate-y-0' : 'translate-y-[calc(100%-6.75rem)]'
        }`}
        aria-label="Help and map layers"
      >
        <button
          type="button"
          onClick={() => setSheetOpen((o) => !o)}
          aria-expanded={sheetOpen}
          aria-label={sheetOpen ? 'Collapse panel' : 'Expand panel'}
          className="flex w-full justify-center pb-1 pt-2.5 md:hidden"
        >
          <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-ink-300" />
        </button>
        <div className="px-4 pb-3 md:pt-4">
          <Tabs
            tabs={TABS}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSheetOpen(true);
            }}
            label="Panel sections"
          />
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {tab === 'help' && (
            <>
              <section className="card" aria-labelledby="find-heading">
                <SectionHeader
                  id="find-heading"
                  icon={LocateFixed}
                  title="Find your police station"
                  subtitle="Uses your location, or tap anywhere on the map."
                />
                <button type="button" onClick={findMyStation} disabled={finding.status === 'locating'} className="btn-primary mt-3 w-full">
                  {finding.status === 'locating' ? <Spinner /> : <LocateFixed aria-hidden="true" className="h-4 w-4" />}
                  {finding.status === 'locating' ? 'Finding your police station…' : 'Use my location'}
                </button>
                {finding.status === 'error' && (
                  <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-900">
                    {finding.message}
                  </p>
                )}
                <div className="mt-3 border-t border-ink-100 pt-3">
                  {stations.isError ? (
                    <ErrorState message={`Police stations: ${stations.error.message}`} onRetry={stations.refetch} />
                  ) : (
                    <StationSelect
                      stations={stationFeatures}
                      value={selectedStationId ?? ''}
                      onChange={selectStation}
                      label="Or choose a station"
                      emptyLabel={stations.isPending ? 'Loading stations…' : 'Select a police station'}
                      disabled={stations.isPending}
                    />
                  )}
                </div>
              </section>

              {selected && (
                <PoliceStationCard
                  station={selected.properties}
                  coordinates={selected.geometry.coordinates}
                  from={userLocation}
                  onClose={() => setSelectedStationId(null)}
                >
                  {hasCounts && (
                    <div className="mt-3">
                      <StationTrend station={selected.properties} type={filters.type} onClose={() => setSelectedStationId(null)} />
                    </div>
                  )}
                </PoliceStationCard>
              )}

              <section className="card" aria-labelledby="report-heading">
                <SectionHeader
                  id="report-heading"
                  icon={Flag}
                  tone="rose"
                  title="Noticed something?"
                  subtitle={
                    reportsEnabled
                      ? 'Flag poor lighting, isolated stretches or harassment spots. Reports are reviewed before they appear as purple dots.'
                      : 'Soon you will be able to flag poor lighting, isolated stretches or harassment spots for others to see.'
                  }
                  action={
                    !reportsEnabled && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        Coming soon
                      </span>
                    )
                  }
                />
                <button
                  type="button"
                  onClick={startReport}
                  disabled={!reportsEnabled || reportStep !== 'idle'}
                  className="btn-secondary mt-3 w-full"
                >
                  <Flag aria-hidden="true" className="h-4 w-4" />
                  {reportsEnabled ? 'Report a spot' : 'Reporting coming soon'}
                </button>
                {reports.isError && (
                  <div className="mt-2">
                    <ErrorState message={`Community reports: ${reports.error.message}`} onRetry={reports.refetch} />
                  </div>
                )}
              </section>
            </>
          )}

          {tab === 'layers' &&
            (layerCatalog.isPending ? (
              <Loading label="Loading map layers…" />
            ) : layerCatalog.isError ? (
              <ErrorState message={`Map layers: ${layerCatalog.error.message}`} onRetry={layerCatalog.refetch} />
            ) : catalog.length === 0 ? (
              <EmptyState>No map layers have been imported yet.</EmptyState>
            ) : (
              <LayerPanel
                layers={catalog}
                enabled={enabledLayers}
                onToggle={toggleLayer}
                status={layerStatus}
                streetlightClasses={streetlightClasses}
              />
            ))}

          {tab === 'figures' && (
            <>
              <CitySummary />
              {hasCounts && (
                <section className="card space-y-3" aria-labelledby="station-figures-heading">
                  <SectionHeader id="station-figures-heading" icon={ChartColumn} title="Reported incidents by station area" />
                  <FilterBar value={filters} onChange={setFilters} />
                  {jurisdictions.isPending ? (
                    <Loading label="Loading figures…" />
                  ) : jurisdictions.isError ? (
                    <ErrorState message={jurisdictions.error.message} onRetry={jurisdictions.refetch} />
                  ) : withData.length === 0 ? (
                    <EmptyState>No figures for these years and type.</EmptyState>
                  ) : (
                    <>
                      <p className="text-sm">
                        <span className="text-lg font-semibold">{total.toLocaleString('en-IN')}</span> reported incidents
                        across {withData.length} of {areaProps.length} station areas
                      </p>
                      <ChoroplethLegend classes={classes} caption={`Reported incidents per area, ${yearLabel}, ${typeLabel}`} />
                    </>
                  )}
                </section>
              )}
              <DataNotice showBoundaries />
            </>
          )}
        </div>
      </aside>

      {reportStep === 'form' && draftPin && (
        <ReportPinDialog location={draftPin} onClose={cancelReport} onPickAgain={startReport} />
      )}
    </div>
  );
}
