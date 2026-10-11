import apiRequest from "./api";

export async function fetchProfile() {
  const response = await apiRequest("/users/me");
  return response.data.user;
}

export async function updateProfile(payload) {
  const response = await apiRequest("/users/me", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  return response.data.user;
}
