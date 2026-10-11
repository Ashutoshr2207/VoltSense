import apiRequest from "./api";

export async function fetchNotifications(params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await apiRequest(`/notifications${query ? `?${query}` : ""}`);
  return response.data; // { notifications, unreadCount, total }
}

export async function markNotificationAsRead(notificationId) {
  const response = await apiRequest(`/notifications/${notificationId}/read`, {
    method: "PATCH"
  });
  return response.data.notification;
}
