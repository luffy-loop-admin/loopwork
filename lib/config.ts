export const CURRENCY = 'PKR';
export const TIMEZONE = 'Asia/Karachi';
export const APP_VERSION = '1.3.0';

export type UpdateNote = {
  version: string;
  title: string;
  date: string;
  highlights: { icon: string; title: string; desc: string }[];
};

export const LATEST_UPDATE: UpdateNote = {
  version: '1.3.0',
  title: 'Mobile Shortcut & Order Ring Alert Update',
  date: 'October 2026',
  highlights: [
    {
      icon: '📱',
      title: 'Mobile App & Home Screen Shortcut',
      desc: 'Install directly or add a home screen shortcut to your Android, iPhone, or PC for fast 1-tap access and full screen mode.',
    },
    {
      icon: '🔔',
      title: 'Order Bell & Vendor Ringtone Alerts',
      desc: 'Admins can ring vendors with the bell button on any order. Vendors hear an audio ringtone & see a visual alert on their device.',
    },
    {
      icon: '💳',
      title: 'All Listings: Payment Status & Date',
      desc: 'Clean table displaying Payment Status (Paid, Pending, Unpaid color badges) and Date, synced automatically from Google Sheets.',
    },
    {
      icon: '⚡',
      title: 'Exact Price & Google Index Check',
      desc: 'Strict exact row pricing, automatic duplicate order cleanup, and Serper API key validation.',
    },
  ],
};
