/**
 * Performs a fetch request to the API, automatically handling JSON parsing,
 * error handling, and adding the Authorization header if a token exists.
 *
 * @param endpoint The API endpoint (e.g., '/api/auth/login')
 * @param options Fetch options (method, body, etc.)
 * @returns Promise<any> The JSON response from the API
 * @throws Error if the request fails or the response is not ok
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}): Promise<any> => {
  const token = localStorage.getItem('authToken');
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    // Ensure authority header for middleware check
    ':authority:': window.location.host,
    // Include HTTP method header
    ':method:': options.method || 'GET',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
    // Include username header if available
    const userData = localStorage.getItem('authUser');
    if (userData) {
      try {
        const { username } = JSON.parse(userData);
        if (username) defaultHeaders['username'] = username;
      } catch {};
    }
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    const response = await fetch(endpoint, config);

    // Attempt to parse JSON regardless of status code, as error messages might be in the body
    let responseData;
    try {
        responseData = await response.json();
    } catch (jsonError) {
        // If JSON parsing fails, use the raw text response if available
        responseData = { message: await response.text() || 'Failed to parse response' };
    }

    if (!response.ok) {
      // Throw an error with the message from the API response or a default one
      const err: any = new Error(responseData.message || `HTTP error! status: ${response.status}`);
      // Attach errors object (e.g., { field: 'message' }) if provided by backend
      if (responseData.errors) err.errors = responseData.errors;
      throw err;
    }

    return responseData;

  } catch (error: any) {
    console.error('API Fetch Error:', error);
    // Re-throw the error so components can handle it (e.g., show toast)
    // Ensure the error has a meaningful message
    throw new Error(error.message || 'An unexpected error occurred during the API request.');
  }
};
