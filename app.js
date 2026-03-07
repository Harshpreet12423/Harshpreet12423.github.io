// Replace these with your own Supabase project values
const SUPABASE_URL = "https://phxzeycrmkdpvegztaib.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoeHpleWNybWtkcHZlZ3p0YWliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NjMwMTUsImV4cCI6MjA4ODQzOTAxNX0.VL5Ivba37Y14xPOj6GH0x_WLFIwMakKk3i65GrB9jo0";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase URL or anon key is missing. Update SUPABASE_URL and SUPABASE_ANON_KEY in app.js."
  );
}

const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.getElementById("auth-screen");
const homeScreen = document.getElementById("home-screen");
const userEmailEl = document.getElementById("user-email");
const userAvatarEl = document.getElementById("user-avatar");
const authMessageEl = document.getElementById("auth-message");

// Home screen elements
const accountEmailEl = document.getElementById("account-email");
const accountIdEl = document.getElementById("account-id");
const accountCreatedEl = document.getElementById("account-created");
const locationStatusEl = document.getElementById("location-status");
const locationCoordsEl = document.getElementById("location-coords");
const getLocationButton = document.getElementById("btn-get-location");
const emergencyPlaceholderEl = document.getElementById("emergency-placeholder");
const emergencyLatestEl = document.getElementById("emergency-latest");
const emergencyToastEl = document.getElementById("emergency-toast");
const emergencyToastTitleEl = document.getElementById("emergency-toast-title");
const emergencyToastBodyEl = document.getElementById("emergency-toast-body");

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginSubmit = document.getElementById("login-submit");
const signupSubmit = document.getElementById("signup-submit");
const signOutButton = document.getElementById("sign-out");

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");

// Map & current user state
let mapInstance = null;
let userMarker = null;
let emergencyMarker = null;
let currentUser = null;
let locationIntervalId = null;
let emergenciesChannel = null;
let emergencyToastTimeoutId = null;
let audioCtx = null;

function setAuthMessage(message, type = "info") {
  authMessageEl.textContent = message || "";
  authMessageEl.classList.remove("auth-message--error", "auth-message--success");
  if (type === "error") {
    authMessageEl.classList.add("auth-message--error");
  } else if (type === "success") {
    authMessageEl.classList.add("auth-message--success");
  }
}

function firstLetterFromEmail(email) {
  if (!email) return "?";
  return email.trim().charAt(0).toUpperCase();
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function showAuth() {
  authScreen.classList.remove("card--hidden");
  homeScreen.classList.add("card--hidden");
  homeScreen.setAttribute("aria-hidden", "true");
  currentUser = null;
  setLocationIdle();
  stopLocationUpdates();
}

function showHome(user) {
  const email = user?.email ?? "";
  const id = user?.id ?? "";
  const createdAt = user?.created_at ?? "";

  currentUser = user || null;

  userEmailEl.textContent = email;
  if (accountEmailEl) accountEmailEl.textContent = email;
  if (accountIdEl) accountIdEl.textContent = id || "—";
  if (accountCreatedEl)
    accountCreatedEl.textContent = createdAt ? formatDateTime(createdAt) : "—";

  userAvatarEl.textContent = firstLetterFromEmail(email);
  authScreen.classList.add("card--hidden");
  homeScreen.classList.remove("card--hidden");
  homeScreen.removeAttribute("aria-hidden");

  setLocationIdle();
}

function setLoading(button, isLoading, text) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
    button.disabled = false;
  }
}

function supportsGeolocation() {
  return "geolocation" in navigator;
}

function setLocationIdle() {
  if (locationStatusEl) {
    locationStatusEl.textContent = supportsGeolocation()
      ? "Location not requested yet."
      : "Location is not available on this device.";
  }

  if (locationCoordsEl) {
    locationCoordsEl.textContent = "—";
  }
}

function setLocationLoading(isLoading) {
  if (!getLocationButton) return;

  if (isLoading) {
    getLocationButton.dataset.originalText = getLocationButton.textContent;
    getLocationButton.textContent = "Getting location…";
    getLocationButton.disabled = true;
  } else {
    getLocationButton.textContent =
      getLocationButton.dataset.originalText || "Get current location";
    getLocationButton.disabled = false;
  }
}

function stopLocationUpdates() {
  if (locationIntervalId !== null) {
    clearInterval(locationIntervalId);
    locationIntervalId = null;
  }
}

function updateMapWithLocation(latitude, longitude, accuracy) {
  const mapElement = document.getElementById("map");
  if (!mapElement || typeof L === "undefined") {
    return;
  }

  const center = [latitude, longitude];

  if (!mapInstance) {
    mapInstance = L.map(mapElement, {
      center,
      zoom: 18,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstance);
  } else {
    mapInstance.setView(center, 18);
  }

  if (!userMarker) {
    userMarker = L.marker(center, {
      title: "Your location",
    }).addTo(mapInstance);
  } else {
    userMarker.setLatLng(center);
  }
}

function updateMapWithEmergency(latitude, longitude) {
  const mapElement = document.getElementById("map");
  if (!mapElement || typeof L === "undefined") {
    return;
  }

  const center = [latitude, longitude];

  if (!mapInstance) {
    mapInstance = L.map(mapElement, {
      center,
      zoom: 17,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(mapInstance);
  } else {
    mapInstance.setView(center, 17);
  }

  if (!emergencyMarker) {
    emergencyMarker = L.circleMarker(center, {
      radius: 10,
      color: "#b91c1c",
      fillColor: "#ef4444",
      fillOpacity: 0.9,
      weight: 2,
      title: "Emergency location",
    }).addTo(mapInstance);
  } else {
    emergencyMarker.setLatLng(center);
  }
}

function playEmergencySound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    if (!audioCtx) {
      audioCtx = new Ctx();
    }

    const now = audioCtx.currentTime;
    const totalDuration = 2.0;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sawtooth";

    // Siren-style pitch sweep: high-low-high
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.7);
    osc.frequency.linearRampToValueAtTime(1200, now + 1.4);

    // Loud envelope but not clipping
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + totalDuration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + totalDuration);
  } catch (e) {
    console.error(e);
  }
}

function showEmergencyToast(title, message) {
  if (!emergencyToastEl) return;

  if (emergencyToastTitleEl) {
    emergencyToastTitleEl.textContent = title || "Emergency alert";
  }
  if (emergencyToastBodyEl) {
    emergencyToastBodyEl.textContent = message || "";
  }

  emergencyToastEl.classList.remove("emergency-toast--hidden");
  emergencyToastEl.classList.add("emergency-toast--visible");

  if (emergencyToastTimeoutId !== null) {
    clearTimeout(emergencyToastTimeoutId);
  }

  emergencyToastTimeoutId = setTimeout(() => {
    emergencyToastEl.classList.remove("emergency-toast--visible");
    emergencyToastEl.classList.add("emergency-toast--hidden");
  }, 6000);
}

function handleIncomingEmergency(emergency) {
  if (!emergency) return;

  const title = emergency.title || "Emergency";
  const description = emergency.description || "";
  const lat = emergency.latitude;
  const lon = emergency.longitude;

  if (emergencyLatestEl) {
    const parts = [];
    parts.push(title);
    if (description) parts.push(description);
    if (typeof lat === "number" && typeof lon === "number") {
      parts.push(`@ ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    }
    emergencyLatestEl.textContent = parts.join(" – ");
  }

  if (typeof lat === "number" && typeof lon === "number") {
    updateMapWithEmergency(lat, lon);
  }

  const toastMessage =
    description ||
    (typeof lat === "number" && typeof lon === "number"
      ? `Location: ${lat.toFixed(4)}, ${lon.toFixed(4)}`
      : "Check the emergencies panel.");

  showEmergencyToast(title, toastMessage);
  playEmergencySound();
}

function setupEmergencyRealtime() {
  if (emergenciesChannel || !client) return;

  emergenciesChannel = client
    .channel("public:emergencies")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "emergencies" },
      (payload) => {
        handleIncomingEmergency(payload.new);
      }
    )
    .subscribe();
}

function requestLocationOnce() {
  if (!supportsGeolocation()) {
    if (locationStatusEl) {
      locationStatusEl.textContent =
        "Location is not available on this device.";
    }
    return;
  }

  setLocationLoading(true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      setLocationLoading(false);
      const { latitude, longitude, accuracy } = position.coords;

      if (locationCoordsEl) {
        locationCoordsEl.textContent = `${latitude.toFixed(
          5
        )}, ${longitude.toFixed(5)}`;
      }

      if (locationStatusEl) {
        const acc = Number.isFinite(accuracy) ? Math.round(accuracy) : null;
        locationStatusEl.textContent = acc
          ? `Accurate to about ${acc} meters.`
          : "Location updated.";
      }

      updateMapWithLocation(latitude, longitude, accuracy);

      try {
        const userForLocation = currentUser;
        if (!userForLocation) {
          if (locationStatusEl) {
            locationStatusEl.textContent +=
              " (Not signed in; not sent to server.)";
          }
          return;
        }

        const { error: upsertError } = await client
          .from("user_locations")
          .upsert(
            {
              user_id: userForLocation.id,
              latitude,
              longitude,
              accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
            },
            { onConflict: "user_id" }
          );

        if (upsertError) {
          console.error(upsertError);
          if (locationStatusEl) {
            locationStatusEl.textContent += " (Could not sync to server.)";
          }
        } else if (locationStatusEl) {
          locationStatusEl.textContent += " Location synced to server.";
        }
      } catch (err) {
        console.error(err);
        if (locationStatusEl) {
          locationStatusEl.textContent += " (Could not sync to server.)";
        }
      }
    },
    (error) => {
      setLocationLoading(false);
      if (!locationStatusEl) return;

      switch (error.code) {
        case error.PERMISSION_DENIED:
          locationStatusEl.textContent =
            "Location permission was denied. You can change this in your browser settings.";
          break;
        case error.POSITION_UNAVAILABLE:
          locationStatusEl.textContent =
            "Location information is unavailable on this device.";
          break;
        case error.TIMEOUT:
          locationStatusEl.textContent =
            "Getting your location timed out. Try again.";
          break;
        default:
          locationStatusEl.textContent = "Could not get your location.";
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }
  );
}

async function deleteLocationForCurrentUser() {
  const userForLocation = currentUser;
  if (!userForLocation) return;

  try {
    const { error } = await client
      .from("user_locations")
      .delete()
      .eq("user_id", userForLocation.id);

    if (error) {
      console.error(error);
    }
  } catch (err) {
    console.error(err);
  }
}

async function refreshSessionView() {
  try {
    const {
      data: { session },
      error,
    } = await client.auth.getSession();

    if (error) {
      console.error(error);
      showAuth();
      return;
    }

    if (session?.user) {
      showHome(session.user);
    } else {
      showAuth();
    }
  } catch (e) {
    console.error(e);
    showAuth();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;

  if (!email || !password) {
    setAuthMessage("Enter your email and password.", "error");
    return;
  }

  setAuthMessage("");
  setLoading(loginSubmit, true, "Signing in…");

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  setLoading(loginSubmit, false);

  if (error) {
    console.error(error);
    setAuthMessage(error.message || "Unable to sign in.", "error");
    return;
  }

  setAuthMessage("Signed in successfully.", "success");
  if (data.session?.user) {
    showHome(data.session.user);
  } else {
    await refreshSessionView();
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = signupForm.elements.email.value.trim();
  const password = signupForm.elements.password.value;
  const passwordConfirm = signupForm.elements.passwordConfirm.value;

  if (!email || !password) {
    setAuthMessage("Email and password are required.", "error");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Password must be at least 6 characters.", "error");
    return;
  }

  if (password !== passwordConfirm) {
    setAuthMessage("Passwords do not match.", "error");
    return;
  }

  setAuthMessage("");
  setLoading(signupSubmit, true, "Creating…");

  const { data, error } = await client.auth.signUp({
    email,
    password,
  });

  setLoading(signupSubmit, false);

  if (error) {
    console.error(error);
    setAuthMessage(error.message || "Unable to sign up.", "error");
    return;
  }

  if (data.session?.user) {
    setAuthMessage("Account created. You are now signed in.", "success");
    showHome(data.session.user);
  } else {
    setAuthMessage(
      "Check your email to confirm your account, then return here to sign in.",
      "success"
    );
  }
});

signOutButton.addEventListener("click", async () => {
  signOutButton.disabled = true;
  stopLocationUpdates();
  await deleteLocationForCurrentUser();

  const { error } = await client.auth.signOut();
  signOutButton.disabled = false;

  if (error) {
    console.error(error);
    setAuthMessage("Unable to sign out right now.", "error");
    return;
  }

  setAuthMessage("Signed out.", "success");
  await refreshSessionView();
});

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("tab-button--active");
  tabSignup.classList.remove("tab-button--active");
  loginForm.classList.add("active");
  signupForm.classList.remove("active");
  setAuthMessage("");
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("tab-button--active");
  tabLogin.classList.remove("tab-button--active");
  signupForm.classList.add("active");
  loginForm.classList.remove("active");
  setAuthMessage("");
});

if (getLocationButton) {
  getLocationButton.addEventListener("click", () => {
    requestLocationOnce();

    if (locationIntervalId === null) {
      locationIntervalId = setInterval(() => {
        requestLocationOnce();
      }, 15000);
    }
  });
}

window.addEventListener("beforeunload", () => {
  stopLocationUpdates();
  // Fire and forget; may not always complete before tab closes.
  deleteLocationForCurrentUser();
});

client.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    showHome(session.user);
  } else {
    showAuth();
  }
});

setupEmergencyRealtime();

refreshSessionView();

