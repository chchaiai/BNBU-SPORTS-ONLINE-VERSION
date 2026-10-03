"use client";

import { useEffect, useState, type ComponentType } from "react";

/** Cache code loads. A failed download never refreshes an active session automatically. */
export function deferredComponent<P extends object>(load: () => Promise<ComponentType<P>>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | null = null;
  return function DeferredComponent(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (Component) return;
      let active = true;
      setFailed(false);
      pending ??= Promise.resolve().then(load).then(result => { loaded = result; return result; })
        .finally(() => { pending = null; });
      void pending.then(result => {
        if (active) setComponent(() => result);
      }, () => { if (active) setFailed(true); });
      return () => { active = false; };
    }, [Component]);
    if (Component) return <Component {...props} />;
    const english = typeof document !== "undefined" && document.documentElement.lang.startsWith("en");
    return <div className="admin-loading" role={failed ? "alert" : "status"} aria-live="polite">
      <p>{failed ? (english ? "Page could not load. You can open another page or reload." : "页面加载失败。可切换其他页面，或重新加载页面。") : (english ? "Loading…" : "正在加载…")}</p>
      {failed && <button className="primary-button" type="button" onClick={() => window.location.reload()}>{english ? "Reload page" : "重新加载页面"}</button>}
    </div>;
  };
}
