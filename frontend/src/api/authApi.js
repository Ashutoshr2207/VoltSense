import apiRequest from "./api";

export async function loginUser(email, password) {
  const response = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password
    })
  });

  return response.data;
}

export async function registerUser(name, email, password) {
  const response = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password
    })
  });

  return response.data;
}

export async function getCurrentUser() {
  const response = await apiRequest("/auth/me");

  return response.data.user;
}

export async function logoutUser() {
  return apiRequest("/auth/logout", {
    method: "POST"
  });
}