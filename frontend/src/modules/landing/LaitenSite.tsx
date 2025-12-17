import { LaikaProLandingPage } from './LaikaProLandingPage';
import { LaitenAboutPage } from './laiten/LaitenAboutPage';
import { LaitenCareersPage } from './laiten/LaitenCareersPage';
import { LaitenWhatsNewPage } from './laiten/LaitenWhatsNewPage';

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
    case 'home':
    default:
      return <LaikaProLandingPage />;
  }
};
