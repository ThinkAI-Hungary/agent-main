/**
 * MarketingPage – Router wrapper for the marketing module sub-pages.
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import MarketingDashboardPage from './MarketingDashboardPage';
import EmailCampaignsPage from './EmailCampaignsPage';
import SegmentsPage from './SegmentsPage';
import SocialMediaPage from './SocialMediaPage';
import SeoPage from './SeoPage';
import LoyaltyPage from './LoyaltyPage';
import CompetitorPage from './CompetitorPage';
import ZomboAuditPage from './ZomboAuditPage';

export default function MarketingPage() {
  return (
    <Routes>
      <Route index element={<MarketingDashboardPage />} />
      <Route path="dashboard" element={<MarketingDashboardPage />} />
      <Route path="email" element={<EmailCampaignsPage />} />
      <Route path="segments" element={<SegmentsPage />} />
      <Route path="social" element={<SocialMediaPage />} />
      <Route path="seo" element={<SeoPage />} />
      <Route path="loyalty" element={<LoyaltyPage />} />
      <Route path="competitor" element={<CompetitorPage />} />
      <Route path="zombo" element={<ZomboAuditPage />} />
      <Route path="*" element={<Navigate to="/admin/marketing" replace />} />
    </Routes>
  );
}
