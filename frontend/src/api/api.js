const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem("voltsense_token");

  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem("voltsense_token");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("voltsense:unauthorized"));
    }
  }

  const result = await response.json();

  if (!response.ok) {
    let errorMsg = result.message || (result.error && result.error.message) || "API request failed";
    const details = result.details || (result.error && result.error.details);
    if (details && typeof details === "object") {
      const msgs = Object.values(details).filter(Boolean);
      if (msgs.length > 0) {
        errorMsg = msgs.join(". ");
      }
    }
    throw new Error(errorMsg);
  }

  return result;
}

export default apiRequest;