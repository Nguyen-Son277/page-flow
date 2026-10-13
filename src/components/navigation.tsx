'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pageflow-sidebar-expanded';
export function useNavigationLayout() {
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => {
      setMobile(media.matches);
      setDrawerOpen(false);
    };
    update();
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'true' || stored === 'false') setExpanded(stored === 'true');
    } catch { /* Use the in-memory preference when storage is blocked. */ }
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const open = useCallback(() => {
    if (mobile) setDrawerOpen(true);
    else {
      setExpanded(true);
      try { window.localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    }
  }, [mobile]);
  const close = useCallback(() => {
    if (mobile) setDrawerOpen(false);
    else {
      setExpanded(false);
      try { window.localStorage.setItem(STORAGE_KEY, 'false'); } catch {}
    }
  }, [mobile]);
  const closeOnSelect = useCallback(() => {
    if (mobile) setDrawerOpen(false);
  }, [mobile]);

  return { mobile, drawerOpen, sidebarVisible: mobile ? drawerOpen : expanded, open, close, closeOnSelect };
}
