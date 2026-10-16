/**
 * MarketingPage – Router wrapper for the marketing module sub-pages.
 * 2026-10-16: a placeholder demó-oldalak (SEO/Hűségprogram/Árfigyelő) TÖRÖLVE
 * (Mauroni-incidens — a demó-tartalom más ügyfél adatának tűnt az ügyfélnek).
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import MarketingDashboardPage from './MarketingDashboardPage';
import EmailCampaignsPage from './EmailCampaignsPage';
import SegmentsPage from './SegmentsPage';
import SocialMediaPage from './SocialMediaPage';
import ZomboAuditPage from './ZomboAuditPage';

export default function MarketingPage() {
  return (
    <Routes>
      <Route index element={<MarketingDashboardPage />} />
      <Route path="dashboard" element={<MarketingDashboardPage />} />
      <Route path="email" element={<EmailCampaignsPage />} />
      <Route path="segments" element={<SegmentsPage />} />
      <Route path="social" element={<SocialMediaPage />} />
      <Route path="zombo" element={<ZomboAuditPage />} />
      <Route path="*" element={<Navigate to="/admin/marketing" replace />} />
    </Routes>
  );
}
