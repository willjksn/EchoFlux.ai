import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkApiKeys, getVerifyAuth, withErrorHandling } from "./_errorHandler.js";
import { APP_KNOWLEDGE } from "./appKnowledge.js";
import { enforceRateLimit } from "./_rateLimit.js";
import { sanitizeForAI } from "./_inputSanitizer.js";

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Check API keys early
  const apiKeyCheck = checkApiKeys();
  if (!apiKeyCheck.hasKey) {
    res.status(200).json({
      success: false,
      error: "AI not configured",
      note: apiKeyCheck.error,
    });
    return;
  }

  // Dynamic import for auth
  let user;
  try {
    const verifyAuth = await getVerifyAuth();
    user = await verifyAuth(req);
  } catch (authError: any) {
    console.error("verifyAuth error:", authError);
    res.status(200).json({
      success: false,
      error: "Authentication error",
      note: authError?.message || "Failed to verify authentication. Please try logging in again.",
    });
    return;
  }

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Rate limiting: 30 requests per minute per user
  const ok = await enforceRateLimit({
    req,
    res,
    keyPrefix: "askChatbot",
    limit: 30,
    windowMs: 60_000,
    identifier: user.uid,
  });
  if (!ok) return;

  const { question } = (req.body as any) || {};

  if (!question || typeof question !== "string") {
    res.status(400).json({ error: "Missing or invalid 'question'" });
    return;
  }

  // Sanitize input
  const sanitizedQuestion = sanitizeForAI(question, 5000);
  if (!sanitizedQuestion) {
    res.status(400).json({ error: "Question cannot be empty" });
    return;
  }

  // Check if user is admin
  let isAdmin = false;
  try {
    const { getAdminDb } = await import("./_firebaseAdmin.js");
    const db = getAdminDb();
    const userDoc = await db.collection("users").doc(user.uid).get();
    const userData = userDoc.exists ? (userDoc.data() as any) : null;
    isAdmin = userData?.role === "Admin";
  } catch (error) {
    console.error("Failed to check admin status:", error);
    // Continue with non-admin access if check fails
  }

  // Filter knowledge base based on admin status
  let knowledgeBase = APP_KNOWLEDGE;
  if (!isAdmin) {
    // Remove admin section from knowledge base for non-admins
    const adminSectionStart = knowledgeBase.indexOf("## Admin Dashboard & Features");
    if (adminSectionStart !== -1) {
      // Find the end of admin section (look for next major section or end)
      const nextSection = knowledgeBase.indexOf("\n---\n## ", adminSectionStart);
      if (nextSection !== -1) {
        knowledgeBase = knowledgeBase.substring(0, adminSectionStart) + knowledgeBase.substring(nextSection + 5);
      } else {
        // If no next section, remove from admin section to end
        knowledgeBase = knowledgeBase.substring(0, adminSectionStart);
      }
    }
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey!);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    const adminRestriction = !isAdmin ? `
CRITICAL ADMIN RESTRICTION:
- You MUST NOT answer any questions about admin features, admin dashboard, admin tools, or admin functionality.
- If the user asks about admin features, politely decline and say: "I can only answer questions about admin features if you have admin access. Please contact support if you need admin assistance."
- Do NOT provide any information about:
  - Admin Dashboard
  - User management
  - Admin tools (Tavily searches, invite codes, announcements, etc.)
  - Review management
  - Model usage analytics
  - Any admin-only features
- Redirect non-admin users asking about admin features to contact support.
` : "";

    const prompt = `
You are EchoFlux.ai's built-in assistant.

CRITICAL PRODUCT LIMITS (DO NOT MISREPRESENT):
- EchoFlux.ai is currently a creator-focused AI Content Studio & Campaign Planner (offline/planning-first).
- Do NOT claim the app provides social listening or competitor tracking in the current version.
- Do NOT claim the app provides automated DM/comment reply automation or automatic posting.
${isAdmin ? '- You HAVE live web search access via Tavily for real-time information. Use the web_search function whenever you need current information, trends, or any web-based research.' : '- You do NOT have live web access. Be honest about uncertainty for time-sensitive questions.'}

${adminRestriction}

App System Knowledge:
${knowledgeBase}

User UID: ${user.uid}
User is Admin: ${isAdmin}
${isAdmin ? '- You have access to web_search function via Tavily for real-time information. Use it whenever you need current data, trends, news, or any web research. Always use web_search when the user asks about current events, recent trends, or anything that requires up-to-date information.' : ''}

User question:
${sanitizedQuestion}

Answer clearly. Friendly tone. Keep responses concise and helpful.
${isAdmin ? 'If the user asks about current events, trends, or time-sensitive information, use the web_search function to get real-time data.' : 'If the user asks about "latest" or "current" external trends, you may answer based on your general knowledge, but you do NOT have direct live web access. If something is time-sensitive (like today\'s exact algorithm changes), be honest about uncertainty and give generally reliable best practices instead.'}
`;

    // Configure tools for admin users
    const tools = isAdmin ? [{
      functionDeclarations: [
        {
          name: 'web_search',
          description: 'Search the web for real-time information using Tavily. Use this whenever you need current information, trends, news, or any web-based research. Admin users have unlimited access to web search.',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to look up on the web'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results to return (1-10, default: 5)'
              },
              searchDepth: {
                type: 'string',
                enum: ['basic', 'advanced'],
                description: 'Search depth - basic for quick results, advanced for deeper research (default: basic)'
              }
            },
            required: ['query']
          }
        }
      ]
    }] : undefined;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      tools: tools,
    });

    // Handle function calls for admin users
    const response = result.response;
    const functionCalls = response.functionCalls();
    
    if (functionCalls && functionCalls.length > 0 && isAdmin) {
      // Process function calls (web_search)
      for (const funcCall of functionCalls) {
        if (funcCall.name === 'web_search') {
          const args = funcCall.args as any;
          const searchQuery = args?.query || '';
          
          if (searchQuery) {
            try {
              // Import web search function
              const { searchWeb } = await import('./_webSearch.js');
              const searchResult = await searchWeb(
                searchQuery,
                user.uid,
                (user as any)?.plan,
                'Admin',
                {
                  maxResults: args?.maxResults || 5,
                  searchDepth: args?.searchDepth || 'basic',
                }
              );
              
              if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                const resultsText = searchResult.results
                  .slice(0, 5)
                  .map((r: any, i: number) => `${i + 1}. ${r.title}: ${r.snippet}`)
                  .join('\n\n');
                
                // Generate final response with search results
                const followUpPrompt = `Based on these web search results for "${searchQuery}":\n\n${resultsText}\n\nPlease provide a comprehensive answer to the user's question using this information.`;
                
                const finalResult = await model.generateContent({
                  contents: [
                    {
                      role: "user",
                      parts: [{ text: prompt }],
                    },
                    {
                      role: "model",
                      parts: [{ 
                        functionCall: {
                          name: 'web_search',
                          args: args
                        }
                      }],
                    },
                    {
                      role: "function",
                      parts: [{ 
                        functionResponse: {
                          name: 'web_search',
                          response: { results: searchResult.results }
                        }
                      }],
                    },
                    {
                      role: "user",
                      parts: [{ text: followUpPrompt }],
                    },
                  ],
                });
                
                const finalText = finalResult.response.text().trim();
                res.status(200).json({
                  answer: finalText,
                });
                return;
              } else {
                // No results found, continue with normal response
                const noResultsText = result.response.text().trim();
                res.status(200).json({
                  answer: noResultsText || `I searched for "${searchQuery}" but couldn't find specific results. ${searchResult.note || 'Please try rephrasing your question.'}`,
                });
                return;
              }
            } catch (searchErr: any) {
              console.error('[askChatbot] Web search error:', searchErr);
              // Fall through to normal response if search fails
            }
          }
        }
      }
    }

    const text = response.text().trim();

    res.status(200).json({
      answer: text,
    });
    return;
  } catch (err: any) {
    console.error("askChatbot error:", err);
    res.status(200).json({
      success: false,
      error: "Failed to answer chatbot question",
      note: err?.message || "An unexpected error occurred. Please try again.",
      details: process.env.NODE_ENV === "development" ? err?.stack : undefined,
    });
    return;
  }
}

export default withErrorHandling(handler);
