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
import ZomboQuickPostPage from './zombo/components/ZomboQuickPostPage';
import ZomboCalendarPage from './zombo/components/ZomboCalendarPage';
import ZomboLayerReviewPage from './zombo/components/ZomboLayerReviewPage';
import CreativeStudioPage from './CreativeStudioPage';
import ZomboCampaignPage from './zombo/components/ZomboCampaignPage';

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
      {/* Social Planner sub-routes */}
      <Route path="social-planner/quickpost" element={<ZomboQuickPostPage />} />
      <Route path="social-planner/calendar" element={<ZomboCalendarPage />} />
      <Route path="social-planner/campaign" element={<ZomboCampaignPage />} />
      <Route path="social-planner/layer-review" element={<ZomboLayerReviewPage />} />
      <Route path="social-planner/creative-studio/*" element={<CreativeStudioPage />} />
      <Route path="social-planner" element={<ZomboAuditPage />} />
      {/* Backward compatibility redirect */}
      <Route path="zombo/*" element={<Navigate to="/marketing/social-planner" replace />} />
      <Route path="zombo" element={<Navigate to="/marketing/social-planner" replace />} />
      <Route path="*" element={<Navigate to="/admin/marketing" replace />} />
    </Routes>
  );
}
