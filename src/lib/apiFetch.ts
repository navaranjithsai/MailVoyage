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
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
    const userData = localStorage.getItem('authUser');
    if (userData) {
      try {
        const { username } = JSON.parse(userData);
        if (username) defaultHeaders['username'] = username; // Custom header, ensure backend handles if necessary
      } catch (e) {
        // Ignore error if authUser data is malformed
        console.warn('Failed to parse authUser from localStorage', e);
      }
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

    let responseData: any;
    let responseText = ''; // Store raw text for better error reporting

    try {
      responseText = await response.text();
      if (responseText) {
        responseData = JSON.parse(responseText);
      } else {
        // Handle cases where response body is empty but status might be relevant (e.g., 204 No Content)
        // For errors, this will be overridden by the !response.ok block
        responseData = response.ok ? {} : { message: 'Empty response from server.' };
      }
    } catch (jsonError) {
      // If JSON parsing fails, use the raw text as the message if available and response is not ok
      // If response is ok but JSON is malformed, that's a server issue.
      responseData = { message: responseText || `Failed to parse JSON response. Status: ${response.status}` };
    }

    if (!response.ok) {
      // Ensure message comes from parsed JSON error or fallback
      const message = responseData?.message || responseText || `HTTP error! status: ${response.status}`;
      const err: any = new Error(message);
      
      // Attach errors object (e.g., { field: 'message' }) if provided by backend
      if (responseData?.errors) {
        err.errors = responseData.errors;
      }
      err.status = response.status; // Attach status code to the error
      throw err;
    }

    return responseData;

  } catch (error: unknown) {
    console.error('API Fetch Error:', error);

    // Re-throw the error so components can handle it.
    // If it's an error we constructed in the !response.ok block, it will have status/errors.
    // If it's a network error from fetch itself (e.g., TypeError), it will be an Error instance.
    if (error instanceof Error) {
      throw error;
    }

    // Fallback for other types of thrown values (less common)
    let message = 'An unexpected error occurred during the API request.';
    if (typeof error === 'string' && error.length > 0) {
      message = error;
    } else if (typeof (error as any)?.message === 'string') {
      message = (error as any).message;
    }
    const newError = new Error(message);
    // If the original error had a status, try to preserve it (though less likely for non-Error types)
    if (typeof (error as any)?.status === 'number') {
      (newError as any).status = (error as any).status;
    }
    throw newError;
  }
};
