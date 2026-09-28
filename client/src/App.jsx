import { NavLink, Route, Routes } from 'react-router';
import { ChartColumn, LifeBuoy, Map as MapIcon } from 'lucide-react';
import DisclaimerBanner from './components/DisclaimerBanner.jsx';
import MapPage from './pages/MapPage.jsx';
import TrendsPage from './pages/TrendsPage.jsx';

const navClass = ({ isActive }) =>
  `flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900'
  }`;

export default function App() {
  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="relative z-30 flex items-center justify-between gap-3 border-b border-ink-100 bg-white px-4 py-2.5">
        <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <LifeBuoy aria-hidden="true" className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight tracking-tight">Bengaluru Help Map</span>
            <span className="hidden text-xs text-ink-500 sm:block">Police stations, help points and official figures</span>
          </span>
        </NavLink>
        <nav className="flex shrink-0 rounded-xl bg-ink-100 p-1" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            <MapIcon aria-hidden="true" className="h-4 w-4" />
            <span className="max-sm:sr-only">Map</span>
          </NavLink>
          <NavLink to="/trends" className={navClass}>
            <ChartColumn aria-hidden="true" className="h-4 w-4" />
            <span className="max-sm:sr-only">Trends</span>
          </NavLink>
        </nav>
      </header>
      <DisclaimerBanner />
      <main className="relative flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="*" element={<p className="p-6 text-sm text-ink-500">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
