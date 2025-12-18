import type { VercelRequest, VercelResponse } from "@vercel/node";
// Important: use .js extension for Vercel ESM resolver
import { verifyAuth } from "./verifyAuth.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers early
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Declare decodedUrl outside try block so it's available in catch
  let decodedUrl: string = '';
  
  try {
    // Verify auth with better error handling
    let auth;
    try {
      auth = await verifyAuth(req);
    } catch (authError: any) {
      console.error('Auth verification error:', authError);
      return res.status(401).json({ error: 'Unauthorized', details: authError?.message });
    }
    
    if (!auth?.uid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const imageUrl = req.query.url as string;
    if (!imageUrl || typeof imageUrl !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    // Decode the URL - handle multiple levels of encoding
    decodedUrl = imageUrl;
    try {
      // Try decoding multiple times to handle double/triple encoding
      let previousUrl = decodedUrl;
      let maxDecodes = 10; // Increase max decodes to handle deeply nested encoding
      for (let i = 0; i < maxDecodes; i++) {
        try {
          const newUrl = decodeURIComponent(decodedUrl);
          // If decoding didn't change anything, we're done
          if (newUrl === decodedUrl) break;
          decodedUrl = newUrl;
          previousUrl = decodedUrl;
        } catch (decodeError) {
          // If decode fails at this level, we've decoded as much as possible
          break;
        }
      }
    } catch (e) {
      // If decode fails completely, the URL might already be decoded, use as-is
      console.warn('Failed to decode URL, using as-is:', imageUrl);
      decodedUrl = imageUrl;
    }
    
    // Additional check: if URL still contains encoded sequences, try one more time
    if (decodedUrl.includes('%')) {
      try {
        decodedUrl = decodeURIComponent(decodedUrl);
      } catch (e) {
        // Ignore - use what we have
      }
    }

    // Validate that the URL is from Firebase Storage
    if (!decodedUrl.includes('firebasestorage.googleapis.com')) {
      return res.status(400).json({ error: 'Invalid image URL - must be from Firebase Storage' });
    }

    // Validate URL format
    let finalUrl: string;
    try {
      finalUrl = decodedUrl.trim();
      // Try to create a URL object to validate it
      new URL(finalUrl);
    } catch (urlError) {
      console.error('Invalid URL format after decoding:', decodedUrl.substring(0, 200));
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Final URL validation and cleanup
    // Remove any remaining double-encoding artifacts
    while (finalUrl.includes('%25')) {
      try {
        const decoded = decodeURIComponent(finalUrl);
        if (decoded === finalUrl) break; // No more decoding possible
        finalUrl = decoded;
      } catch (e) {
        break; // Can't decode further
      }
    }
    
    // Validate URL again after cleanup
    try {
      new URL(finalUrl);
    } catch (urlError) {
      console.error('Invalid URL format after cleanup:', finalUrl.substring(0, 200));
      return res.status(400).json({ error: 'Invalid URL format after decoding' });
    }
    
    // Build a fallback with an encoded object path in case Firebase rejects the raw path
    let encodedObjectUrl: string | null = null;
    try {
      const parsed = new URL(finalUrl);
      const splitPath = parsed.pathname.split('/o/');
      if (splitPath.length === 2) {
        const encodedObject = encodeURIComponent(splitPath[1]);
        encodedObjectUrl = `${parsed.origin}${splitPath[0]}/o/${encodedObject}${parsed.search}`;
      }
    } catch (e) {
      // Ignore fallback creation errors
    }
    
    console.log('Fetching image from:', finalUrl.substring(0, 150) + '...');
    if (encodedObjectUrl && encodedObjectUrl !== finalUrl) {
      console.log('Encoded object fallback URL prepared.');
    }
    console.log('Original encoded URL:', imageUrl.substring(0, 150) + '...');

    // Helper to fetch with timeout
    const fetchWithTimeout = async (urlToFetch: string) => {
      const controller = new AbortController();
      let timeoutId: NodeJS.Timeout | null = null;
      try {
        timeoutId = setTimeout(() => controller.abort(), 30000);
        const resp = await fetch(urlToFetch, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
            'Accept': 'image/*',
          },
          signal: controller.signal,
        });
        if (timeoutId) clearTimeout(timeoutId);
        return resp;
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
      }
    };

    // Fetch the image server-side (no CORS restrictions)
    let imageResponse;
    try {
      imageResponse = await fetchWithTimeout(finalUrl);
    } catch (fetchError: any) {
      console.error('Error fetching image from Firebase:', fetchError);
      console.error('Decoded URL was:', decodedUrl);
      console.error('Error name:', fetchError.name);
      console.error('Error message:', fetchError.message);
      // Check if it's a timeout/abort
      if (fetchError.name === 'AbortError' || fetchError.message?.includes('aborted')) {
        return res.status(504).json({ error: 'Request timeout - image fetch took too long' });
      }
      return res.status(502).json({ 
        error: 'Failed to fetch image from Firebase Storage',
        details: process.env.NODE_ENV === 'development' ? `${fetchError.message} - URL: ${decodedUrl.substring(0, 200)}` : undefined
      });
    }

    // Retry with encoded object path if the first attempt fails
    if (!imageResponse.ok && encodedObjectUrl && encodedObjectUrl !== finalUrl) {
      console.warn(`Primary fetch failed (${imageResponse.status}). Retrying with encoded object path.`);
      try {
        imageResponse = await fetchWithTimeout(encodedObjectUrl);
      } catch (fallbackError: any) {
        console.error('Fallback fetch error:', fallbackError);
        // If fallback fetch throws, proceed to error handling below
      }
    }

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text().catch(() => '');
      console.error(`Firebase Storage returned error: ${imageResponse.status} ${imageResponse.statusText}`);
      console.error('URL that failed:', decodedUrl);
      console.error('Response body (truncated):', errorText.substring(0, 500));
      return res.status(imageResponse.status).json({ 
        error: `Failed to fetch image: ${imageResponse.statusText}`,
        details: process.env.NODE_ENV === 'development' ? errorText.substring(0, 500) : undefined
      });
    }

    // Get content type before reading body
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    // Check content length to prevent memory issues (limit to 10MB)
    const contentLength = imageResponse.headers.get('content-length');
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (contentLength && parseInt(contentLength) > maxSize) {
      console.error('Image too large:', contentLength);
      return res.status(413).json({ error: 'Image too large (max 25MB)' });
    }

    // Read the image buffer with error handling
    let imageBuffer: ArrayBuffer;
    try {
      imageBuffer = await imageResponse.arrayBuffer();
      if (!imageBuffer || imageBuffer.byteLength === 0) {
        throw new Error('Received empty image buffer');
      }
      
      // Check size after reading
      if (imageBuffer.byteLength > maxSize) {
        console.error('Image too large after reading:', imageBuffer.byteLength);
        return res.status(413).json({ error: 'Image too large (max 25MB)' });
      }
    } catch (bufferError: any) {
      console.error('Error reading image buffer:', bufferError);
      if (!res.headersSent) {
        return res.status(502).json({ 
          error: 'Failed to read image data',
          details: bufferError?.message
        });
      }
      return;
    }

    // Convert to Buffer safely
    let buffer: Buffer;
    try {
      buffer = Buffer.from(imageBuffer);
    } catch (bufferError: any) {
      console.error('Error creating buffer:', bufferError);
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: 'Failed to process image data',
          details: bufferError?.message
        });
      }
      return;
    }

    // Return the image with proper headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', buffer.length.toString());
    
    // Send response - use send() for binary data in Vercel (end() can cause issues)
    try {
      res.send(buffer);
      return;
    } catch (sendError: any) {
      console.error('Error sending response:', sendError);
      // Response might already be sent, so don't try to send again
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to send image' });
      }
      return;
    }
  } catch (error: any) {
    console.error('Error proxying image:', error);
    // decodedUrl might not be defined if error occurred before decoding
    const errorDecodedUrl = typeof decodedUrl !== 'undefined' ? decodedUrl : 'N/A';
    const originalUrl = req.query?.url ? String(req.query.url).substring(0, 200) : 'N/A';
    
    console.error('Error details:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 10), // First 10 lines of stack
      url: originalUrl,
      decodedUrl: errorDecodedUrl.substring(0, 200),
    });
    
    // Check if response has already been sent
    if (res.headersSent) {
      console.error('Response already sent, cannot send error response');
      return;
    }
    
    // Return more detailed error in development
    const errorDetails = process.env.NODE_ENV === 'development' ? {
      message: error?.message,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 5), // First 5 lines of stack
      originalUrl: originalUrl,
      decodedUrl: errorDecodedUrl.substring(0, 200),
    } : undefined;
    
    try {
      return res.status(500).json({ 
        error: 'Internal server error',
        details: errorDetails
      });
    } catch (responseError: any) {
      // If we can't send the error response, log it
      console.error('Failed to send error response:', responseError);
    }
  }
}
