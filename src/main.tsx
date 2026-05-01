import React from "react";
import ReactDOM from "react-dom/client";
import "katex/dist/katex.min.css";
import App from "./App";
import "./styles.css";

async function reloadWithUpdatedServiceWorker() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }

  registration.waiting.postMessage({ type: "SKIP_WAITING" });
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) {
    return () => {};
  }

  let didRequestReload = false;
  const notifyUpdate = () => window.dispatchEvent(new Event("organizer:pwa-update-available"));
  const handleControllerChange = () => {
    if (didRequestReload) {
      window.location.reload();
    }
  };

  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

  void navigator.serviceWorker.register("/sw.js").then((registration) => {
    if (registration.waiting) {
      notifyUpdate();
    }

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;
      if (!installingWorker) {
        return;
      }

      installingWorker.addEventListener("statechange", () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
          notifyUpdate();
        }
      });
    });
  }).catch((error) => {
    console.error("Failed to register service worker", error);
  });

  return () => {
    didRequestReload = true;
    void reloadWithUpdatedServiceWorker();
  };
}

const updateSW = registerServiceWorker();

function AppShell() {
  const [updateAvailable, setUpdateAvailable] = React.useState(false);

  React.useEffect(() => {
    const handleUpdateAvailable = () => setUpdateAvailable(true);
    window.addEventListener("organizer:pwa-update-available", handleUpdateAvailable);
    return () => window.removeEventListener("organizer:pwa-update-available", handleUpdateAvailable);
  }, []);

  const handleReload = () => {
    void updateSW();
  };

  return (
    <>
      <App />
      {updateAvailable ? (
        <div className="pwa-update-toast" role="status" aria-live="polite">
          <p className="pwa-update-toast__text">Update available</p>
          <div className="pwa-update-toast__actions">
            <button className="pwa-update-toast__button pwa-update-toast__button--primary" onClick={handleReload} type="button">
              Update now
            </button>
            <button className="pwa-update-toast__button" onClick={() => setUpdateAvailable(false)} type="button">
              Later
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<AppShell />);
