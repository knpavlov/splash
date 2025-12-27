import { LaikaProLandingPage } from './LaikaProLandingPage';
import { LaitenAboutPage } from './laiten/LaitenAboutPage';
import { LaitenCareersPage } from './laiten/LaitenCareersPage';
import { LaitenWhatsNewPage } from './laiten/LaitenWhatsNewPage';
import { LaitenPrivacyPage } from './laiten/LaitenPrivacyPage';
import { LaitenTermsPage } from './laiten/LaitenTermsPage';
import { LaitenContactPage } from './laiten/LaitenContactPage';

import type { LaitenSiteView } from './laiten/laitenSiteView';
export type { LaitenSiteView } from './laiten/laitenSiteView';

export const LaitenSite = ({ view }: { view: LaitenSiteView }) => {
  switch (view) {
    case 'about':
      return <LaitenAboutPage />;
    case 'careers':
      return <LaitenCareersPage />;
    case 'whats-new':
      return <LaitenWhatsNewPage />;
    case 'privacy':
      return <LaitenPrivacyPage />;
    case 'terms':
      return <LaitenTermsPage />;
    case 'contact':
      return <LaitenContactPage />;
    case 'home':
    default:
      return <LaikaProLandingPage />;
  }
};
