"use client";

import dynamic from "next/dynamic";

/*
 * The whole app runs in the browser: it reads this device's saved sign-ins
 * and speakers on start, so there is nothing useful to render on the server.
 */

function Splash() {
  return (
    <div className="splash" aria-label="Compass Classics is starting">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark-transparent.png" alt="" />
    </div>
  );
}

const ClientApp = dynamic(() => import("./ClientApp"), { ssr: false, loading: Splash });

export default function App() {
  return <ClientApp />;
}
