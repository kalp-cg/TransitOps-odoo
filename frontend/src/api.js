const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'https://transitops-odoo-gnbb.onrender.com/api');

const getToken = () => localStorage.getItem('transitops_token');

const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${getToken()}`,
});

const handleResponse = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

export const api = {
  // Auth
  login: (email, password) =>
    fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(handleResponse),
  me: () => fetch(`${API_BASE}/auth/me`, { headers: headers() }).then(handleResponse),

  // Vehicles
  getVehicles: (params = {}) =>
    fetch(`${API_BASE}/vehicles?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  getVehicle: (id) => fetch(`${API_BASE}/vehicles/${id}`, { headers: headers() }).then(handleResponse),
  createVehicle: (data) =>
    fetch(`${API_BASE}/vehicles`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  updateVehicle: (id, data) =>
    fetch(`${API_BASE}/vehicles/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  deleteVehicle: (id) =>
    fetch(`${API_BASE}/vehicles/${id}`, { method: 'DELETE', headers: headers() }).then(handleResponse),

  // Drivers
  getDrivers: (params = {}) =>
    fetch(`${API_BASE}/drivers?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  getDriver: (id) => fetch(`${API_BASE}/drivers/${id}`, { headers: headers() }).then(handleResponse),
  createDriver: (data) =>
    fetch(`${API_BASE}/drivers`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  updateDriver: (id, data) =>
    fetch(`${API_BASE}/drivers/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  suspendDriver: (id) =>
    fetch(`${API_BASE}/drivers/${id}/suspend`, { method: 'PUT', headers: headers() }).then(handleResponse),
  unsuspendDriver: (id) =>
    fetch(`${API_BASE}/drivers/${id}/unsuspend`, { method: 'PUT', headers: headers() }).then(handleResponse),
  updateSafetyScore: (id, safety_score) =>
    fetch(`${API_BASE}/drivers/${id}/safety-score`, { method: 'PUT', headers: headers(), body: JSON.stringify({ safety_score }) }).then(handleResponse),
  deleteDriver: (id) =>
    fetch(`${API_BASE}/drivers/${id}`, { method: 'DELETE', headers: headers() }).then(handleResponse),

  // Trips
  getTrips: (params = {}) =>
    fetch(`${API_BASE}/trips?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  getTrip: (id) => fetch(`${API_BASE}/trips/${id}`, { headers: headers() }).then(handleResponse),
  createTrip: (data) =>
    fetch(`${API_BASE}/trips`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  dispatchTrip: (id) =>
    fetch(`${API_BASE}/trips/${id}/dispatch`, { method: 'POST', headers: headers() }).then(handleResponse),
  completeTrip: (id, data) =>
    fetch(`${API_BASE}/trips/${id}/complete`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  cancelTrip: (id) =>
    fetch(`${API_BASE}/trips/${id}/cancel`, { method: 'POST', headers: headers() }).then(handleResponse),
  recommendResources: (data) =>
    fetch(`${API_BASE}/trips/recommend-resources`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  getMyTrips: () =>
    fetch(`${API_BASE}/trips/my-trips`, { headers: headers() }).then(handleResponse),

  // Maintenance
  getMaintenance: (params = {}) => fetch(`${API_BASE}/maintenance?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  createMaintenance: (data) =>
    fetch(`${API_BASE}/maintenance`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  completeMaintenance: (id, data) =>
    fetch(`${API_BASE}/maintenance/${id}/complete`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),

  // Expenses
  getFuelLogs: (params = {}) => fetch(`${API_BASE}/expenses/fuel?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  createFuelLog: (data) =>
    fetch(`${API_BASE}/expenses/fuel`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  getExpenses: (params = {}) => fetch(`${API_BASE}/expenses/operational?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  createExpense: (data) =>
    fetch(`${API_BASE}/expenses/operational`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),

  // Dashboard
  getDashboard: (params = {}) =>
    fetch(`${API_BASE}/dashboard?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),

  // Reports
  getAnalytics: (params = {}) =>
    fetch(`${API_BASE}/reports/analytics?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  exportCsv: (reportType) => {
    const url = `${API_BASE}/reports/export-csv?reportType=${reportType}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report.csv`;
    a.target = '_blank';
    // Must include auth header via manual fetch since <a> tag doesn't allow custom headers
    fetch(url, { headers: headers() })
      .then(res => res.blob())
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        a.href = objectUrl;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      });
  },

  // Users
  getUsers: (params = {}) => fetch(`${API_BASE}/users?${new URLSearchParams(params)}`, { headers: headers() }).then(handleResponse),
  createUser: (data) =>
    fetch(`${API_BASE}/users`, { method: 'POST', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  updateUser: (id, data) =>
    fetch(`${API_BASE}/users/${id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(data) }).then(handleResponse),
  deleteUser: (id) =>
    fetch(`${API_BASE}/users/${id}`, { method: 'DELETE', headers: headers() }).then(handleResponse),

  // Vehicle Documents
  getVehicleDocuments: (vehicleId) =>
    fetch(`${API_BASE}/vehicles/${vehicleId}/documents`, { headers: headers() }).then(handleResponse),
  addVehicleDocument: (vehicleId, formData) =>
    fetch(`${API_BASE}/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }, // no Content-Type – browser sets multipart boundary
      body: formData
    }).then(handleResponse),
  updateVehicleDocument: (vehicleId, docId, formData) =>
    fetch(`${API_BASE}/vehicles/${vehicleId}/documents/${docId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData
    }).then(handleResponse),
  deleteVehicleDocument: (vehicleId, docId) =>
    fetch(`${API_BASE}/vehicles/${vehicleId}/documents/${docId}`, {
      method: 'DELETE', headers: headers()
    }).then(handleResponse),
  getVehicleDocumentAlerts: () =>
    fetch(`${API_BASE}/vehicles/documents/alerts`, { headers: headers() }).then(handleResponse),
  getVehicleDocumentDownloadUrl: (vehicleId, docId) =>
    `${API_BASE}/vehicles/${vehicleId}/documents/${docId}/download`,
};
