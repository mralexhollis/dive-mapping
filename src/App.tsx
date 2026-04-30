import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import EditorPage from './pages/EditorPage';
import ViewerPage from './pages/ViewerPage';
import PlanListPage from './pages/PlanListPage';
import PlansPage from './pages/PlansPage';
import DiverProfilesPage from './pages/DiverProfilesPage';
import { attachAutosave } from './state/persistence';

export default function App() {
  useEffect(() => attachAutosave(), []);
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/profiles" element={<DiverProfilesPage />} />
      <Route path="/edit/:siteId" element={<EditorPage />} />
      <Route path="/plan/:siteId" element={<PlanListPage />} />
      <Route path="/plan/:siteId/:planId" element={<PlansPage />} />
      <Route path="/view/:siteId" element={<ViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
