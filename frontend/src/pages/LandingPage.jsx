import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';

export default function LandingPage() {
  const { setCurrentTab } = useApp();

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'VOLTSENSE_NAV') {
        if (event.data.route === 'login') {
          setCurrentTab('signin');
        } else if (event.data.route === 'register') {
          setCurrentTab('register');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setCurrentTab]);

  const handleIframeLoad = (e) => {
    try {
      const doc = e.target.contentDocument || e.target.contentWindow?.document;
      if (!doc) return;
      doc.querySelectorAll('[data-route]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          const route = el.getAttribute('data-route');
          if (route === 'login') {
            setCurrentTab('signin');
          } else if (route === 'register') {
            setCurrentTab('register');
          }
        });
      });
    } catch (err) {
      console.warn('Iframe listener setup error:', err);
    }
  };

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#fbfaf6] z-30">
      <iframe
        src="/landing.html"
        title="VoltSense - Battery Diagnostics"
        onLoad={handleIframeLoad}
        className="w-full h-full border-none block m-0 p-0"
        style={{ width: '100vw', height: '100vh', border: 'none' }}
      />
    </div>
  );
}
